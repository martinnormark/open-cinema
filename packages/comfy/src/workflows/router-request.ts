/**
 * Router request snapshots are persisted before submission, so image inputs are
 * stored as small references and only expanded into provider payloads at submit
 * time. Router accepts each image as an http(s) URL or a base64 string.
 */
export type ImageSource =
  { kind: "url"; url: string } | { kind: "asset"; r2Key: string };

/** A type alias, not an interface, so it stays assignable to persisted JSON records. */
export type RouterRequest = {
  model: string;
  input: Record<string, unknown>;
};

const IMAGE_FIELDS = ["images", "keyframes"] as const;
/** Router rejects base64 payloads above 20 MB; leave headroom for encoding. */
export const MAX_IMAGE_BYTES = 14 * 1024 * 1024;

export function imageSource(value: unknown): ImageSource | null {
  if (!value || typeof value !== "object") return null;
  if (
    "kind" in value &&
    value.kind === "asset" &&
    "r2Key" in value &&
    typeof value.r2Key === "string" &&
    value.r2Key
  )
    return { kind: "asset", r2Key: value.r2Key };
  if (
    "kind" in value &&
    value.kind === "url" &&
    "url" in value &&
    typeof value.url === "string"
  ) {
    try {
      const url = new URL(value.url);
      if (url.protocol === "https:" && !url.username && !url.password)
        return { kind: "url", url: url.href };
    } catch {
      return null;
    }
  }
  return null;
}

/** Asset keys referenced by a persisted request, for ownership checks before submission. */
export function referencedAssets(request: RouterRequest): string[] {
  return IMAGE_FIELDS.flatMap((field) => {
    const value = request.input[field];
    return (Array.isArray(value) ? value : [])
      .map(imageSource)
      .flatMap((source) => (source?.kind === "asset" ? [source.r2Key] : []));
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Expands persisted image references into the body Router receives. Stored
 * assets become base64 so private R2 objects never need a public URL.
 */
export async function materializeRouterRequest(
  request: RouterRequest,
  loadAsset: (r2Key: string) => Promise<Uint8Array | null>,
): Promise<RouterRequest> {
  const input = { ...request.input };
  for (const field of IMAGE_FIELDS) {
    const value = input[field];
    if (!Array.isArray(value)) continue;
    input[field] = await Promise.all(
      value.map(async (item) => {
        const source = imageSource(item);
        if (!source) throw new Error(`Invalid image reference in ${field}`);
        if (source.kind === "url") return source.url;
        const bytes = await loadAsset(source.r2Key);
        if (!bytes) throw new Error("A reference image is no longer stored");
        if (bytes.byteLength > MAX_IMAGE_BYTES)
          throw new Error("A reference image is too large to send");
        return toBase64(bytes);
      }),
    );
  }
  return { model: request.model, input };
}
