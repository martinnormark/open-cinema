import { env } from "cloudflare:workers";
import {
  abortAllDurableObjects,
  applyD1Migrations,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import type { CommandResult, Job } from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import {
  COORDINATOR_SCHEMA_VERSION,
  mutateCoordinator,
  readCoordinator,
} from "@open-cinema/database/durable";
import {
  addElementReference,
  applyJobSnapshot,
  createElement,
  createPendingMediaAsset,
  markMediaAssetReady,
} from "@open-cinema/database/mutations";
import { getJob, getRevision } from "@open-cinema/database/queries";
import { coordinatorRecordSchema } from "@open-cinema/database/durable";

const network = setupNetwork();
beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(async () => {
  network.use(
    http.all("https://api.comfy.org/*", () =>
      HttpResponse.json({ error: { code: "unhandled" } }, { status: 503 }),
    ),
  );
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
afterEach(async () => {
  await reset();
  network.resetHandlers();
});

const base = "https://api.comfy.org/v2/models/bfl/flux-3-image/requests";
function fixture() {
  const ownerId = crypto.randomUUID();
  return {
    scope: { ownerId },
    stub: env.GENERATION_COORDINATORS.getByName(ownerId),
  };
}
function accepted(result: CommandResult & Partial<Disposable>) {
  try {
    if (!result.ok) throw new Error(result.error);
    return structuredClone(result.snapshot.jobs[0]!);
  } finally {
    result[Symbol.dispose]?.();
  }
}
async function due(stub: ReturnType<typeof fixture>["stub"]) {
  await runInDurableObject(stub, async (_, state) => {
    const record = await readCoordinator(state.storage);
    await mutateCoordinator(
      state.storage,
      { ownerId: record!.ownerId },
      (r) => {
        for (const entry of Object.values(r.executions))
          entry.nextAttemptAt = 0;
      },
    );
  });
  await runDurableObjectAlarm(stub);
}
function captureSubmissions() {
  const bodies: unknown[] = [];
  network.use(
    http.post(base, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ request_id: "provider-1" }, { status: 202 });
    }),
  );
  return bodies;
}

it("dispatches a typed image.flux command, snapshotting mentioned Elements without persisting the provider input", async () => {
  const { scope, stub } = fixture();
  const db = createDatabase(env.DB);
  const mara = await createElement(db, scope, {
    type: "character",
    name: "Mara",
    description: "Tall courier with a scar over her left brow",
  });
  const bodies = captureSubmissions();
  const job = accepted(
    await stub.submit(scope, {
      idempotencyKey: crypto.randomUUID(),
      request: {
        workflowKind: "image.flux",
        inputs: {
          prompt: "@Mara waits at the harbor before sunrise, @Unknown nearby",
          aspectRatio: "16:9",
        },
      },
    }),
  );
  expect(job).toMatchObject({
    workflowKind: "image.flux",
    model: "FLUX 3 Image",
    state: "queued",
  });
  const stored = await runInDurableObject(stub, (_, state) =>
    readCoordinator(state.storage),
  );
  const execution = stored!.executions[job.id]!;
  expect(execution.workflow).toEqual({ model: "bfl/flux-3-image" });
  expect(execution.mentions).toEqual([
    expect.objectContaining({ elementId: mara.id, handle: "Mara", version: 1 }),
  ]);

  await due(stub);
  expect(bodies).toEqual([
    {
      prompt: "Mara waits at the harbor before sunrise, @Unknown nearby",
      aspect_ratio: "16:9",
      resolution: "1k",
      grounding: false,
    },
  ]);
  const projected = await getJob(db, scope, job.id);
  expect(projected).toMatchObject({
    workflowKind: "image.flux",
    providerJobId: "provider-1",
  });
});

it("sends a mentioned Element's approved references inline for image.flux-reference", async () => {
  const { scope, stub } = fixture();
  const db = createDatabase(env.DB);
  const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const id = crypto.randomUUID();
  const r2Key = `uploads/${scope.ownerId}/${id}`;
  await env.GENERATED_ASSETS.put(r2Key, bytes, {
    httpMetadata: { contentType: "image/png" },
  });
  await createPendingMediaAsset(db, scope, {
    id,
    r2Key,
    filename: "mara.png",
    mediaType: "image/png",
    sizeBytes: bytes.length,
  });
  await markMediaAssetReady(db, scope, id, {
    sizeBytes: bytes.length,
    etag: "e",
  });
  const mara = await createElement(db, scope, {
    type: "character",
    name: "Mara",
  });
  await addElementReference(db, scope, {
    elementId: mara.id,
    asset: { type: "media-asset", assetId: id },
    status: "approved",
    view: "front",
  });
  const bodies = captureSubmissions();
  accepted(
    await stub.submit(scope, {
      idempotencyKey: crypto.randomUUID(),
      request: {
        workflowKind: "image.flux-reference",
        inputs: { prompt: "@Mara in a rain-soaked alley" },
      },
    }),
  );
  await due(stub);
  expect(bodies).toEqual([
    {
      prompt: "Mara in a rain-soaked alley",
      aspect_ratio: "auto",
      resolution: "1k",
      grounding: false,
      images: [btoa(String.fromCharCode(...bytes))],
    },
  ]);
  // Inline media lives only in the provider request, never in the checkpoint.
  const stored = await runInDurableObject(stub, (_, state) =>
    readCoordinator(state.storage),
  );
  expect(JSON.stringify(stored)).not.toContain(
    btoa(String.fromCharCode(...bytes)),
  );
});

