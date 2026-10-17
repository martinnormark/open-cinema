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
import type { CommandResult } from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import {
  mutateCoordinator,
  readCoordinator,
} from "@open-cinema/database/durable";
import {
  createPendingMediaAsset,
  markMediaAssetReady,
} from "@open-cinema/database/mutations";

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
const checkpoint = (stub: ReturnType<typeof fixture>["stub"]) =>
  runInDurableObject(stub, (_, state) => readCoordinator(state.storage));

const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111]);
/** A Router model that accepts one submission and completes it with `result`. */
function provider(
  model: string,
  result: Record<string, unknown>,
  assetUrl: string,
) {
  const requests = `https://api.comfy.org/v2/models/${model}/requests`;
  const bodies: unknown[] = [];
  network.use(
    http.post(requests, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ request_id: "video-1" }, { status: 202 });
    }),
    http.get(`${requests}/video-1/status`, () =>
      HttpResponse.json({ request_id: "video-1", status: "COMPLETED" }),
    ),
    http.get(`${requests}/video-1`, () => HttpResponse.json(result)),
    http.get(
      assetUrl,
      () =>
        new HttpResponse(mp4, {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(mp4.length),
          },
        }),
    ),
  );
  return bodies;
}
async function runToCompletion(stub: ReturnType<typeof fixture>["stub"]) {
  for (let i = 0; i < 4; i++) await due(stub);
  return (await checkpoint(stub))!.jobs[0]!;
}
async function storedBytes(r2Key: string | null) {
  const object = await env.GENERATED_ASSETS.get(r2Key!);
  return new Uint8Array(await object!.arrayBuffer());
}

it("runs video.ltx text-to-video on LTX and archives the clip from result.video_url", async () => {
  const { scope, stub } = fixture();
  const videoUrl =
    "https://storage.googleapis.com/ltx-research-model-serving/abc/video.mp4";
  // LTX's native result document, as Router returned it in the live run.
  const bodies = provider(
    "ltx/ltx-2-5-fast",
    { id: "job", status: "completed", result: { video_url: videoUrl } },
    videoUrl,
  );
  const started = Date.now();
  const job = accepted(
    await stub.submit(scope, {
      idempotencyKey: crypto.randomUUID(),
      request: {
        workflowKind: "video.ltx",
        inputs: {
          prompt: "Slow push-in on a lighthouse keeper at dusk",
          durationSeconds: 4,
          fps: 24,
          generateAudio: false,
        },
      },
    }),
  );
  // Video gets a longer monitoring window than images.
  expect(
    (await checkpoint(stub))!.executions[job.id]!.deadline - started,
  ).toBeGreaterThanOrEqual(45 * 60_000);

  const done = await runToCompletion(stub);
  expect(bodies).toEqual([
    {
      prompt: "Slow push-in on a lighthouse keeper at dusk",
      duration: 4,
      resolution: "1280x720",
      fps: 24,
      generate_audio: false,
    },
  ]);
  expect(done).toMatchObject({
    state: "succeeded",
    outputs: [{ mediaType: "video/mp4", sizeBytes: mp4.length }],
  });
  expect(await storedBytes(done.outputs[0]!.r2Key)).toEqual(mp4);
}, 20_000);

it("animates a first frame on FLUX 3 Video, sending the stored image inline only at submission", async () => {
  const { scope, stub } = fixture();
  const db = createDatabase(env.DB);
  const frame = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9]);
  const id = crypto.randomUUID();
  const r2Key = `uploads/${scope.ownerId}/${id}`;
  await env.GENERATED_ASSETS.put(r2Key, frame, {
    httpMetadata: { contentType: "image/png" },
  });
  await createPendingMediaAsset(db, scope, {
    id,
    r2Key,
    filename: "keeper.png",
    mediaType: "image/png",
    sizeBytes: frame.length,
  });
  await markMediaAssetReady(db, scope, id, {
    sizeBytes: frame.length,
    etag: "e",
  });
  const clipUrl =
    "https://storage.googleapis.com/partner-nodes-assets/bfl-results/clip.mp4";
  const bodies = provider(
    "bfl/flux-3-video",
    { id: "bfl", status: "Ready", result: { sample: clipUrl } },
    clipUrl,
  );
  accepted(
    await stub.submit(scope, {
      idempotencyKey: crypto.randomUUID(),
      request: {
        workflowKind: "video.ltx",
        inputs: {
          prompt: "The keeper raises his lantern",
          durationSeconds: 3,
          resolution: "1080x1920",
          firstFrame: { type: "media-asset", assetId: id },
        },
      },
    }),
  );
  const done = await runToCompletion(stub);
  const inline = btoa(String.fromCharCode(...frame));
  expect(bodies).toEqual([
    {
      mode: "i2v",
      prompt: "The keeper raises his lantern",
      keyframes: [inline],
      duration: 5,
      aspect_ratio: "9:16",
      resolution: "fhd",
      generate_audio: true,
    },
  ]);
  expect(JSON.stringify(await checkpoint(stub))).not.toContain(inline);
  expect(done).toMatchObject({
    state: "succeeded",
    outputs: [{ mediaType: "video/mp4" }],
  });
  expect(await storedBytes(done.outputs[0]!.r2Key)).toEqual(mp4);
}, 20_000);

it("keeps monitoring while Router reports the job queued, up to the queue-wait cap", async () => {
  const { scope, stub } = fixture();
  const requests = "https://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests";
  network.use(
    http.post(requests, () =>
      HttpResponse.json({ request_id: "queued-1" }, { status: 202 }),
    ),
    http.get(`${requests}/queued-1/status`, () =>
      HttpResponse.json({ request_id: "queued-1", status: "IN_QUEUE" }),
    ),
  );
  const job = accepted(
    await stub.submit(scope, {
      idempotencyKey: crypto.randomUUID(),
      request: {
        workflowKind: "video.ltx",
        inputs: { prompt: "Waves at dusk" },
      },
    }),
  );
  await due(stub);
  const nearlyExpired = async (createdAt: string) =>
    runInDurableObject(stub, (_, state) =>
      mutateCoordinator(state.storage, scope, (r) => {
        r.executions[job.id]!.deadline = Date.now() + 1000;
        r.jobs[0]!.createdAt = createdAt;
      }),
    );
  // An hour in Router's queue: the window extends instead of timing out.
  await nearlyExpired(new Date(Date.now() - 60 * 60_000).toISOString());
  await due(stub);
  let current = await checkpoint(stub);
  expect(current!.jobs[0]!.state).toBe("queued");
  expect(current!.executions[job.id]!.deadline).toBeGreaterThan(
    Date.now() + 30 * 60_000,
  );
  // Past six hours queued, the deadline stops moving and the creator is asked.
  await nearlyExpired(new Date(Date.now() - 7 * 60 * 60_000).toISOString());
  await due(stub);
  await due(stub);
  current = await checkpoint(stub);
  expect(current!.jobs[0]!.state).toBe("needs_attention");
});
