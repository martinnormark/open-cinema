import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { createDatabase } from "@open-cinema/database";
import { listJobs } from "@open-cinema/database/queries";
import { deleteUploadObjects, signMediaPath } from "@open-cinema/assets";
import type { Job } from "@open-cinema/contracts";
import {
  mediaRoleSchema,
  mediaTargetSchema,
  type MediaItem,
} from "@/features/library/model";
import { requireSameOrigin, requireSession } from "./session";
import { r2SidecarStore, type UploadRecord } from "./media-store";

export function mediaStore() {
  return r2SidecarStore(env.GENERATED_ASSETS);
}

export function uploadToItem(record: UploadRecord): MediaItem {
  const base = `/api/media/${encodeURIComponent(record.id)}`;
  return {
    id: record.id,
    origin: "upload",
    kind: record.kind,
    mediaType: record.mediaType,
    title: record.filename,
    sizeBytes: record.sizeBytes,
    width: record.width,
    height: record.height,
    durationSeconds: record.durationSeconds,
    createdAt: record.createdAt,
    url: base,
    thumbnailUrl: record.posterKey
      ? `${base}?variant=poster`
      : record.kind === "image"
        ? base
        : null,
    attachments: record.attachments,
    prompt: null,
    jobId: null,
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
          origin: "generated" as const,
          kind,
          mediaType: output.mediaType,
          title: job.prompt || "Generated image",
          sizeBytes: output.sizeBytes,
          // The MVP Router workflow renders 1K squares; video jobs report later.
          width: kind === "image" ? 1024 : null,
          height: kind === "image" ? 1024 : null,
          durationSeconds: null,
          createdAt: job.updatedAt,
          url,
          thumbnailUrl: kind === "image" ? url : null,
          attachments: [],
          prompt: job.prompt || null,
          jobId: job.id,
        };
      }),
  );
}

async function listForOwner(ownerId: string) {
  const [uploads, jobs] = await Promise.all([
    mediaStore().list(ownerId),
    listJobs(createDatabase(env.DB), { ownerId }).catch(() => [] as Job[]),
  ]);
  return [...uploads.map(uploadToItem), ...generatedItems(jobs)].sort((a, b) =>
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

/** Uploads and generated outputs, newest first. */
export const listMedia = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ signedIn: boolean; items: MediaItem[] }> => {
    const session = await optionalSession();
    if (!session) return { signedIn: false, items: [] };
    return { signedIn: true, items: await listForOwner(session.userId) };
  },
);

export const getMedia = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().min(1).max(400) }))
  .handler(async ({ data }): Promise<MediaItem | null> => {
    const session = await requireSession();
    if (data.id.startsWith(GENERATED))
      return (
        (await listForOwner(session.userId)).find(
          (item) => item.id === data.id,
        ) ?? null
      );
    const record = await mediaStore().get(session.userId, data.id);
    return record ? uploadToItem(record) : null;
  });

export const deleteMedia = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    const store = mediaStore();
    if (!(await store.get(session.userId, data.id))) return { ok: false };
    await deleteUploadObjects(env.GENERATED_ASSETS, session.userId, data.id);
    await store.delete(session.userId, data.id);
    return { ok: true };
  });

/** Records that an upload feeds a job or an Element as a source or reference. */
export const attachMedia = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().uuid(),
      target: mediaTargetSchema,
      role: mediaRoleSchema,
      attached: z.boolean().default(true),
    }),
  )
  .handler(async ({ data }): Promise<MediaItem | null> => {
    requireSameOrigin();
    const session = await requireSession();
    const store = mediaStore();
    const record = await store.get(session.userId, data.id);
    if (!record) return null;
    const others = record.attachments.filter(
      (a) =>
        !(
          a.target.kind === data.target.kind &&
          a.target.id === data.target.id &&
          a.role === data.role
        ),
    );
    const next: UploadRecord = {
      ...record,
      attachments: data.attached
        ? [
            ...others,
            {
              target: data.target,
              role: data.role,
              attachedAt: new Date().toISOString(),
            },
          ]
        : others,
    };
    await store.put(next);
    return uploadToItem(next);
  });

/**
 * Absolute, time-limited URL for handing an upload to a generation provider
 * that cannot present the session cookie. Server-side callers only.
 */
export async function signedUploadUrl(
  origin: string,
  ownerId: string,
  id: string,
  ttlMs = 60 * 60_000,
) {
  const { expires, signature } = await signMediaPath(
    env.LOCAL_SESSION_SECRET,
    `${ownerId}/${id}/original`,
    Date.now() + ttlMs,
  );
  const url = new URL(`/api/media/${encodeURIComponent(id)}`, origin);
  url.searchParams.set("owner", ownerId);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", signature);
  return url.href;
}
