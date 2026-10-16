import type { JobOutput } from "@open-cinema/contracts";

const PART_BYTES = 5 * 1024 * 1024;
const MAX_BYTES = 512 * 1024 * 1024;
const mediaTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/ogg",
]);
type StoredMetadata = {
  r2Key: string;
  sizeBytes: number;
  etag: string;
  mediaType: string;
};
function metadata(object: R2Object): StoredMetadata {
  return {
    r2Key: object.key,
    sizeBytes: object.size,
    etag: object.etag,
    mediaType: object.httpMetadata?.contentType ?? "application/octet-stream",
  };
}
function assetUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !(
      host === "storage.googleapis.com" ||
      host.endsWith(".comfy.org") ||
      host.endsWith(".bfl.ai")
    )
  ) {
    throw new Error("Untrusted provider asset location");
  }
  return url;
}
async function download(value: string, signal: AbortSignal) {
  let url = assetUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    // Signed asset URL only. Never forward the Comfy API key, cookies, or user headers.
    const response = await fetch(url, {
      signal,
      redirect: "manual",
      headers: { "Accept-Encoding": "identity" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("Location");
      if (!location) throw new Error("Missing asset redirect location");
      url = assetUrl(new URL(location, url).href);
      continue;
    }
    return response;
  }
  throw new Error("Too many asset redirects");
}

/** Idempotent copy. Multipart keeps memory bounded even for chunked responses. */
export async function archiveOutput(
  bucket: R2Bucket,
  ownerId: string,
  output: JobOutput,
  resolveUrl: () => Promise<string | null>,
): Promise<StoredMetadata> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(output.id),
  );
  const hash = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const key = `generated/v1/${encodeURIComponent(ownerId)}/${encodeURIComponent(output.jobId)}/${hash}`;
  const existing = await bucket.head(key);
  if (existing) {
    if (
      existing.customMetadata?.ownerId !== ownerId ||
      existing.customMetadata?.outputId !== output.id
    )
      throw new Error("Asset ownership metadata mismatch");
    return metadata(existing);
  }
  const url = await resolveUrl();
  if (!url) throw new Error("Provider image is no longer available");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let upload: R2MultipartUpload | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await download(url, controller.signal);
    const contentType =
      response.headers
        .get("Content-Type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() ?? "";
    if (
      response.status !== 200 ||
      !response.body ||
      !mediaTypes.has(contentType)
    ) {
      await response.body?.cancel();
      throw new Error(
        "Provider asset download failed or returned an unsupported media type",
      );
    }
    const header = response.headers.get("Content-Length");
    const length =
      header !== null && !response.headers.get("Content-Encoding")
        ? Number(header)
        : null;
    if (
      length !== null &&
      (!Number.isSafeInteger(length) || length <= 0 || length > MAX_BYTES)
    ) {
      await response.body.cancel();
      throw new Error("Invalid asset size");
    }
    upload = await bucket.createMultipartUpload(key, {
      httpMetadata: { contentType },
      customMetadata: { ownerId, jobId: output.jobId, outputId: output.id },
    });
    reader = response.body.getReader();
    const parts: R2UploadedPart[] = [];
    let part = new Uint8Array(PART_BYTES);
    let filled = 0;
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES)
        throw new Error("Asset exceeds the transfer size limit");
      let offset = 0;
      while (offset < value.byteLength) {
        const count = Math.min(PART_BYTES - filled, value.byteLength - offset);
        part.set(value.subarray(offset, offset + count), filled);
        filled += count;
        offset += count;
        if (filled === PART_BYTES) {
          parts.push(await upload.uploadPart(parts.length + 1, part));
          part = new Uint8Array(PART_BYTES);
          filled = 0;
        }
      }
    }
    if (!total || (length !== null && length !== total))
      throw new Error("Incomplete asset download");
    if (filled)
      parts.push(
        await upload.uploadPart(parts.length + 1, part.subarray(0, filled)),
      );
    const object = await upload.complete(parts);
    upload = undefined;
    return metadata(object);
  } finally {
    clearTimeout(timer);
    controller.abort();
    await reader?.cancel().catch(() => undefined);
    await upload?.abort().catch(() => undefined);
  }
}

/** The caller must authorize the output before invoking this function. */
export async function serveStoredOutput(
  bucket: R2Bucket,
  output: JobOutput,
  request: Request,
): Promise<Response> {
  if (!output.r2Key)
    return new Response("Output is still being saved", { status: 409 });
  return serveObject(bucket, output.r2Key, request);
}

/** Streams a private object with ETag and byte-range support. Authorize first. */
export async function serveObject(
  bucket: R2Bucket,
  key: string,
  request: Request,
): Promise<Response> {
  const object = await bucket.head(key);
  if (!object) return new Response("Stored output not found", { status: 404 });
  const headers = new Headers({
    "Content-Type":
      object.httpMetadata?.contentType ?? "application/octet-stream",
    "Content-Length": String(object.size),
    "Content-Disposition": "inline",
    "Cache-Control": "private, max-age=0, must-revalidate",
    ETag: object.httpEtag,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  if (
    request.headers
      .get("If-None-Match")
      ?.split(",")
      .some(
        (tag) =>
          tag.trim().replace(/^W\//, "") === object.httpEtag ||
          tag.trim() === "*",
      )
  ) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }
  if (request.method === "HEAD") return new Response(null, { headers });
  let range: { offset: number; length: number } | undefined;
  const raw = request.headers.get("Range");
  const ifRange = request.headers.get("If-Range");
  if (raw && (!ifRange || ifRange === object.httpEtag)) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(raw);
    if (match && (match[1] || match[2])) {
      const start = match[1]
        ? Number(match[1])
        : Math.max(0, object.size - Number(match[2]));
      const end =
        match[1] && match[2]
          ? Math.min(Number(match[2]), object.size - 1)
          : object.size - 1;
      if (
        Number.isSafeInteger(start) &&
        Number.isSafeInteger(end) &&
        start >= 0 &&
        end >= start &&
        start < object.size
      )
        range = { offset: start, length: end - start + 1 };
    }
    if (!range)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${object.size}` },
      });
  }
  const stored = await bucket.get(key, range ? { range } : undefined);
  if (!stored) return new Response("Stored output not found", { status: 404 });
  if (range) {
    headers.set(
      "Content-Range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
    );
    headers.set("Content-Length", String(range.length));
  }
  return new Response(stored.body, { status: range ? 206 : 200, headers });
}

export * from "./uploads";
