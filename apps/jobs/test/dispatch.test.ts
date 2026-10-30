import type { Coordinator } from "./runtime";
import { env } from "./runtime";
import {
  restartJobs,
  applyMigrations,
  reset,
  runWake,
  withCoordinator,
} from "./runtime";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
} from "bun:test";
import { setupNetwork } from "./runtime";
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
  createElementState,
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
  await applyMigrations(env.DB, env.TEST_MIGRATIONS);
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
function accepted(result: CommandResult) {
  if (!result.ok) throw new Error(result.error);
  return structuredClone(result.snapshot.jobs[0]!);
}
async function due(stub: ReturnType<typeof fixture>["stub"]) {
  await withCoordinator(stub, async (_, state) => {
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
  await runWake(stub);
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
  const command = {
    idempotencyKey: crypto.randomUUID(),
    request: {
      workflowKind: "image.flux" as const,
      inputs: {
        prompt: "@Mara waits at the harbor before sunrise, @Unknown nearby",
        aspectRatio: "16:9" as const,
      },
    },
  };
  const first = await stub.submit(scope, command);
  const job = accepted(first);
  // A retry with the same key names the job it maps to.
  const retry = await stub.submit(scope, command);
  expect(retry).toMatchObject({ ok: true, jobId: job.id });
  expect(job).toMatchObject({
    workflowKind: "image.flux",
    model: "FLUX 3 Image",
    state: "queued",
  });
  const stored = await withCoordinator(stub, (_, state) =>
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
      // No references reach FLUX here, so the mention says who Mara is.
      prompt:
        "Mara (Tall courier with a scar over her left brow) waits at the harbor before sunrise, @Unknown nearby",
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
  const stored = await withCoordinator(stub, (_, state) =>
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
  await withCoordinator(stub, async (_, state) => {
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
    await state.storage.put("coordinator", record);
  });
  await restartJobs();
  stub = env.GENERATION_COORDINATORS.getByName(scope.ownerId);
  const upgraded = await withCoordinator(stub, (_, state) =>
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

it("reports whether Comfy credentials are configured without revealing them", async () => {
  const status = await fixture().stub.getProviderStatus();
  expect(status).toEqual({ comfyConfigured: true });
});

const cloudOutput = (node_id: string, id: string) => ({
  node_id,
  name: `${node_id}.mp4`,
  type: "video",
  content_type: "video/mp4",
  size_bytes: 10,
  id,
  hash: null,
  url: `https://cloud-media.test/${id}`,
  url_expires_at: new Date(Date.now() + 60_000).toISOString(),
});
const cloudJob = (status: string, outputs: unknown[] = []) => ({
  id: "cloud-job-1",
  status,
  created_at: new Date().toISOString(),
  started_at: null,
  completed_at: null,
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  queue_position: null,
  progress: null,
  outputs,
  error: null,
  urls: {},
});
/**
 * A stored take and background plate staged through Comfy storage (local
 * development has no public media origin), and a Comfy Cloud that takes asset
 * uploads and queues `cloud-job-1`.
 */
async function ltxAlpha(scope: { ownerId: string }) {
  const db = createDatabase(env.DB);
  async function stored(name: string, mediaType: string) {
    const bytes = new TextEncoder().encode(`${name} bytes`);
    const id = crypto.randomUUID();
    const r2Key = `uploads/${scope.ownerId}/${id}`;
    await env.GENERATED_ASSETS.put(r2Key, bytes, {
      httpMetadata: { contentType: mediaType },
    });
    await createPendingMediaAsset(db, scope, {
      id,
      r2Key,
      filename: name,
      mediaType,
      sizeBytes: bytes.length,
    });
    await markMediaAssetReady(db, scope, id, {
      sizeBytes: bytes.length,
      etag: "e",
    });
    return id;
  }
  const take = await stored("take.mp4", "video/mp4");
  const plate = await stored("harbor.png", "image/png");
  const staged = new Map<string, Uint8Array>();
  network.use(
    http.post(
      "https://api.comfy.org/customers/storage",
      async ({ request }) => {
        const { file_name } = (await request.json()) as { file_name: string };
        return HttpResponse.json({
          upload_url: `https://storage.test/up/${file_name}`,
          download_url: `https://storage.test/down/${file_name}`,
        });
      },
    ),
    http.put("https://storage.test/up/:name", async ({ request, params }) => {
      staged.set(
        String(params.name),
        new Uint8Array(await request.arrayBuffer()),
      );
      return new HttpResponse(null, { status: 200 });
    }),
    http.get("https://storage.test/down/:name", ({ params }) => {
      const bytes = staged.get(String(params.name));
      return bytes
        ? new HttpResponse(bytes, {
            headers: { "Content-Length": String(bytes.length) },
          })
        : new HttpResponse(null, { status: 404 });
    }),
  );
  const uploads: { path: string; type: string; body: string }[] = [];
  const jobs: unknown[] = [];
  network.use(
    http.head(
      "https://cloud.comfy.org/api/v2/assets/by-hash/:hash",
      () => new HttpResponse(null, { status: 404 }),
    ),
    http.post("https://cloud.comfy.org/api/v2/assets", async ({ request }) => {
      const form = await request.formData();
      const file = form.get("file") as File;
      uploads.push({
        path: String(form.get("file_path")),
        type: String(form.get("content_type")),
        body: await file.text(),
      });
      return HttpResponse.json(
        {
          id: `asset-${uploads.length}`,
          hash: form.get("expected_hash"),
          size_bytes: file.size,
          content_type: String(form.get("content_type")),
          created_at: new Date().toISOString(),
          url: "https://cloud-media.test/upload",
          url_expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        { status: 201 },
      );
    }),
    http.post("https://cloud.comfy.org/api/v2/jobs", async ({ request }) => {
      jobs.push(await request.json());
      return HttpResponse.json(cloudJob("queued"), { status: 201 });
    }),
  );
  const command = () => ({
    idempotencyKey: crypto.randomUUID(),
    request: {
      workflowKind: "video.background-replace" as const,
      inputs: {
        source: { type: "media-asset" as const, assetId: take },
        background: { type: "media-asset" as const, assetId: plate },
        preservation: {
          preserve: ["foreground" as const, "performance" as const],
        },
        pipeline: "ltx-alpha" as const,
      },
    },
  });
  return { uploads, jobs, command };
}

it("runs LTX 2.5 Alpha Gen on Comfy Cloud with uploaded media and lists the composite first", async () => {
  const { scope, stub } = fixture();
  const { uploads, jobs, command } = await ltxAlpha(scope);
  const job = accepted(await stub.submit(scope, command()));
  expect(job.model).toBe("LTX 2.5 Alpha Gen");
  await due(stub);

  expect(uploads).toEqual([
    { path: "source.mp4", type: "video/mp4", body: "take.mp4 bytes" },
    { path: "background.png", type: "image/png", body: "harbor.png bytes" },
  ]);
  const { workflow } = jobs[0] as {
    workflow: Record<string, { inputs: Record<string, unknown> }>;
  };
  expect(workflow.source!.inputs.file).toMatchObject({
    __type: "core/ASSET",
    info: { id: "asset-1" },
  });
  expect(workflow.background_image!.inputs.image).toMatchObject({
    __type: "core/ASSET",
    info: { id: "asset-2" },
  });
  const record = await withCoordinator(stub, (_, state) =>
    readCoordinator(state.storage),
  );
  const execution = record!.executions[job.id]!;
  expect(execution.provider).toBe("cloud-workflow");
  // Only the pipeline id is kept; the graph and its media links are rebuilt.
  expect(execution.workflow).toEqual({
    model: "comfy-cloud/ltx-2.5-alpha-gen",
  });
  expect(record!.jobs[0]!.providerJobId).toBe("cloud-job-1");

  network.use(
    http.get("https://cloud.comfy.org/api/v2/jobs/cloud-job-1", () =>
      HttpResponse.json(
        cloudJob("succeeded", [
          cloudOutput("source", "loader-preview"),
          cloudOutput("save_matte", "matte"),
          cloudOutput("save_composite", "composite"),
        ]),
      ),
    ),
  );
  await due(stub);
  const done = await withCoordinator(stub, (_, state) =>
    readCoordinator(state.storage),
  );
  expect(done!.jobs[0]!.outputs.map((o) => o.providerAssetId)).toEqual([
    "composite",
    "matte",
  ]);
});

it("retries a Cloud submission whose media upload fails before the prompt is posted", async () => {
  const { scope, stub } = fixture();
  const { uploads, jobs, command } = await ltxAlpha(scope);
  let unavailable = 1;
  network.use(
    http.post("https://cloud.comfy.org/api/v2/assets", () =>
      unavailable-- > 0
        ? HttpResponse.json({ message: "starting" }, { status: 503 })
        : undefined,
    ),
  );
  accepted(await stub.submit(scope, command()));
  await due(stub);
  // Nothing reached Cloud's job queue, so the job simply waits to try again.
  expect(jobs).toHaveLength(0);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe("queued");
  await due(stub);
  expect(jobs).toHaveLength(1);
  expect(uploads).toHaveLength(2);
  expect((await stub.getSnapshot(scope))?.jobs[0]).toMatchObject({
    state: "queued",
    providerJobId: "cloud-job-1",
  });
});

it("returns a Cloud job to the queue when its request cannot be built", async () => {
  const { scope, stub } = fixture();
  const { jobs, command } = await ltxAlpha(scope);
  let unavailable = 1;
  network.use(
    http.post("https://api.comfy.org/customers/storage", () =>
      unavailable-- > 0
        ? HttpResponse.json({ error: "busy" }, { status: 503 })
        : undefined,
    ),
  );
  accepted(await stub.submit(scope, command()));
  await due(stub);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe("queued");
  await due(stub);
  expect(jobs).toHaveLength(1);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.providerJobId).toBe(
    "cloud-job-1",
  );
});

it("fails a Cloud job that succeeds without saving an output instead of retrying storage", async () => {
  const { scope, stub } = fixture();
  const { command } = await ltxAlpha(scope);
  accepted(await stub.submit(scope, command()));
  await due(stub);
  // Only the loader's preview, which is not one of the graph's saved results.
  network.use(
    http.get("https://cloud.comfy.org/api/v2/jobs/cloud-job-1", () =>
      HttpResponse.json(
        cloudJob("succeeded", [cloudOutput("source", "loader-preview")]),
      ),
    ),
  );
  await due(stub);
  expect((await stub.getSnapshot(scope))?.jobs[0]).toMatchObject({
    state: "failed",
    outputs: [],
    error: expect.stringContaining("without a usable output"),
  });
});

it("combines one state per kind in a mention and writes the shot's direction into the prompt", async () => {
  const { scope, stub } = fixture();
  const db = createDatabase(env.DB);
  const cal = await createElement(db, scope, {
    type: "character",
    name: "Cal",
    description: "Wiry fisherman in his fifties with a grey beard",
  });
  await createElementState(db, scope, {
    elementId: cal.id,
    name: "Wet",
    description: "soaked hair and dripping oilskin",
    kind: "condition",
  });
  await createElementState(db, scope, {
    elementId: cal.id,
    name: "Frightened",
    description: "wide eyes, jaw clenched",
    kind: "emotion",
  });
  await createElementState(db, scope, {
    elementId: cal.id,
    name: "Dry",
    kind: "condition",
  });
  const withStates = (await import("@open-cinema/database/queries")).getElement;
  const element = (await withStates(db, scope, cal.id))!;
  const id = (name: string) => element.states.find((s) => s.name === name)!.id;
  const bodies = captureSubmissions();
  const job = accepted(
    await stub.submit(scope, {
      idempotencyKey: crypto.randomUUID(),
      request: {
        workflowKind: "image.flux",
        inputs: {
          prompt: "@Cal:wet+frightened grips the rail of the boat",
          aspectRatio: "16:9",
          mentions: [
            {
              elementId: cal.id,
              stateId: id("Wet"),
              stateIds: [id("Frightened")],
            },
          ],
          // A stored legacy project look still sits under the shot's look.
          direction: {
            project: {
              id: "p1",
              name: "Storm",
              look: { palette: "cool-muted", lighting: "golden-hour" },
            },
            overrides: { lighting: "low-key" },
            shot: { framing: "close-up" },
          },
        },
      },
    }),
  );
  const stored = await withCoordinator(stub, (_, state) =>
    readCoordinator(state.storage),
  );
  expect(stored!.executions[job.id]!.mentions[0]).toMatchObject({
    stateName: "Wet, Frightened",
    states: [
      expect.objectContaining({ name: "Wet", kind: "condition" }),
      expect.objectContaining({ name: "Frightened", kind: "emotion" }),
    ],
  });
  await due(stub);
  expect(bodies).toHaveLength(1);
  expect((bodies[0] as { prompt: string }).prompt).toBe(
    "Cal (Wiry fisherman in his fifties with a grey beard; wet, frightened: soaked hair and dripping oilskin; wide eyes, jaw clenched) grips the rail of the boat. " +
      "Close-up shot, the face filling the frame; a desaturated, cool blue-grey palette; low-key chiaroscuro lighting, one motivated source, deep shadows.",
  );

  // Two states of the same kind cannot combine.
  const clash = await stub.submit(scope, {
    idempotencyKey: crypto.randomUUID(),
    request: {
      workflowKind: "image.flux",
      inputs: {
        prompt: "@Cal on the quay",
        mentions: [
          { elementId: cal.id, stateId: id("Wet"), stateIds: [id("Dry")] },
        ],
      },
    },
  });
  expect(clash).toMatchObject({
    ok: false,
    error: expect.stringContaining("both condition states"),
  });
});
