import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { createDatabase } from "@open-cinema/database";
import { listJobs, listMediaAssets } from "@open-cinema/database/queries";
import { deleteMediaAsset } from "@open-cinema/database/mutations";
import { deleteUploadObjects, signMediaPath } from "@open-cinema/assets";
import type { Job, MediaAsset } from "@open-cinema/contracts";
import type { MediaItem } from "@/features/library/model";
import { requireSameOrigin, requireSession } from "./session";

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
    createdAt: asset.createdAt,
    url,
    // Falls back to the original image when no poster was rendered.
    thumbnailUrl: `${url}?variant=poster`,
    prompt: null,
  };
}

const GENERATED = "generated~";
function generatedItems(jobs: readonly Job[]): MediaItem[] {
  return jobs.flatMap((job) =>
    job.outputs
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
          createdAt: job.updatedAt,
          url,
          thumbnailUrl: kind === "image" ? url : null,
          prompt: job.prompt || null,
        };
      }),
  );
}

async function listForOwner(ownerId: string) {
  const db = createDatabase(env.DB);
  const [uploads, jobs] = await Promise.all([
    listMediaAssets(db, { ownerId }),
    listJobs(db, { ownerId }),
  ]);
  return [...uploads.map(assetToItem), ...generatedItems(jobs)].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

async function optionalSession() {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof Response && error.status === 401) return null;
    throw error;
  }
}

/** Ready uploads and saved generated outputs, newest first. */
export const listMedia = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ signedIn: boolean; items: MediaItem[] }> => {
    const session = await optionalSession();
    if (!session) return { signedIn: false, items: [] };
    return { signedIn: true, items: await listForOwner(session.userId) };
  },
);

/** Deletes an upload's record and bytes. Generated outputs stay with their job. */
export const deleteMedia = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    const scope = { ownerId: session.userId };
    const removed = await deleteMediaAsset(
      createDatabase(env.DB),
      scope,
      data.id,
    );
    if (!removed) return { ok: false };
    await deleteUploadObjects(env.GENERATED_ASSETS, session.userId, data.id);
    return { ok: true };
  });

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
