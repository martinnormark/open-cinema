import type { AssetRef } from "@open-cinema/contracts";

/** Where the browser loads an owned upload or output; providers get signed URLs server-side. */
export function assetUrl(ref: AssetRef): string {
  return ref.type === "media-asset"
    ? `/api/media/${encodeURIComponent(ref.assetId)}`
    : `/api/jobs/output?job=${encodeURIComponent(ref.jobId)}&output=${encodeURIComponent(ref.outputId)}`;
}

/** A still for any upload or output: a video's poster frame, or the image. */
export function posterUrl(ref: AssetRef): string {
  return ref.type === "media-asset"
    ? `${assetUrl(ref)}?variant=poster`
    : `${assetUrl(ref)}&variant=poster`;
}
