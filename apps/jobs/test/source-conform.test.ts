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

const take = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 1, 1]);
const squared = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 9, 9, 9]);
const requests = "https://api.comfy.org/v2/models/kling/kling-v3-omni/requests";

async function upload(ownerId: string, pixelAspect?: number) {
  const db = createDatabase(env.DB);
  const id = crypto.randomUUID();
  const r2Key = `uploads/${ownerId}/${id}`;
  await env.GENERATED_ASSETS.put(r2Key, take, {
    httpMetadata: { contentType: "video/mp4" },
  });
  await createPendingMediaAsset(
    db,
    { ownerId },
    {
      id,
      r2Key,
      filename: "kitchen-table.mp4",
      mediaType: "video/mp4",
      sizeBytes: take.length,
      ...(pixelAspect ? { pixelAspect } : {}),
    },
  );
  await markMediaAssetReady(db, { ownerId }, id, {
    sizeBytes: take.length,
    etag: "e",
  });
  return id;
}

/** Comfy storage that records each slot and the bytes put into it. */
function storage() {
  const stored = new Map<string, Uint8Array>();
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
      stored.set(
        String(params.name),
        new Uint8Array(await request.arrayBuffer()),
      );
      return new HttpResponse(null, { status: 200 });
    }),
  );
  return stored;
}

async function submit(ownerId: string, assetId: string) {
  const stub = env.GENERATION_COORDINATORS.getByName(ownerId);
  const result = (await stub.submit(
    { ownerId },
    {
      idempotencyKey: crypto.randomUUID(),
      request: {
        workflowKind: "video.background-replace",
        inputs: {
          source: { type: "media-asset", assetId },
          prompt: "a harbor at dusk",
          target: { type: "background" },
          preservation: { preserve: ["foreground", "performance"] },
        },
      },
    },
  )) as CommandResult;
  if (!result.ok) throw new Error(result.error);
  return stub;
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

const videoUrl = (body: unknown) =>
  (body as { video_list: { video_url: string }[] }).video_list[0]!.video_url;

it("conforms a clip with non-square pixels before Kling reads it", async () => {
  const ownerId = crypto.randomUUID();
  const assetId = await upload(ownerId, 639 / 640);
  const stored = storage();
  const operations: string[] = [];
  network.use(
    http.post("http://127.0.0.1:8791/:operation", ({ params }) => {
      operations.push(String(params.operation));
      return new HttpResponse(squared, {
        headers: {
          "content-type": "video/mp4",
          "content-length": String(squared.length),
        },
      });
    }),
  );
  const bodies: unknown[] = [];
  network.use(
    http.post(requests, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ request_id: "kling-1" }, { status: 202 });
    }),
  );
  const stub = await submit(ownerId, assetId);
  await due(stub);
  expect(operations).toEqual(["square"]);
  expect(bodies).toHaveLength(1);
  const name = videoUrl(bodies[0]).split("/").pop()!;
  expect(stored.get(name)).toEqual(squared);
});

it("rebuilds a request whose receipt was lost with the same storage link", async () => {
  const ownerId = crypto.randomUUID();
  const assetId = await upload(ownerId);
  const stored = storage();
  const bodies: unknown[] = [];
  network.use(
    http.post(requests, async ({ request }) => {
      bodies.push(await request.json());
      // The first call may have reached Router; only its answer was lost.
      return bodies.length === 1
        ? HttpResponse.json({ error: { code: "upstream" } }, { status: 502 })
        : HttpResponse.json({ request_id: "kling-1" }, { status: 202 });
    }),
  );
  const stub = await submit(ownerId, assetId);
  await due(stub);
  await due(stub);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(stored.size).toBe(1);
  const record = await runInDurableObject(stub, (_, state) =>
    readCoordinator(state.storage),
  );
  expect(record!.jobs[0]!.providerJobId).toBe("kling-1");
});
