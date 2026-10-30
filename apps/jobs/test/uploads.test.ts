import { env, assetFiles } from "./runtime";
import { reset } from "./runtime";
import { beforeEach, expect, it } from "bun:test";
import {
  serveObject,
  signMediaPath,
  storeUpload,
  UPLOAD_LIMITS,
  uploadObjectKey,
  verifyMediaPath,
} from "@open-cinema/assets";
beforeEach(() => reset());

/** A tiny first chunk forces the signature check to span reads. */
function chunked(bytes: Uint8Array, size: number) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, 7));
      for (let i = 7; i < bytes.length; i += size)
        controller.enqueue(bytes.subarray(i, i + size));
      controller.close();
    },
  });
}
function mp4(length: number) {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = i % 251;
  bytes.set([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom")]);
  return bytes;
}

it("streams a multipart video upload byte-for-byte and serves byte ranges", async () => {
  const bytes = mp4(5 * 1024 * 1024 + 4099);
  const stored = await storeUpload(
    env.GENERATED_ASSETS,
    "owner-a",
    "upload-1",
    chunked(bytes, 64 * 1024),
    "video/mp4",
    bytes.length,
  );
  expect(stored).toMatchObject({
    kind: "video",
    mediaType: "video/mp4",
    sizeBytes: bytes.length,
    r2Key: uploadObjectKey("owner-a", "upload-1", "original"),
  });
  const object = await env.GENERATED_ASSETS.get(stored.r2Key);
  const digest = (data: ArrayBuffer | Uint8Array) =>
    crypto.subtle
      .digest(
        "SHA-256",
        data instanceof Uint8Array ? new Uint8Array(data) : data,
      )
      .then((d) => new Uint8Array(d));
  expect(await digest(await object!.arrayBuffer())).toEqual(
    await digest(bytes),
  );
  const range = await serveObject(
    env.GENERATED_ASSETS,
    stored.r2Key,
    new Request("https://x.test", { headers: { Range: "bytes=10-19" } }),
  );
  expect(range.status).toBe(206);
  expect(new Uint8Array(await range.arrayBuffer())).toEqual(
    bytes.subarray(10, 20),
  );
});

it("rejects mislabelled, oversized, and truncated uploads without storing anything", async () => {
  const html = new TextEncoder().encode("<html><script>alert(1)</script>");
  await expect(
    storeUpload(
      env.GENERATED_ASSETS,
      "owner-a",
      "fake",
      chunked(html, 64),
      "image/png",
      null,
    ),
  ).rejects.toMatchObject({ status: 415 });
  await expect(
    storeUpload(
      env.GENERATED_ASSETS,
      "owner-a",
      "huge",
      chunked(mp4(64), 64),
      "video/mp4",
      UPLOAD_LIMITS.video + 1,
    ),
  ).rejects.toMatchObject({ status: 413 });
  await expect(
    storeUpload(
      env.GENERATED_ASSETS,
      "owner-a",
      "short",
      chunked(mp4(64), 64),
      "video/mp4",
      128,
    ),
  ).rejects.toMatchObject({ status: 422 });
  expect(assetFiles()).toEqual([]);
});

it("accepts signed media paths only for the signed path and before expiry", async () => {
  const secret = "s".repeat(40);
  const path = "owner-a/upload-1/original";
  const { expires, signature } = await signMediaPath(
    secret,
    path,
    Date.now() + 60_000,
  );
  expect(await verifyMediaPath(secret, path, expires, signature)).toBe(true);
  expect(
    await verifyMediaPath(
      secret,
      "owner-b/upload-1/original",
      expires,
      signature,
    ),
  ).toBe(false);
  const old = await signMediaPath(secret, path, Date.now() - 1);
  expect(await verifyMediaPath(secret, path, old.expires, old.signature)).toBe(
    false,
  );
});
