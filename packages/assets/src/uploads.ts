import {
  MAX_UPLOAD_BYTES,
  mediaKindFor,
  type AssetRef,
  type MediaKind,
} from "@open-cinema/contracts";

const PART_BYTES = 5 * 1024 * 1024;

export type UploadKind = MediaKind;

/**
 * Contract limits, further capped for direct uploads: Workers reject request
 * bodies over 100 MB on most plans.
 */
export const UPLOAD_LIMITS = {
  image: MAX_UPLOAD_BYTES.image,
  video: Math.min(MAX_UPLOAD_BYTES.video, 95 * 1024 * 1024),
  poster: 2 * 1024 * 1024,
} as const;
const POSTER_TYPES = new Set(["image/webp", "image/jpeg", "image/png"]);

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 413 | 415 | 422 = 400,
  ) {
    super(message);
  }
}

export interface StoredUpload {
  r2Key: string;
  sizeBytes: number;
  etag: string;
  mediaType: string;
  kind: UploadKind;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Declared types must match the file signature; never trust the browser's label. */
export function matchesSignature(mediaType: string, head: Uint8Array) {
  const ftyp = head.length >= 12 && ascii(head, 4, 8) === "ftyp";
  const brand = ftyp ? ascii(head, 8, 12) : "";
  switch (mediaType) {
    case "image/png":
      return head[0] === 0x89 && ascii(head, 1, 4) === "PNG";
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/gif":
      return ascii(head, 0, 4) === "GIF8";
    case "image/webp":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP";
    case "image/avif":
      return ftyp && (brand === "avif" || brand === "avis");
    case "video/mp4":
      return ftyp && brand !== "avif" && brand !== "avis" && brand !== "qt  ";
    case "video/quicktime":
      return (
        (ftyp && brand === "qt  ") ||
        ["moov", "mdat", "wide", "free"].includes(ascii(head, 4, 8))
      );
    case "video/webm":
      return (
        head[0] === 0x1a &&
        head[1] === 0x45 &&
        head[2] === 0xdf &&
        head[3] === 0xa3
      );
    default:
      return false;
  }
}

export function uploadObjectKey(
  ownerId: string,
  uploadId: string,
  variant: "original" | "poster",
) {
  return `uploads/v1/${encodeURIComponent(ownerId)}/${encodeURIComponent(uploadId)}/${variant}`;
}

/**
 * Where a video's poster still lives: beside an upload's original, or beside a
 * generated output's object.
 */
export function posterObjectKey(ownerId: string, ref: AssetRef, r2Key: string) {
  return ref.type === "media-asset"
    ? uploadObjectKey(ownerId, ref.assetId, "poster")
    : `${r2Key}/poster`;
}

function metadata(object: R2Object, kind: UploadKind): StoredUpload {
  return {
    r2Key: object.key,
    sizeBytes: object.size,
    etag: object.etag,
    mediaType: object.httpMetadata?.contentType ?? "application/octet-stream",
    kind,
  };
}

/**
 * Streams an upload into private R2 storage with bounded memory. Validates the
 * declared media type, file signature, and size while bytes arrive; partial
 * uploads are aborted so nothing is stored on failure.
 */
export async function storeUpload(
  bucket: R2Bucket,
  ownerId: string,
  uploadId: string,
  body: ReadableStream<Uint8Array>,
  declaredType: string,
  declaredLength: number | null,
): Promise<StoredUpload> {
  const mediaType = declaredType.split(";")[0]?.trim().toLowerCase() ?? "";
  const kind = mediaKindFor(mediaType);
  if (!kind)
    throw new UploadError(
      "Upload a PNG, JPEG, or WebP image, or an MP4, WebM, or MOV video.",
      415,
    );
  const limit = UPLOAD_LIMITS[kind];
  if (declaredLength !== null && declaredLength > limit)
    throw new UploadError(
      `This ${kind} is larger than ${limit / 1024 / 1024} MB.`,
      413,
    );
  const key = uploadObjectKey(ownerId, uploadId, "original");
  const reader = body.getReader();
  let upload: R2MultipartUpload | undefined;
  try {
    const parts: R2UploadedPart[] = [];
    let part = new Uint8Array(PART_BYTES);
    let filled = 0;
    let total = 0;
    let checked = false;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit)
        throw new UploadError(
          `This ${kind} is larger than ${limit / 1024 / 1024} MB.`,
          413,
        );
      let offset = 0;
      while (offset < value.byteLength) {
        const count = Math.min(PART_BYTES - filled, value.byteLength - offset);
        part.set(value.subarray(offset, offset + count), filled);
        filled += count;
        offset += count;
        if (!checked && (filled >= 16 || filled === PART_BYTES)) {
          if (!matchesSignature(mediaType, part.subarray(0, filled)))
            throw new UploadError(
              "The file contents do not match its type. Export it again and retry.",
              415,
            );
          checked = true;
          upload = await bucket.createMultipartUpload(key, {
            httpMetadata: { contentType: mediaType },
            customMetadata: { ownerId, uploadId },
          });
        }
        if (filled === PART_BYTES) {
          parts.push(await upload!.uploadPart(parts.length + 1, part));
          part = new Uint8Array(PART_BYTES);
          filled = 0;
        }
      }
    }
    if (!checked) throw new UploadError("The file is empty or truncated.", 422);
    if (declaredLength !== null && declaredLength !== total)
      throw new UploadError("The upload was interrupted. Try again.", 422);
    if (filled)
      parts.push(
        await upload!.uploadPart(parts.length + 1, part.subarray(0, filled)),
      );
    const object = await upload!.complete(parts);
    upload = undefined;
    return metadata(object, kind);
  } finally {
    await reader.cancel().catch(() => undefined);
    await upload?.abort().catch(() => undefined);
  }
}

