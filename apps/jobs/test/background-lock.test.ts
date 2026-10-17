import { env } from "cloudflare:workers";
import {
  applyD1Migrations,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { resultOutputs, type CommandResult } from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import {
  mutateCoordinator,
  readCoordinator,
} from "@open-cinema/database/durable";
import {
  createPendingMediaAsset,
  markMediaAssetReady,
} from "@open-cinema/database/mutations";
import { getRevisionForJob } from "@open-cinema/database/queries";
import { cloudMedia } from "./cloud-media";
import { setRevisionStatus } from "@open-cinema/database/mutations";

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

const bytes = (...values: number[]) => new Uint8Array(values);
const take = bytes(0, 0, 0, 24, 102, 116, 121, 112, 1, 1);
const edit = bytes(0, 0, 0, 24, 102, 116, 121, 112, 2, 2, 2);
const matte = bytes(26, 69, 223, 163, 3, 3, 3, 3);
const rendered = {
  lock: bytes(0, 0, 0, 24, 102, 116, 121, 112, 4),
  conform: bytes(0, 0, 0, 24, 102, 116, 121, 112, 5, 5),
  poster: bytes(82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80),
};

/** A Router model that accepts one submission and completes it with `result`. */
function provider(model: string, id: string, result: Record<string, unknown>) {
  const requests = `https://api.comfy.org/v2/models/${model}/requests`;
  const bodies: Record<string, unknown>[] = [];
  network.use(
    http.post(requests, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json({ request_id: id }, { status: 202 });
    }),
    http.get(`${requests}/${id}/status`, () =>
      HttpResponse.json({ request_id: id, status: "COMPLETED" }),
    ),
    http.get(`${requests}/${id}`, () => HttpResponse.json(result)),
  );
  return bodies;
}
function asset(url: string, body: Uint8Array, contentType: string) {
  network.use(
    http.get(
      url,
      () =>
        new HttpResponse(body, {
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(body.length),
          },
        }),
    ),
  );
}
async function due(stub: DurableObjectStub) {
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
const checkpoint = (stub: DurableObjectStub) =>
  runInDurableObject(stub, (_, state) => readCoordinator(state.storage));
async function stored(r2Key: string | null) {
  const object = await env.GENERATED_ASSETS.get(r2Key!);
  return new Uint8Array(await object!.arrayBuffer());
}

it("locks the source performers over Kling's edit, conforms both variants, and proposes the lock", async () => {
  const ownerId = crypto.randomUUID();
  const scope = { ownerId };
  const stub = env.GENERATION_COORDINATORS.getByName(ownerId);
  const db = createDatabase(env.DB);
  const sourceId = crypto.randomUUID();
  const r2Key = `uploads/${ownerId}/${sourceId}`;
  await env.GENERATED_ASSETS.put(r2Key, take, {
    httpMetadata: { contentType: "video/mp4" },
  });
  await createPendingMediaAsset(db, scope, {
    id: sourceId,
    r2Key,
    filename: "take.mp4",
    mediaType: "video/mp4",
    sizeBytes: take.length,
  });
  await markMediaAssetReady(db, scope, sourceId, {
    sizeBytes: take.length,
    etag: "e",
  });
  // Without a public media origin, the take reaches providers through Comfy storage.
  network.use(
    http.post("https://api.comfy.org/customers/storage", () =>
      HttpResponse.json({
        upload_url: "https://storage.googleapis.com/upload/take.mp4",
        download_url: "https://storage.googleapis.com/signed/take.mp4",
      }),
    ),
    http.put(
      "https://storage.googleapis.com/upload/take.mp4",
      () => new HttpResponse(null, { status: 200 }),
    ),
  );
  const editUrl = "https://v15-kling-fdl.klingai.com/edit.mp4";
  const matteUrl = "https://temp.bria.ai/abc/matte.webm";
  const kling = provider("kling/kling-v3-omni", "kling-1", {
    data: { task_result: { videos: [{ id: "v1", url: editUrl }] } },
  });
  const bria = provider("bria/video-edit-remove-background", "bria-1", {
    status: "COMPLETED",
    result: { video_url: matteUrl },
  });
  asset(editUrl, edit, "video/mp4");
  asset(matteUrl, matte, "video/webm");
  const cloud = cloudMedia(rendered);
  network.use(...cloud.handlers);

  const result: CommandResult = await stub.submit(scope, {
    idempotencyKey: crypto.randomUUID(),
    request: {
      workflowKind: "video.background-replace",
      inputs: {
        source: { type: "media-asset", assetId: sourceId },
        prompt: "a fishing harbor at dusk",
        preservation: {
          preserve: ["foreground", "performance", "timing", "audio"],
          allowIntegration: true,
        },
      },
    },
    revision: { intent: "Move this to a harbor at dusk" },
  });
  if (!result.ok) throw new Error(result.error);
  expect(result.snapshot.jobs[0]).toMatchObject({
    stage: "Replacing the background",
  });

  const stages: (string | null | undefined)[] = [];
  for (let i = 0; i < 12; i++) {
    await due(stub);
    const job = (await checkpoint(stub))!.jobs[0]!;
    if (stages.at(-1) !== job.stage) stages.push(job.stage);
    if (job.state === "succeeded") break;
  }
  const done = (await checkpoint(stub))!.jobs[0]!;
  expect(stages).toEqual([
    "Replacing the background",
    "Matting the performers",
    "Locking the performers to the take",
    null,
  ]);
  expect(done).toMatchObject({ state: "succeeded", stage: null, error: null });

  expect(kling).toHaveLength(1);
  expect(bria).toEqual([
    {
      video: "https://storage.googleapis.com/signed/take.mp4",
      background_color: "Transparent",
      output_container_and_codec: "webm_vp9",
      preserve_audio: false,
    },
  ]);
  // Each step ran as a Comfy Cloud graph over the stored parts.
  expect(
    cloud.runs.map((r) => [r.operation, Object.keys(r.parts).sort()]),
  ).toEqual([
    ["lock", ["edit", "matte", "source"]],
    ["conform", ["edit", "source"]],
  ]);
  expect(cloud.runs[0]!.parts).toEqual({ source: take, edit, matte });
  expect(cloud.runs[0]!.graph.result!.class_type).toBe("ImageCompositeMasked");
  expect(done.outputs.map((o) => o.providerAssetId)).toEqual([
    "v1",
    "matte:video",
    "lock:locked",
    "lock:unlocked",
  ]);
  const [locked, unlocked] = resultOutputs(done.outputs);
  expect(locked!.providerAssetId).toBe("lock:locked");
  expect(unlocked!.providerAssetId).toBe("lock:unlocked");
  expect(await stored(locked!.r2Key)).toEqual(rendered.lock);
  expect(await stored(unlocked!.r2Key)).toEqual(rendered.conform);
  expect(await stored(done.outputs[1]!.r2Key)).toEqual(matte);

  const revision = await getRevisionForJob(db, scope, done.id);
  expect(revision).toMatchObject({
    status: "proposed",
    result: { type: "job-output", jobId: done.id, outputId: locked!.id },
  });

  // Keeping the relit variant switches the result; outputs of other jobs cannot.
  expect(
    await setRevisionStatus(db, scope, {
      id: revision!.id,
      status: "kept",
      resultOutputId: `${crypto.randomUUID()}:lock:locked`,
    }),
  ).toBeNull();
  expect(
    await setRevisionStatus(db, scope, {
      id: revision!.id,
      status: "kept",
      resultOutputId: unlocked!.id,
    }),
  ).toMatchObject({
    status: "kept",
    result: { type: "job-output", jobId: done.id, outputId: unlocked!.id },
  });
}, 30_000);

it("stops for the creator when Comfy Cloud keeps failing the lock, then resumes on Check again", async () => {
  const ownerId = crypto.randomUUID();
  const stub = env.GENERATION_COORDINATORS.getByName(ownerId);
  const db = createDatabase(env.DB);
  const sourceId = crypto.randomUUID();
  const r2Key = `uploads/${ownerId}/${sourceId}`;
  await env.GENERATED_ASSETS.put(r2Key, take);
  await createPendingMediaAsset(
    db,
    { ownerId },
    {
      id: sourceId,
      r2Key,
      filename: "take.mp4",
      mediaType: "video/mp4",
      sizeBytes: take.length,
    },
  );
  await markMediaAssetReady(db, { ownerId }, sourceId, {
    sizeBytes: take.length,
    etag: "e",
  });
  network.use(
    http.post("https://api.comfy.org/customers/storage", () =>
      HttpResponse.json({
        upload_url: "https://storage.googleapis.com/upload/take.mp4",
        download_url: "https://storage.googleapis.com/signed/take.mp4",
      }),
    ),
    http.put(
      "https://storage.googleapis.com/upload/take.mp4",
      () => new HttpResponse(null, { status: 200 }),
    ),
  );
  const editUrl = "https://v15-kling-fdl.klingai.com/edit.mp4";
  const matteUrl = "https://temp.bria.ai/abc/matte.webm";
  provider("kling/kling-v3-omni", "kling-1", {
    data: { task_result: { videos: [{ id: "v1", url: editUrl }] } },
  });
  provider("bria/video-edit-remove-background", "bria-1", {
    result: { video_url: matteUrl },
  });
  asset(editUrl, edit, "video/mp4");
  asset(matteUrl, matte, "video/webm");
  let up = false;
  network.use(
    ...cloudMedia(rendered, () => up).handlers,
    http.post(
      "http://127.0.0.1:8791/poster",
      () =>
        new HttpResponse(rendered.poster, {
          headers: { "Content-Length": String(rendered.poster.length) },
        }),
    ),
  );
  const accepted = await stub.submit(
    { ownerId },
    {
      idempotencyKey: crypto.randomUUID(),
      request: {
        workflowKind: "video.background-replace",
        inputs: {
          source: { type: "media-asset", assetId: sourceId },
          prompt: "a fishing harbor at dusk",
          preservation: { preserve: ["foreground"], allowIntegration: true },
        },
      },
    },
  );
  if (!accepted.ok) throw new Error(accepted.error);
  for (let i = 0; i < 14; i++) await due(stub);
  const stuck = (await checkpoint(stub))!.jobs[0]!;
  expect(stuck).toMatchObject({
    state: "needs_attention",
    stage: "Locking the performers to the take",
    error:
      "Locking the performers to the take did not finish. Check again to retry; the generated parts are saved.",
  });
  // The edit and matte stay saved: nothing is generated again.
  expect(stuck.outputs.filter((o) => o.r2Key)).toHaveLength(2);

  up = true;
  const reconciled = await stub.reconcile({ ownerId }, stuck.id);
  expect(reconciled.ok).toBe(true);
  for (let i = 0; i < 4; i++) await due(stub);
  const done = (await checkpoint(stub))!.jobs[0]!;
  expect(done.state).toBe("succeeded");
  expect(resultOutputs(done.outputs).map((o) => o.providerAssetId)).toEqual([
    "lock:locked",
    "lock:unlocked",
  ]);
}, 30_000);
