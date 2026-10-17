import { z } from "zod";

export const mediaKindSchema = z.enum(["image", "video"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;

/**
 * A pointer to media the studio owns. Uploaded sources are MediaAssets; generated
 * results stay JobOutputs. Neither form carries bytes or a signed URL: providers
 * receive a short-lived URL resolved at submission time.
 */
export const assetRefSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("media-asset"), assetId: z.string().min(1) }),
  z.object({
    type: z.literal("job-output"),
    jobId: z.string().min(1),
    outputId: z.string().min(1),
  }),
]);
export type AssetRef = z.infer<typeof assetRefSchema>;

export function assetRefKey(ref: AssetRef): string {
  return ref.type === "media-asset"
    ? `asset:${ref.assetId}`
    : `output:${ref.jobId}:${ref.outputId}`;
}

/** `pending` covers an upload whose bytes have not been verified in R2 yet. */
export const mediaAssetStatusSchema = z.enum(["pending", "ready", "failed"]);
export type MediaAssetStatus = z.infer<typeof mediaAssetStatusSchema>;

export const mediaAssetSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  projectId: z.string().nullable().default(null),
  kind: mediaKindSchema,
  status: mediaAssetStatusSchema,
  mediaType: z.string(),
  filename: z.string(),
  r2Key: z.string(),
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  etag: z.string().nullable().default(null),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  fps: z.number().positive().nullable().default(null),
  /** Sample (pixel) aspect ratio measured at upload; 1 is square pixels. */
  pixelAspect: z.number().positive().nullable().default(null),
  /** Whether the clip has a sound track; null when it was not measured. */
  hasAudio: z.boolean().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const ALLOWED_UPLOAD_MEDIA_TYPES = {
  image: ["image/png", "image/jpeg", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
} as const satisfies Record<MediaKind, readonly string[]>;

/** Upper bounds providers accept for source media (see docs/comfy-router-catalog.md). */
export const MAX_UPLOAD_BYTES = {
  image: 25 * 1024 * 1024,
  video: 500 * 1024 * 1024,
} as const satisfies Record<MediaKind, number>;

export function mediaKindFor(mediaType: string): MediaKind | null {
  for (const kind of mediaKindSchema.options) {
    if (
      (ALLOWED_UPLOAD_MEDIA_TYPES[kind] as readonly string[]).includes(
        mediaType,
      )
    )
      return kind;
  }
  return null;
}

export const createMediaAssetInputSchema = z.object({
  projectId: z.string().min(1).optional(),
  filename: z.string().trim().min(1).max(255),
  mediaType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  fps: z.number().positive().optional(),
  pixelAspect: z.number().positive().optional(),
  hasAudio: z.boolean().optional(),
});
export type CreateMediaAssetInput = z.infer<typeof createMediaAssetInputSchema>;

export const projectSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  /** Persistent creative direction: palette, lighting, lens, texture, pacing. */
  direction: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  direction: z.string().trim().max(4000).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  direction: z.string().trim().max(4000).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;
