import type { AssetRef } from "@open-cinema/contracts";
import { assetUrl } from "@/features/elements/model";
import { posterUrl } from "@/features/revision/model";

/** A still for any take: a video's ffmpeg poster, or the image itself. */
export function posterFor(picture: {
  asset: AssetRef;
  kind: "video" | "image";
}): string {
  return picture.kind === "video"
    ? posterUrl(picture.asset)
    : assetUrl(picture.asset);
}
