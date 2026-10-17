import { getContainer } from "@cloudflare/containers";
import {
  CloudMediaRejectedError,
  runCloudMedia,
  type MediaOperation,
  type MediaPartName,
} from "@open-cinema/comfy";

/** Development override: a loopback media server (`node apps/jobs/media/server.mjs`). */
export function mediaOrigin(override: string | undefined): string | null {
  if (!override) return null;
  try {
    const url = new URL(override);
    return url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost")
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export interface MediaPart {
  name: string;
  r2Key: string;
}

/** The container answered with a definite refusal (bad input), not a transport error. */
export class MediaRejectedError extends Error {}

/**
 * Streams the parts from R2 into the media container in one body and returns its
 * MP4 (or a poster's WebP). Nothing is buffered in the Worker: R2 knows each
 * part's exact length. `headers` carries the container's measurements.
 */
export async function renderMedia(
  env: JobsEnv,
  operation: MediaOperation | "poster",
  parts: readonly MediaPart[],
  signal: AbortSignal,
): Promise<{
  body: ReadableStream<Uint8Array>;
  size: number;
  headers: Headers;
}> {
  const objects = await Promise.all(
    parts.map(async (part) => {
      const object = await env.GENERATED_ASSETS.get(part.r2Key);
      if (!object) throw new Error(`Media part "${part.name}" is not stored`);
      return { name: part.name, object };
    }),
  );
  const total = objects.reduce((sum, p) => sum + p.object.size, 0);
  const { readable, writable } = new FixedLengthStream(total);
  void (async () => {
    for (const [i, { object }] of objects.entries())
      await object.body.pipeTo(writable, {
        preventClose: i < objects.length - 1,
      });
  })().catch((error: unknown) => writable.abort(error).catch(() => undefined));
  const request = new Request(
    `${mediaOrigin(env.MEDIA_ORIGIN) ?? "http://media"}/${operation}`,
    {
      method: "POST",
      body: readable,
      headers: {
        "content-type": "application/octet-stream",
        "x-media-parts": objects
          .map((p) => `${p.name}=${p.object.size}`)
          .join(","),
      },
      signal,
    },
  );
  const response = mediaOrigin(env.MEDIA_ORIGIN)
    ? await fetch(request)
    : await getContainer(env.MEDIA).fetch(request);
  const size = Number(response.headers.get("content-length"));
  if (response.status === 422) {
    const message = await response.text();
    throw new MediaRejectedError(message.slice(0, 500));
  }
  if (!response.ok || !response.body || !Number.isSafeInteger(size)) {
    await response.body?.cancel();
    throw new Error(`Media container returned ${response.status}`);
  }
  return { body: response.body, size, headers: response.headers };
}

export interface CloudMediaPart {
  name: MediaPartName;
  r2Key: string;
  mediaType: string;
}

/**
 * Runs a job's lock or conform as a ComfyUI graph on Comfy Cloud (see
 * packages/comfy/src/workflows/media-graphs.ts) and returns its MP4. The parts
 * stream from R2 into Cloud's uploads one at a time; nothing is buffered.
 */
export async function renderCloudMedia(
  env: JobsEnv,
  operation: MediaOperation,
  parts: readonly CloudMediaPart[],
  signal: AbortSignal,
  /** The source's sample aspect, when its pixels are not square. */
  pixelAspect?: number | null,
): Promise<{ body: ReadableStream<Uint8Array>; size: number }> {
  try {
    return await runCloudMedia({
      apiKey: env.COMFY_API_KEY ?? "",
      baseUrl: (env as { COMFY_BASE_URL?: string }).COMFY_BASE_URL,
      operation,
      parts: parts.map((part) => ({
        name: part.name,
        contentType: part.mediaType,
        async open() {
          const object = await env.GENERATED_ASSETS.get(part.r2Key);
          if (!object)
            throw new Error(`Media part "${part.name}" is not stored`);
          return { body: object.body, size: object.size };
        },
      })),
      pixelAspect,
      signal,
    });
  } catch (error) {
    // Cloud refused the graph or the run failed on this media: retrying cannot help.
    if (error instanceof CloudMediaRejectedError)
      throw new MediaRejectedError(error.message);
    throw error;
  }
}
