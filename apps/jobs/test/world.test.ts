import { env } from "./runtime";
import { applyMigrations } from "./runtime";
import { beforeAll, expect, it } from "bun:test";
import {
  approvedTake,
  readWorldManifest,
  WorldFormatError,
  WORLD_FORMAT,
} from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import {
  addElementReference,
  addTake,
  createElement,
  createElementState,
  createPendingMediaAsset,
  createProject,
  createRecipe,
  createSequence,
  importWorld,
  markMediaAssetReady,
  updateRecipe,
} from "@open-cinema/database/mutations";
import {
  collectWorld,
  getSequence,
  listElements,
  listRecipes,
} from "@open-cinema/database/queries";

beforeAll(() => applyMigrations(env.DB, env.TEST_MIGRATIONS));

async function readyImage(
  db: ReturnType<typeof createDatabase>,
  owner: { ownerId: string },
  filename = "ref.png",
) {
  const id = crypto.randomUUID();
  await createPendingMediaAsset(db, owner, {
    id,
    r2Key: `uploads/${owner.ownerId}/${id}`,
    filename,
    mediaType: "image/png",
    sizeBytes: 2048,
  });
  await markMediaAssetReady(db, owner, id, { sizeBytes: 2048, etag: "e" });
  return { type: "media-asset" as const, assetId: id };
}

