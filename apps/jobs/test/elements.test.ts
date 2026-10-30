import { env } from "./runtime";
import { applyMigrations } from "./runtime";
import { beforeAll, expect, it } from "bun:test";
import { approvedReferences, missingViews } from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import {
  addElementReference,
  createElement,
  createElementState,
  createPendingMediaAsset,
  createProject,
  createRevision,
  markMediaAssetReady,
  setRevisionStatus,
  settleRevisionForJob,
  updateElementReference,
} from "@open-cinema/database/mutations";
import {
  getElement,
  getElementsByHandles,
  getRevisionForJob,
  listMediaAssets,
  listRevisions,
} from "@open-cinema/database/queries";

beforeAll(() => applyMigrations(env.DB, env.TEST_MIGRATIONS));

async function readyUpload(
  db: ReturnType<typeof createDatabase>,
  owner: { ownerId: string },
  mediaType = "image/png",
) {
  const id = crypto.randomUUID();
  await createPendingMediaAsset(db, owner, {
    id,
    r2Key: `uploads/${owner.ownerId}/${id}`,
    filename: "mara-front.png",
    mediaType,
    sizeBytes: 1024,
  });
  return markMediaAssetReady(db, owner, id, { sizeBytes: 1024, etag: "e1" });
}

it("authors an Element sheet with owner-checked references, approval versioning, and states", async () => {
  const db = createDatabase(env.DB);
  const owner = { ownerId: crypto.randomUUID() };
  const stranger = { ownerId: crypto.randomUUID() };
  const project = await createProject(db, owner, { name: "Harbor film" });

  const mara = await createElement(db, owner, {
    type: "character",
    name: "Mara Vey",
    projectId: project.id,
  });
  expect(mara).toMatchObject({ handle: "MaraVey", version: 1 });
  const second = await createElement(db, owner, {
    type: "character",
    name: "Mara Vey",
  });
  expect(second.handle).toBe("MaraVey2");
  // Handles are per owner.
  expect(
    (await createElement(db, stranger, { type: "thing", name: "Mara Vey" }))
      .handle,
  ).toBe("MaraVey");

  const upload = await readyUpload(db, owner);
  expect(upload?.status).toBe("ready");
  const theirs = await readyUpload(db, stranger);
  await expect(
    addElementReference(db, owner, {
      elementId: mara.id,
      asset: { type: "media-asset", assetId: theirs!.id },
    }),
  ).rejects.toThrow("not available");

  const withExperiment = await addElementReference(db, owner, {
    elementId: mara.id,
    asset: { type: "media-asset", assetId: upload!.id },
    view: "front",
    roles: ["identity"],
  });
  expect(withExperiment?.version).toBe(1);
  expect(approvedReferences(withExperiment!)).toEqual([]);

  const approved = await updateElementReference(db, owner, {
    id: withExperiment!.references[0]!.id,
    status: "approved",
  });
  expect(approved?.version).toBe(2);
  expect(approvedReferences(approved!)).toHaveLength(1);
  expect(missingViews(approved!)).not.toContain("front");
  expect(
    await updateElementReference(db, stranger, {
      id: withExperiment!.references[0]!.id,
      status: "rejected",
    }),
  ).toBeNull();

  const withState = await createElementState(db, owner, {
    elementId: mara.id,
    name: "Rain-soaked",
  });
  const state = withState!.states[0]!;
  const stateUpload = await readyUpload(db, owner);
  const sheet = await addElementReference(db, owner, {
    elementId: mara.id,
    stateId: state.id,
    asset: { type: "media-asset", assetId: stateUpload!.id },
    status: "approved",
  });
  expect(approvedReferences(sheet!)).toHaveLength(1);
  expect(approvedReferences(sheet!, state.id)).toHaveLength(2);
  await expect(
    addElementReference(db, owner, {
      elementId: second.id,
      stateId: state.id,
      asset: { type: "media-asset", assetId: stateUpload!.id },
    }),
  ).rejects.toThrow("different Element");

  const mentioned = await getElementsByHandles(db, owner, [
    "MaraVey",
    "Nobody",
  ]);
  expect(mentioned.map((e) => e.id)).toEqual([mara.id]);
  expect(await getElement(db, stranger, mara.id)).toBeNull();
});

