import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { createDatabase } from "@open-cinema/database";
import {
  createPendingMediaAsset,
  markMediaAssetReady,
} from "@open-cinema/database/mutations";
import { getMediaAsset, getJobOutput } from "@open-cinema/database/queries";

const network = setupNetwork();
beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
afterEach(async () => {
  await reset();
  network.resetHandlers();
});

const clip = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 1, 1]);
// RIFF....WEBPVP8 : enough of a WebP for storage.
const webp = new Uint8Array([
  82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32,
]);

/** The media container's poster step: counts renders and reports measurements. */
function container() {
  const rendered: string[] = [];
  network.use(
    http.post("http://127.0.0.1:8791/:operation", ({ params, request }) => {
      rendered.push(
        `${String(params.operation)}:${request.headers.get("x-media-parts")}`,
      );
      return new HttpResponse(webp, {
        headers: {
          "content-type": "image/webp",
          "content-length": String(webp.length),
          "x-media-width": "1280",
          "x-media-height": "720",
          "x-media-duration": "5.04",
        },
      });
    }),
  );
  return rendered;
}

async function upload(
  ownerId: string,
  mediaType: string,
  measured: { width?: number; durationMs?: number } = {},
) {
  const db = createDatabase(env.DB);
  const id = crypto.randomUUID();
  const r2Key = `uploads/v1/${ownerId}/${id}/original`;
  await env.GENERATED_ASSETS.put(r2Key, clip, {
    httpMetadata: { contentType: mediaType },
  });
  await createPendingMediaAsset(
    db,
    { ownerId },
    {
      id,
      r2Key,
      filename: "kitchen-table.mp4",
      mediaType,
      sizeBytes: clip.length,
      ...measured,
    },
  );
  await markMediaAssetReady(db, { ownerId }, id, {
    sizeBytes: clip.length,
    etag: "e",
  });
  return id;
}

it("makes an upload's poster once and records it with what was unknown", async () => {
  const ownerId = crypto.randomUUID();
  const assetId = await upload(ownerId, "video/mp4", { width: 1920 });
  const rendered = container();
  const stub = env.GENERATION_COORDINATORS.getByName(ownerId);
  const ref = { type: "media-asset", assetId } as const;
  // A thumbnail requested while the upload's poster renders shares that render.
  const [first, second] = await Promise.all([
    stub.ensurePoster({ ownerId }, ref),
    stub.ensurePoster({ ownerId }, ref),
  ]);
  expect(rendered).toEqual([`poster:source=${clip.length}`]);
  expect(second).toEqual(first);
  const posterKey = `uploads/v1/${ownerId}/${assetId}/poster`;
  expect(first).toEqual({ posterKey });
  const stored = await env.GENERATED_ASSETS.get(posterKey);
  expect(stored?.httpMetadata?.contentType).toBe("image/webp");
  expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(webp);
  const asset = await getMediaAsset(
    createDatabase(env.DB),
    { ownerId },
    assetId,
  );
  // The browser's measurement stands; ffmpeg fills the gaps.
  expect(asset).toMatchObject({
    posterKey,
    width: 1920,
    height: 720,
    durationMs: 5040,
  });
  await stub.ensurePoster({ ownerId }, ref);
  expect(rendered).toHaveLength(1);
});

it("makes a generated output's poster beside it and records size and length", async () => {
  const ownerId = crypto.randomUUID();
  const r2Key = `generated/v1/${ownerId}/job-1/abc`;
  await env.GENERATED_ASSETS.put(r2Key, clip, {
    httpMetadata: { contentType: "video/mp4" },
  });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO "User" (id) VALUES (?)`).bind(ownerId),
    env.DB.prepare(
      `INSERT INTO "GenerationJob" (id, ownerId, state, version, idempotencyKey, requestHash, workflowSnapshot, inputsSnapshot, updatedAt)
       VALUES ('job-1', ?, 'succeeded', 1, 'k', 'h', '{}', '{}', CURRENT_TIMESTAMP)`,
    ).bind(ownerId),
    env.DB.prepare(
      `INSERT INTO "JobOutput" (id, jobId, providerAssetId, mediaType, r2Key, sizeBytes, etag)
       VALUES ('job-1:conform:video', 'job-1', 'conform:video', 'video/mp4', ?, ?, 'e')`,
    ).bind(r2Key, clip.length),
  ]);
  const rendered = container();
  const stub = env.GENERATION_COORDINATORS.getByName(ownerId);
  const made = await stub.ensurePoster(
    { ownerId },
    { type: "job-output", jobId: "job-1", outputId: "job-1:conform:video" },
  );
  expect(made).toEqual({ posterKey: `${r2Key}/poster` });
  expect(rendered).toHaveLength(1);
  const output = await getJobOutput(
    createDatabase(env.DB),
    { ownerId },
    "job-1",
    "job-1:conform:video",
  );
  expect(output).toMatchObject({
    posterKey: `${r2Key}/poster`,
    width: 1280,
    height: 720,
    durationMs: 5040,
  });
  // Another creator cannot reach it.
  expect(
    await env.GENERATION_COORDINATORS.getByName("someone-else").ensurePoster(
      { ownerId: "someone-else" },
      { type: "job-output", jobId: "job-1", outputId: "job-1:conform:video" },
    ),
  ).toBeNull();
});

it("leaves images and failed renders without a poster", async () => {
  const ownerId = crypto.randomUUID();
  const stub = env.GENERATION_COORDINATORS.getByName(ownerId);
  const image = await upload(ownerId, "image/png");
  const rendered = container();
  expect(
    await stub.ensurePoster(
      { ownerId },
      { type: "media-asset", assetId: image },
    ),
  ).toBeNull();
  expect(rendered).toEqual([]);

  const video = await upload(ownerId, "video/mp4");
  network.use(
    http.post("http://127.0.0.1:8791/poster", () =>
      HttpResponse.text("no video stream", { status: 422 }),
    ),
  );
  expect(
    await stub.ensurePoster(
      { ownerId },
      { type: "media-asset", assetId: video },
    ),
  ).toBeNull();
  const asset = await getMediaAsset(createDatabase(env.DB), { ownerId }, video);
  expect(asset?.posterKey).toBeNull();
});
