import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";
import { createDatabase, type DatabaseContext } from "@open-cinema/database";
import { listJobs, listMediaAssets } from "@open-cinema/database/queries";
import { recordImageSize, recordPoster } from "@open-cinema/database/mutations";
import {
  measureStoredImage,
  storePoster,
  UploadError,
} from "@open-cinema/assets";
import {
  resultOutputs,
  type AssetRef,
  type Job,
  type MediaAsset,
  type OwnerScope,
} from "@open-cinema/contracts";
import type { MediaItem } from "@/features/library/model";
import { assetUrl, posterUrl } from "@/lib/media-url";
import { requireSameOrigin, requireSession } from "./session";

export function assetToItem(asset: MediaAsset): MediaItem {
  const ref = { type: "media-asset", assetId: asset.id } as const;
  return {
    id: asset.id,
    ref,
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
    url: assetUrl(ref),
    // A video's poster is drawn in the browser; a small image is its own poster.
    thumbnailUrl: posterUrl(ref),
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
        const ref = {
          type: "job-output",
          jobId: job.id,
          outputId: output.id,
        } as const;
        const url = assetUrl(ref);
        const kind = output.mediaType.startsWith("video/") ? "video" : "image";
        return {
          id: `${GENERATED}${job.id}~${output.id}`,
          ref,
          origin: "generated" as const,
          kind,
          mediaType: output.mediaType,
          title: job.prompt || "Generated image",
          sizeBytes: output.sizeBytes,
          // An image's size is read on copy; a video's with its poster.
          width: output.width ?? null,
          height: output.height ?? null,
          durationSeconds: output.durationMs ? output.durationMs / 1000 : null,
          fps: null,
          pixelAspect: null,
          hasAudio: null,
          createdAt: job.updatedAt,
          url,
          thumbnailUrl: kind === "image" ? url : posterUrl(ref),
          prompt: job.prompt || null,
        };
      }),
  );
}

/** Most images measured per listing, so a large old library catches up gradually. */
const BACKFILL_PER_LISTING = 24;

/**
 * Images saved before their size was read on copy: read each one's header
 * from R2 and record it, so the next listing already knows.
 */
async function backfillImageSizes(
  db: DatabaseContext,
  scope: OwnerScope,
  jobs: readonly Job[],
) {
  const missing = jobs
    .flatMap((job) => resultOutputs(job.outputs))
    .filter(
      (output) =>
        output.r2Key &&
        output.mediaType.startsWith("image/") &&
        !(output.width && output.height),
    )
    .slice(0, BACKFILL_PER_LISTING);
  await Promise.all(
    missing.map(async (output) => {
      const size = await measureStoredImage(
        env.GENERATED_ASSETS,
        output.r2Key!,
      ).catch(() => null);
      if (!size) return;
      Object.assign(output, size);
      await recordImageSize(
        db,
        scope,
        { jobId: output.jobId, outputId: output.id },
        size,
      );
    }),
  );
}

export async function listForOwner(ownerId: string) {
  const db = createDatabase(env.DB);
  const [uploads, jobs] = await Promise.all([
    listMediaAssets(db, { ownerId }),
    listJobs(db, { ownerId }),
  ]);
  await backfillImageSizes(db, { ownerId }, jobs);
  return [...uploads.map(assetToItem), ...generatedItems(jobs)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export interface PosterTarget {
  ref: AssetRef;
  /** Where the poster is stored in R2. */
  key: string;
  /** Record the size and length the browser measured while drawing it. */
  measured?: boolean;
}

/** Positive whole numbers the browser measured while drawing the poster. */
function measuredHeader(headers: Headers, name: string) {
  const n = Number(headers.get(name));
  return Number.isSafeInteger(n) && n > 0 && n <= 24 * 3600 * 1000
    ? n
    : undefined;
}

/**
 * Saves a poster frame the browser drew for an owned upload or output (the
 * PUT handlers of /api/media/$id and /api/jobs/output). `target` finds what the
 * poster belongs to, or answers with a response such as a 404.
 */
export async function putPoster(
  request: Request,
  target: (
    db: DatabaseContext,
    scope: OwnerScope,
  ) => Promise<PosterTarget | Response>,
): Promise<Response> {
  requireSameOrigin();
  const session = await requireSession();
  const scope = { ownerId: session.userId };
  const db = createDatabase(env.DB);
  try {
    const found = await target(db, scope);
    if (found instanceof Response) return found;
    const length = Number(request.headers.get("Content-Length"));
    if (!(length > 0 && length <= 2 * 1024 * 1024))
      throw new UploadError("The poster is missing or too large.", 413);
    const stored = await storePoster(
      env.GENERATED_ASSETS,
      found.key,
      session.userId,
      await request.arrayBuffer(),
      request.headers.get("Content-Type") ?? "",
    );
    const { headers } = request;
    await recordPoster(db, scope, found.ref, {
      posterKey: stored.r2Key,
      ...(found.measured
        ? {
            width: measuredHeader(headers, "X-Poster-Width"),
            height: measuredHeader(headers, "X-Poster-Height"),
            durationMs: measuredHeader(headers, "X-Poster-Duration-Ms"),
          }
        : {}),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return error instanceof UploadError
      ? Response.json({ error: error.message }, { status: error.status })
      : new Response("Storage is temporarily unavailable.", { status: 503 });
  }
}