it("carries a project's world to another studio and adapts what does not fit", async () => {
  const db = createDatabase(env.DB);
  const source = { ownerId: crypto.randomUUID() };
  const target = { ownerId: crypto.randomUUID() };

  const project = await createProject(db, source, {
    name: "Harbor",
    direction: "Teal and amber",
    look: { palette: "teal and amber" },
  });
  const mara = await createElement(db, source, {
    type: "character",
    name: "Mara",
    description: "Auburn hair, green coat",
    projectId: project.id,
  });
  const wet = await createElementState(db, source, {
    elementId: mara.id,
    name: "wet",
    kind: "condition",
  });
  const face = await readyImage(db, source, "face.png");
  const rejected = await readyImage(db, source, "bad.png");
  const wetSheet = await readyImage(db, source, "wet.png");
  await addElementReference(db, source, {
    elementId: mara.id,
    asset: face,
    status: "approved",
    view: "face-closeup",
    roles: ["identity"],
  });
  await addElementReference(db, source, {
    elementId: mara.id,
    asset: rejected,
    status: "rejected",
  });
  await addElementReference(db, source, {
    elementId: mara.id,
    stateId: wet!.states[0]!.id,
    asset: wetSheet,
    status: "approved",
    view: "sheet",
  });
  // A studio-wide Element only comes along when the project's shots use it.
  await createElement(db, source, { type: "thing", name: "Lantern" });
  await createElement(db, source, { type: "thing", name: "Unrelated" });
  const rain = await createRecipe(db, source, {
    name: "Rain portrait",
    spec: {
      medium: "image",
      template: "{character} in the rain",
      slots: [{ key: "character", type: "character", label: "Character" }],
    },
  });
  // A second version, so the history has something to carry.
  await updateRecipe(db, source, {
    id: rain.id,
    note: "Add the lantern",
    spec: {
      medium: "image",
      template: "{character} in the rain, by @Lantern light",
      slots: [{ key: "character", type: "character", label: "Character" }],
    },
  });
  const sequence = await createSequence(db, source, {
    projectId: project.id,
    title: "Arrival",
    shots: [{ title: "Door", prompt: "@Mara:wet holds up @Lantern" }],
  });
  const frame = await readyImage(db, source, "frame.png");
  await addTake(db, source, {
    shotId: sequence.shots[0]!.id,
    role: "keyframe",
    origin: "library",
    asset: frame,
    approve: true,
  });

  const collected = await collectWorld(db, source, { projectId: project.id });
  expect(collected).not.toBeNull();
  const { manifest: raw, files } = collected!;
  expect(raw.elements!.map((e) => e.name).sort()).toEqual(["Lantern", "Mara"]);
  // The rejected reference stays behind; the three others travel.
  expect(files).toHaveLength(3);
  expect(
    files.every((f) => f.r2Key.startsWith(`uploads/${source.ownerId}/`)),
  ).toBe(true);
  expect(await collectWorld(db, target, { projectId: project.id })).toBeNull();

  // What another studio would read: JSON, plus a recipe and a result it can't run.
  const json = JSON.parse(
    JSON.stringify({
      ...raw,
      recipes: [
        ...raw.recipes!,
        {
          key: "r-future",
          name: "Hologram",
          spec: {
            medium: "image",
            template: "A hologram",
            capabilities: ["flux-image", "holo-diffusion"],
          },
        },
        { key: "r-broken", name: "Broken", spec: { medium: "audio" } },
      ],
      media: raw.media!.map((m, i) =>
        i === 0
          ? {
              ...m,
              origin: {
                type: "generated",
                workflowKind: "video.hologram",
                model: "holo-1",
                prompt: "x",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            }
          : m,
      ),
    }),
  );
  const manifest = readWorldManifest(json);

  // The target already has a Mara, so the import's Mara becomes Mara2.
  await createElement(db, target, { type: "character", name: "Mara" });
  const uploads: Record<string, string> = {};
  for (const file of files)
    uploads[file.path] = (await readyImage(db, target)).assetId;
  const result = await importWorld(db, target, manifest, uploads);

  expect(result.renamed).toEqual([{ from: "Mara", to: "Mara2" }]);
  expect(result.recipes).toBe(2);
  expect(result.adaptations.map((a) => a.subject)).toEqual([
    "1 result made with “video.hologram”",
    "Recipe “Hologram”",
    "Recipe “Broken”",
  ]);
  const elements = await listElements(db, target, {
    projectId: result.projectId!,
  });
  const imported = elements.find((e) => e.handle === "Mara2")!;
  expect(imported.references.map((r) => r.view).sort()).toEqual([
    "face-closeup",
    "sheet",
  ]);
  expect(imported.references.find((r) => r.view === "sheet")!.stateId).toBe(
    imported.states.find((s) => s.name === "wet")!.id,
  );
  expect(
    (await listRecipes(db, target)).find((r) => r.name === "Hologram")!.spec
      .capabilities,
  ).toEqual(["flux-image"]);
  // A recipe's earlier versions travel, so it can still be compared or restored.
  const rainCopy = (await listRecipes(db, target)).find(
    (r) => r.name === "Rain portrait",
  )!;
  expect(rainCopy.version).toBe(2);
  expect(rainCopy.history.map((h) => [h.version, h.note])).toEqual([
    [1, "Add the lantern"],
  ]);
  expect(rainCopy.history[0]!.spec.template).toBe("{character} in the rain");

  const copy = await getSequence(db, target, result.sequences[0]!.id);
  expect(copy!.projectId).toBe(result.projectId);
  expect(copy!.shots[0]!.prompt).toBe("@Mara2:wet holds up @Lantern");
  expect<unknown>(approvedTake(copy!.shots[0]!, "keyframe")?.asset).toEqual({
    type: "media-asset",
    assetId: uploads[raw.sequences![0]!.shots![0]!.takes![0]!.media],
  });

  // Uploads must be the importer's own.
  await expect(
    importWorld(db, target, manifest, { [files[0]!.path]: face.assetId }),
  ).rejects.toThrow(/did not finish uploading/);
});

it("refuses bundles it cannot read rather than half-importing them", () => {
  expect(() => readWorldManifest({ format: "zip", version: 1 })).toThrow(
    WorldFormatError,
  );
  expect(() =>
    readWorldManifest({ format: WORLD_FORMAT, version: 99 }),
  ).toThrow(/newer Open Cinema/);
  expect(() =>
    readWorldManifest({
      format: WORLD_FORMAT,
      version: 1,
      exportedAt: "now",
      studio: {},
      elements: [
        {
          key: "e",
          type: "character",
          name: "A",
          handle: "A",
          references: [{ media: "media/missing.png", status: "approved" }],
        },
      ],
    }),
  ).toThrow(/media\/missing.png is referenced but not listed/);
});
