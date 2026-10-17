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
import { createAssetResolver } from "../src/asset-resolver";

const network = setupNetwork();
beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
afterEach(() => network.resetHandlers());

it("uploads URL-only media to Comfy storage once when there is no public origin", async () => {
  const scope = { ownerId: crypto.randomUUID() };
  const db = createDatabase(env.DB);
  const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  const id = crypto.randomUUID();
  const r2Key = `uploads/${scope.ownerId}/${id}`;
  await env.GENERATED_ASSETS.put(r2Key, bytes, {
    httpMetadata: { contentType: "video/mp4" },
  });
  await createPendingMediaAsset(db, scope, {
    id,
    r2Key,
    filename: "take.mp4",
    mediaType: "video/mp4",
    sizeBytes: bytes.length,
  });
  await markMediaAssetReady(db, scope, id, {
    sizeBytes: bytes.length,
    etag: "e",
  });
  const slots: unknown[] = [];
  let received: Uint8Array | null = null;
  network.use(
    http.post(
      "https://api.comfy.org/customers/storage",
      async ({ request }) => {
        expect(request.headers.get("Authorization")).toBe(
          "Bearer integration-test-key",
        );
        slots.push(await request.json());
        return HttpResponse.json({
          upload_url: "https://storage.test/put/take.mp4?sig=up",
          download_url: "https://storage.test/get/take.mp4?sig=down",
        });
      },
    ),
    http.put("https://storage.test/put/take.mp4", async ({ request }) => {
      expect(request.headers.get("Content-Type")).toBe("video/mp4");
      received = new Uint8Array(await request.arrayBuffer());
      return new HttpResponse(null, { status: 200 });
    }),
  );
  const resolve = createAssetResolver(env, scope, Date.now() + 60_000);
  const asset = await resolve({ type: "media-asset", assetId: id });
  expect(asset.publicUrl).toBeNull();
  const urls = await Promise.all([asset.fetchableUrl(), asset.fetchableUrl()]);
  expect(urls).toEqual([
    "https://storage.test/get/take.mp4?sig=down",
    "https://storage.test/get/take.mp4?sig=down",
  ]);
  expect(slots).toEqual([
    { file_name: expect.stringMatching(/\.mp4$/), content_type: "video/mp4" },
  ]);
  expect(received).toEqual(bytes);
});