it("lists only ready uploads and rejects unsupported media", async () => {
  const db = createDatabase(env.DB);
  const owner = { ownerId: crypto.randomUUID() };
  await readyUpload(db, owner, "video/mp4");
  await createPendingMediaAsset(db, owner, {
    id: crypto.randomUUID(),
    r2Key: `uploads/${owner.ownerId}/pending`,
    filename: "pending.mp4",
    mediaType: "video/mp4",
    sizeBytes: 10,
  });
  expect(await listMediaAssets(db, owner)).toHaveLength(1);
  expect(await listMediaAssets(db, owner, { kind: "image" })).toHaveLength(0);
  await expect(
    createPendingMediaAsset(db, owner, {
      id: crypto.randomUUID(),
      r2Key: `uploads/${owner.ownerId}/x`,
      filename: "x.gif",
      mediaType: "image/gif",
      sizeBytes: 10,
    }),
  ).rejects.toThrow("Unsupported");
});

it("stores a Location's moving reference as a clip and keeps clips and stills apart", async () => {
  const db = createDatabase(env.DB);
  const owner = { ownerId: crypto.randomUUID() };
  const mill = await createElement(db, owner, {
    type: "location",
    name: "Tide Mill",
  });
  const clip = await readyUpload(db, owner, "video/mp4");
  const still = await readyUpload(db, owner);
  const moving = await addElementReference(db, owner, {
    elementId: mill.id,
    asset: { type: "media-asset", assetId: clip!.id },
    status: "approved",
    view: "push-in",
  });
  expect(moving!.references[0]).toMatchObject({ view: "push-in" });
  // Stills ignore the clip; the move is read on its own.
  expect(approvedReferences(moving!)).toEqual([]);
  await expect(
    updateElementReference(db, owner, {
      id: moving!.references[0]!.id,
      view: "establishing",
    }),
  ).rejects.toThrow("A clip can only show a move");
  await expect(
    addElementReference(db, owner, {
      elementId: mill.id,
      asset: { type: "media-asset", assetId: still!.id },
      view: "drift",
    }),
  ).rejects.toThrow("A moving reference is a clip");
  await expect(
    addElementReference(db, owner, {
      elementId: mill.id,
      asset: { type: "media-asset", assetId: clip!.id },
      view: "establishing",
    }),
  ).rejects.toThrow("Reference sheets hold images");
  const cal = await createElement(db, owner, {
    type: "character",
    name: "Cal",
  });
  await expect(
    addElementReference(db, owner, {
      elementId: cal.id,
      asset: { type: "media-asset", assetId: clip!.id },
      view: "push-in",
    }),
  ).rejects.toThrow("Only a Location");
});

it("keeps the original linked while a revision moves from pending to kept", async () => {
  const db = createDatabase(env.DB);
  const owner = { ownerId: crypto.randomUUID() };
  const source = await readyUpload(db, owner, "video/mp4");
  const ref = { type: "media-asset" as const, assetId: source!.id };
  const jobId = crypto.randomUUID();
  const revision = await createRevision(db, owner, {
    source: ref,
    workflowKind: "video.background-replace",
    intent: "Move this scene to @Harbor at dusk",
    jobId,
  });
  expect(revision.status).toBe("pending");
  // Pending revisions cannot be kept before a result exists.
  expect(
    await setRevisionStatus(db, owner, { id: revision.id, status: "kept" }),
  ).toBeNull();
  await settleRevisionForJob(db, owner, jobId, {
    result: { jobId, outputId: "out-1" },
  });
  // Settling is idempotent and a later failure cannot overwrite a result.
  await settleRevisionForJob(db, owner, jobId, { failed: true });
  expect(await getRevisionForJob(db, owner, jobId)).toMatchObject({
    status: "proposed",
    source: ref,
    result: { type: "job-output", jobId, outputId: "out-1" },
  });
  expect(
    (await setRevisionStatus(db, owner, { id: revision.id, status: "kept" }))
      ?.status,
  ).toBe("kept");
  expect(await listRevisions(db, owner, { source: ref })).toHaveLength(1);
  expect(
    await listRevisions(db, { ownerId: "stranger" }, { source: ref }),
  ).toEqual([]);
});
