import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import {
  archiveOutput,
  imageSize,
  serveStoredOutput,
} from "@open-cinema/assets";
import { jobOutputSchema } from "@open-cinema/contracts";
const network = setupNetwork();
beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(() => reset());
afterEach(() => network.resetHandlers());
const url = "https://storage.googleapis.com/test-assets/large.png";
const output = () =>
  jobOutputSchema.parse({
    id: crypto.randomUUID(),
    jobId: "asset-job",
    providerAssetId: "sample",
    mediaType: "image/png",
  });

it("copies a chunked multipart asset byte-for-byte and serves HEAD, conditional GET, and suffix ranges", async () => {
  const bytes = new Uint8Array(5 * 1024 * 1024 + 19);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  network.use(
    http.get(url, ({ request }) => {
      expect(request.headers.has("Authorization")).toBe(false);
      expect(request.headers.has("Cookie")).toBe(false);
      return new HttpResponse(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 3 * 1024 * 1024));
            controller.enqueue(bytes.subarray(3 * 1024 * 1024));
            controller.close();
          },
        }),
        { headers: { "Content-Type": "image/png" } },
      );
    }),
  );
  const candidate = output();
  const saved = {
    ...candidate,
    ...(await archiveOutput(
      env.GENERATED_ASSETS,
      "asset-owner",
      candidate,
      async () => url,
    )),
  };
  expect(saved.sizeBytes).toBe(bytes.length);
  const object = await env.GENERATED_ASSETS.get(saved.r2Key);
  expect(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await object!.arrayBuffer()),
    ),
  ).toEqual(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
  const head = await serveStoredOutput(
    env.GENERATED_ASSETS,
    saved,
    new Request("https://app.test/output", { method: "HEAD" }),
  );
  expect(head.headers.get("Content-Length")).toBe(String(bytes.length));
  expect(await head.text()).toBe("");
  const cached = await serveStoredOutput(
    env.GENERATED_ASSETS,
    saved,
    new Request("https://app.test/output", {
      headers: { "If-None-Match": head.headers.get("ETag")! },
    }),
  );
  expect(cached.status).toBe(304);
  const suffix = await serveStoredOutput(
    env.GENERATED_ASSETS,
    saved,
    new Request("https://app.test/output", { headers: { Range: "bytes=-19" } }),
  );
  expect(suffix.status).toBe(206);
  expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(bytes.slice(-19));
  const invalid = await serveStoredOutput(
    env.GENERATED_ASSETS,
    saved,
    new Request("https://app.test/output", {
      headers: { Range: `bytes=${bytes.length}-` },
    }),
  );
  expect(invalid.status).toBe(416);
});

it.each(["truncated", "oversized", "html", "redirect"])(
  "does not publish an R2 object after a %s source response",
  async (kind) => {
    let unsafeRequests = 0;
    network.use(
      http.get(url, () => {
        if (kind === "redirect")
          return new HttpResponse(null, {
            status: 302,
            headers: { Location: "https://untrusted.test/asset" },
          });
        return new HttpResponse("abc", {
          headers: {
            "Content-Type": kind === "html" ? "text/html" : "image/png",
            "Content-Length":
              kind === "oversized" ? String(513 * 1024 * 1024) : "20",
          },
        });
      }),
      http.get("https://untrusted.test/asset", () => {
        unsafeRequests++;
        return new HttpResponse("abc", {
          headers: { "Content-Type": "image/png" },
        });
      }),
    );
    await expect(
      archiveOutput(
        env.GENERATED_ASSETS,
        "asset-owner",
        output(),
        async () => url,
      ),
    ).rejects.toThrow();
    expect((await env.GENERATED_ASSETS.list()).objects).toHaveLength(0);
    expect(unsafeRequests).toBe(0);
  },
);

it("archives Kling's delivered video, the only output of the replacement kinds", async () => {
  const kling = "https://v15-kling-fdl.klingai.com/bs2/x/clip.mp4?cacheKey=1";
  network.use(
    http.get(
      kling,
      () =>
        new HttpResponse(new Uint8Array([0, 0, 0, 24]), {
          headers: { "Content-Type": "video/mp4" },
        }),
    ),
  );
  const saved = await archiveOutput(
    env.GENERATED_ASSETS,
    "asset-owner",
    { ...output(), mediaType: "video/mp4" },
    async () => kling,
  );
  expect(saved).toMatchObject({ mediaType: "video/mp4", sizeBytes: 4 });
});

/** A PNG signature and IHDR chunk for a 16:9 image, then filler. */
function pngHeader(width: number, height: number, length: number) {
  const bytes = new Uint8Array(length);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

it("records a generated image's pixel size while copying it, including on a repeated copy", async () => {
  const bytes = pngHeader(1344, 768, 4096);
  network.use(
    http.get(
      url,
      () =>
        new HttpResponse(
          new ReadableStream({
            start(controller) {
              // The header arrives split across chunks.
              controller.enqueue(bytes.subarray(0, 10));
              controller.enqueue(bytes.subarray(10));
              controller.close();
            },
          }),
          { headers: { "Content-Type": "image/png" } },
        ),
    ),
  );
  const candidate = output();
  const first = await archiveOutput(
    env.GENERATED_ASSETS,
    "asset-owner",
    candidate,
    async () => url,
  );
  expect([first.width, first.height]).toEqual([1344, 768]);
  const again = await archiveOutput(
    env.GENERATED_ASSETS,
    "asset-owner",
    candidate,
    async () => null,
  );
  expect([again.width, again.height]).toEqual([1344, 768]);
});

it("reads the size of JPEG and WebP headers and ignores other bytes", () => {
  // SOI, an APP0 segment, then a baseline frame of 1920×1080.
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
    0x08, 0x04, 0x38, 0x07, 0x80, 0x03,
  ]);
  expect(imageSize(jpeg)).toEqual({ width: 1920, height: 1080 });
  const webp = new Uint8Array(30);
  webp.set(new TextEncoder().encode("RIFF"), 0);
  webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
  webp.set([0x3f, 0x05, 0x00, 0xff, 0x02, 0x00], 24);
  expect(imageSize(webp)).toEqual({ width: 1344, height: 768 });
  expect(imageSize(new Uint8Array([0, 1, 2, 3]))).toBeNull();
});
