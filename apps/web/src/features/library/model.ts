import { z } from "zod";
import {
  assetRefKey,
  assetRefSchema,
  mediaKindSchema,
  type AssetRef,
} from "@open-cinema/contracts";
export type { AssetRef, MediaKind } from "@open-cinema/contracts";

// Browser-safe view of uploads and generated outputs for the library and picker.
export const mediaItemSchema = z.object({
  /** Uploads use their asset ID; generated outputs use `generated~{jobId}~{outputId}`. */
  id: z.string(),
  ref: assetRefSchema,
  origin: z.enum(["upload", "generated"]),
  kind: mediaKindSchema,
  mediaType: z.string(),
  title: z.string(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().positive().nullable(),
  /** Container facts measured at upload; null for generated media or unknown. */
  fps: z.number().positive().nullable().default(null),
  pixelAspect: z.number().positive().nullable().default(null),
  hasAudio: z.boolean().nullable().default(null),
  createdAt: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  prompt: z.string().nullable(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;
/** How an embedding feature intends to use a picked item. */
export type MediaRole = "source" | "reference";

export const UPLOAD_ACCEPT =
  "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime";
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 120;

export function formatBytes(bytes: number | null) {
  if (bytes === null) return "Unknown size";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
export function formatDuration(seconds: number | null) {
  if (seconds === null) return "";
  const whole = Math.max(1, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Inverse of `assetRefKey` from contracts, for search params like `?source=asset:…`. */
export function parseAssetRefKey(value: string): AssetRef | null {
  const [type, a, b] = value.split(":");
  if (type === "asset" && a) return { type: "media-asset", assetId: a };
  if (type === "output" && a && b)
    return { type: "job-output", jobId: a, outputId: b };
  return null;
}

/**
 * Where "Use as source" (videos, into the revision studio) and "Use as
 * reference" (images, into a new Element) lead. Destinations read the
 * `source` or `reference` search param with `parseAssetRefKey`.
 */
export function mediaUseHref(item: MediaItem, role: MediaRole) {
  const key = assetRefKey(item.ref);
  return role === "reference"
    ? `/elements/new?reference=${encodeURIComponent(key)}`
    : `/revisions/new?source=${encodeURIComponent(key)}`;
}
