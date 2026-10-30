import { env } from "./runtime";
import { applyMigrations, reset } from "./runtime";
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
import { createDatabase } from "@open-cinema/database";
import {
  createPendingMediaAsset,
  markMediaAssetReady,
} from "@open-cinema/database/mutations";
import { createAssetResolver } from "../src/asset-resolver";
import { mediaLinkExpiry } from "../src/generation-coordinator";

const network = setupNetwork();
beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(async () => {
  await reset();
  await applyMigrations(env.DB, env.TEST_MIGRATIONS);
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
  expect<unknown>(received).toEqual(bytes);
});

it("signs media links that outlive the longest wait in Router's queue", async () => {
  const scope = { ownerId: crypto.randomUUID() };
  const db = createDatabase(env.DB);
  const id = crypto.randomUUID();
  await createPendingMediaAsset(db, scope, {
    id,
    r2Key: `uploads/${scope.ownerId}/${id}`,
    filename: "mara.png",
    mediaType: "image/png",
    sizeBytes: 4,
  });
  await markMediaAssetReady(db, scope, id, { sizeBytes: 4, etag: "e" });
  const createdAt = new Date().toISOString();
  // An image job's own deadline is far shorter than a 2-hour queue wait.
  const deadline = Date.parse(createdAt) + 30 * 60_000;
  const expiresAt = mediaLinkExpiry(createdAt, deadline);
  const resolve = createAssetResolver(
    {
      ...env,
      MEDIA_PUBLIC_ORIGIN: "https://studio.test",
      MEDIA_SIGNING_SECRET: "test-secret",
    } as unknown as Parameters<typeof createAssetResolver>[0],
    scope,
    expiresAt,
  );
  const url = new URL(
    (await resolve({ type: "media-asset", assetId: id })).publicUrl!,
  );
  const expires = Number(url.searchParams.get("expires"));
  // Covers the full six-hour watch window, plus a margin for a late fetch.
  expect(expires).toBeGreaterThanOrEqual(
    Date.parse(createdAt) + 7 * 60 * 60_000,
  );
  // "Check again" can push the deadline later; links then follow it.
  const recovered = Date.parse(createdAt) + 8 * 60 * 60_000;
  expect(mediaLinkExpiry(createdAt, recovered)).toBeGreaterThan(recovered);
  // Fixed per job, so a rebuilt request is identical.
  expect(mediaLinkExpiry(createdAt, deadline)).toBe(expiresAt);
});
