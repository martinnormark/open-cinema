import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";
import { createDatabase } from "@open-cinema/database";
import { listJobs, listMediaAssets } from "@open-cinema/database/queries";
import { signMediaPath } from "@open-cinema/assets";
import {
  resultOutputs,
  type Job,
  type MediaAsset,
} from "@open-cinema/contracts";
import type { MediaItem } from "@/features/library/model";

export function assetToItem(asset: MediaAsset): MediaItem {
  const url = `/api/media/${encodeURIComponent(asset.id)}`;
  return {
    id: asset.id,
    ref: { type: "media-asset", assetId: asset.id },
    origin: "upload",
    kind: asset.kind,
    mediaType: asset.mediaType,
    title: asset.filename,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    durationSeconds: asset.durationMs ? asset.durationMs / 1000 : null,
    fps: asset.fps,
    pixelAspect: asset.pixelAspect,
    hasAudio: asset.hasAudio,
    createdAt: asset.createdAt,
    url,
    // Falls back to the original image when no poster was rendered.
    thumbnailUrl: `${url}?variant=poster`,
    prompt: null,
  };
}

export const GENERATED = "generated~";
function generatedItems(jobs: readonly Job[]): MediaItem[] {
  // Intermediates such as a matte stay with their job, out of the library.
  return jobs.flatMap((job) =>
    resultOutputs(job.outputs)
      .filter(
        (output) =>
          output.r2Key &&
          (output.mediaType.startsWith("image/") ||
            output.mediaType.startsWith("video/")),
      )
      .map((output) => {
        const url = `/api/jobs/output?job=${encodeURIComponent(job.id)}&output=${encodeURIComponent(output.id)}`;
        const kind = output.mediaType.startsWith("video/") ? "video" : "image";
        return {
          id: `${GENERATED}${job.id}~${output.id}`,
          ref: { type: "job-output", jobId: job.id, outputId: output.id },
          origin: "generated" as const,
          kind,
          mediaType: output.mediaType,
          title: job.prompt || "Generated image",
          sizeBytes: output.sizeBytes,
          // The MVP Router image workflow renders 1K squares.
          width: kind === "image" ? 1024 : null,
          height: kind === "image" ? 1024 : null,
          durationSeconds: null,
          fps: null,
          pixelAspect: null,
          hasAudio: null,
          createdAt: job.updatedAt,
          url,
          thumbnailUrl: kind === "image" ? url : null,
          prompt: job.prompt || null,
        };
      }),
  );
}

export async function listForOwner(ownerId: string) {
  const db = createDatabase(env.DB);
  const [uploads, jobs] = await Promise.all([
    listMediaAssets(db, { ownerId }),
    listJobs(db, { ownerId }),
  ]);
  return [...uploads.map(assetToItem), ...generatedItems(jobs)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * Absolute, time-limited URL for handing an upload to a generation provider
 * that cannot present the session cookie. Server-side callers only; resolve
 * the asset with `resolveAssetRef` first so ownership and readiness hold.
 */
export async function signedUploadUrl(
  origin: string,
  ownerId: string,
  assetId: string,
  ttlMs = 60 * 60_000,
) {
  const { expires, signature } = await signMediaPath(
    env.LOCAL_SESSION_SECRET,
    `${ownerId}/${assetId}/original`,
    Date.now() + ttlMs,
  );
  const url = new URL(`/api/media/${encodeURIComponent(assetId)}`, origin);
  url.searchParams.set("owner", ownerId);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", signature);
  return url.href;
}
