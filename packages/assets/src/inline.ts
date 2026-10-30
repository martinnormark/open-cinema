import type { AssetStore } from "./store";
/** Router rejects base64 payloads above 20 MB; leave headroom for encoding. */
export const MAX_INLINE_BYTES = 14 * 1024 * 1024;

export class InlineMediaError extends Error {}

/** Reads one stored object as base64 for a provider request body. */
export async function readObjectBase64(
  bucket: AssetStore,
  key: string,
  maxBytes = MAX_INLINE_BYTES,
): Promise<{ base64: string; mediaType: string }> {
  const head = await bucket.head(key);
  if (!head) throw new InlineMediaError("Stored media is missing");
  if (head.size > maxBytes)
    throw new InlineMediaError("Stored media is too large to send inline");
  const object = await bucket.get(key);
  if (!object) throw new InlineMediaError("Stored media is missing");
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return {
    base64: btoa(binary),
    mediaType: head.httpMetadata?.contentType ?? "application/octet-stream",
  };
}
