import { getContainer } from "@cloudflare/containers";
import type { MediaOperation } from "@open-cinema/comfy";

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
 * MP4. Nothing is buffered in the Worker: R2 knows each part's exact length.
 */
export async function renderMedia(
  env: JobsEnv,
  operation: MediaOperation,
  parts: readonly MediaPart[],
  signal: AbortSignal,
): Promise<{ body: ReadableStream<Uint8Array>; size: number }> {
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
  return { body: response.body, size };
}