it("rejects malformed commands and mentions of Elements the owner cannot use", async () => {
  const { scope, stub } = fixture();
  const stranger = { ownerId: crypto.randomUUID() };
  const theirs = await createElement(createDatabase(env.DB), stranger, {
    type: "location",
    name: "Harbor",
  });
  expect(
    await stub.submit(scope, {
      idempotencyKey: crypto.randomUUID(),
      request: {
        workflowKind: "image.flux",
        inputs: {
          prompt: "A quiet pier",
          mentions: [{ elementId: theirs.id }],
        },
      },
    }),
  ).toEqual({
    ok: false,
    error: "A mentioned Element is no longer available.",
  });
  expect(
    await stub.submit(scope, {
      idempotencyKey: crypto.randomUUID(),
      request: { workflowKind: "image.flux", inputs: { prompt: "" } },
    }),
  ).toMatchObject({ ok: false, error: expect.stringContaining("incomplete") });
  expect((await stub.getSnapshot(scope))?.jobs).toEqual([]);
});

it("upgrades a v4 Router checkpoint and submits its stored request unchanged", async () => {
  let { scope, stub } = fixture();
  const bodies = captureSubmissions();
  accepted(
    await stub.submit(scope, {
      idempotencyKey: crypto.randomUUID(),
      prompt: "A red fox in fresh snow",
    }),
  );
  const legacyInput = {
    prompt: "A red fox in fresh snow",
    aspect_ratio: "1:1",
    resolution: "1k",
    grounding: false,
  };
  await runInDurableObject(stub, async (_, state) => {
    const record = JSON.parse(
      JSON.stringify(await readCoordinator(state.storage)),
    );
    record.schemaVersion = 4;
    const [id] = Object.keys(record.executions);
    const execution = record.executions[id!];
    execution.command = {
      idempotencyKey: execution.command.idempotencyKey,
      prompt: "A red fox in fresh snow",
    };
    execution.workflow = { model: "bfl/flux-3-image", input: legacyInput };
    delete execution.workflowKind;
    delete execution.mentions;
    delete record.jobs[0].workflowKind;
    delete record.jobs[0].projectId;
    await state.storage.put("coordinator", record);
  });
  await abortAllDurableObjects();
  stub = env.GENERATION_COORDINATORS.getByName(scope.ownerId);
  const upgraded = await runInDurableObject(stub, (_, state) =>
    readCoordinator(state.storage),
  );
  expect(upgraded?.schemaVersion).toBe(COORDINATOR_SCHEMA_VERSION);
  const execution = Object.values(upgraded!.executions)[0]!;
  expect(execution.workflowKind).toBe("image.flux");
  expect(execution.command.request).toMatchObject({
    workflowKind: "image.flux",
    inputs: { prompt: "A red fox in fresh snow" },
  });
  await due(stub);
  expect(bodies).toEqual([legacyInput]);
});

it("projects a selective revision with its job and settles it once the result is saved", async () => {
  const scope = { ownerId: crypto.randomUUID() };
  const db = createDatabase(env.DB);
  const now = new Date().toISOString();
  const source = { type: "media-asset" as const, assetId: "source-clip" };
  const record = coordinatorRecordSchema.parse({
    schemaVersion: COORDINATOR_SCHEMA_VERSION,
    ownerId: scope.ownerId,
    sequence: 1,
    jobs: [],
    executions: {
      "job-1": {
        provider: "router",
        workflowKind: "video.background-replace",
        command: {
          idempotencyKey: crypto.randomUUID(),
          request: {
            workflowKind: "video.background-replace",
            inputs: {
              source,
              prompt: "Move this scene to the harbor at dusk",
              preservation: { preserve: ["foreground", "performance"] },
            },
          },
          revision: { intent: "Move this scene to @Harbor at dusk" },
        },
        requestHash: "hash",
        workflow: { model: "bria/video-edit-replace-background" },
        submissionKey: "key",
        nextAttemptAt: 0,
        deadline: 0,
        attempts: 0,
        pendingProjection: true,
        cancelRequested: false,
      },
    },
  });
  const execution = record.executions["job-1"]!;
  const job: Job = {
    id: "job-1",
    ownerId: scope.ownerId,
    state: "running",
    version: 1,
    providerJobId: "p",
    createdAt: now,
    updatedAt: now,
    error: null,
    prompt: "Move this scene to the harbor at dusk",
    model: "Bria",
    workflowKind: "video.background-replace",
    projectId: null,
    seed: null,
    progress: null,
    outputs: [],
  };
  await applyJobSnapshot(db, job, execution);
  expect(await getRevision(db, scope, "job-1")).toMatchObject({
    status: "pending",
    source,
    result: null,
    intent: "Move this scene to @Harbor at dusk",
  });
  const output = {
    id: "job-1:video",
    jobId: "job-1",
    providerAssetId: "video",
    mediaType: "video/mp4",
    r2Key: "outputs/job-1/video",
    sizeBytes: 10,
    etag: "e",
  };
  await applyJobSnapshot(
    db,
    { ...job, state: "succeeded", version: 2, outputs: [output] },
    execution,
  );
  // A delayed, older projection cannot regress the settled revision.
  await applyJobSnapshot(db, { ...job, state: "failed" }, execution);
  expect(await getRevision(db, scope, "job-1")).toMatchObject({
    status: "proposed",
    result: { type: "job-output", jobId: "job-1", outputId: "job-1:video" },
  });
});
