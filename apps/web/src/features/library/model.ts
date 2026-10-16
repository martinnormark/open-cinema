import { z } from "zod";

// Browser-safe library DTOs. Move to @open-cinema/contracts with the MediaAsset model.
export const mediaKindSchema = z.enum(["image", "video"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;
export const mediaRoleSchema = z.enum(["source", "reference"]);
export type MediaRole = z.infer<typeof mediaRoleSchema>;
export const mediaTargetSchema = z.object({
  kind: z.enum(["job", "element"]),
  id: z.string().min(1).max(200),
});
export type MediaTarget = z.infer<typeof mediaTargetSchema>;
export const mediaAttachmentSchema = z.object({
  target: mediaTargetSchema,
  role: mediaRoleSchema,
  attachedAt: z.string(),
});
export type MediaAttachment = z.infer<typeof mediaAttachmentSchema>;
export const mediaItemSchema = z.object({
  /** Uploads use a UUID; generated outputs use `generated~{jobId}~{outputId}`. */
  id: z.string(),
  origin: z.enum(["upload", "generated"]),
  kind: mediaKindSchema,
  mediaType: z.string(),
  title: z.string(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().positive().nullable(),
  createdAt: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  attachments: z.array(mediaAttachmentSchema),
  prompt: z.string().nullable(),
  jobId: z.string().nullable(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

export const UPLOAD_ACCEPT =
  "image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime";
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