/**
 * Small browser-rendered still used for grid thumbnails and video posters,
 * saved under `key` (see `uploadObjectKey` and `posterObjectKey`).
 */
export async function storePoster(
  bucket: R2Bucket,
  key: string,
  ownerId: string,
  body: ArrayBuffer,
  declaredType: string,
): Promise<StoredUpload> {
  const mediaType = declaredType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!POSTER_TYPES.has(mediaType))
    throw new UploadError("Posters must be WebP, JPEG, or PNG.", 415);
  if (body.byteLength > UPLOAD_LIMITS.poster)
    throw new UploadError("The poster is too large.", 413);
  if (!matchesSignature(mediaType, new Uint8Array(body, 0, 16)))
    throw new UploadError("The poster contents do not match its type.", 415);
  const object = await bucket.put(key, body, {
    httpMetadata: { contentType: mediaType },
    customMetadata: { ownerId },
  });
  return metadata(object, "image");
}

export async function deleteUploadObjects(
  bucket: R2Bucket,
  ownerId: string,
  uploadId: string,
) {
  await bucket.delete([
    uploadObjectKey(ownerId, uploadId, "original"),
    uploadObjectKey(ownerId, uploadId, "poster"),
  ]);
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`open-cinema/media-url/v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/**
 * Time-limited capability for a single object, for consumers that cannot send
 * the session cookie (for example a generation provider fetching a source).
 */
export async function signMediaPath(
  secret: string,
  path: string,
  expiresAt: number,
) {
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(secret),
      new TextEncoder().encode(`${path}\n${expiresAt}`),
    ),
  );
  return { expires: String(expiresAt), signature: base64url(signature) };
}

export async function verifyMediaPath(
  secret: string,
  path: string,
  expires: string | null,
  signature: string | null,
) {
  const expiresAt = Number(expires);
  if (!signature || !Number.isSafeInteger(expiresAt) || expiresAt < Date.now())
    return false;
  try {
    const raw = Uint8Array.from(
      atob(signature.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    );
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      raw,
      new TextEncoder().encode(`${path}\n${expiresAt}`),
    );
  } catch {
    return false;
  }
}
