import { providerCredentials, type RuntimeEnv } from "@open-cinema/runtime";
import {
  CloudMediaRejectedError,
  runCloudMedia,
  type MediaOperation,
  type MediaPartName,
} from "@open-cinema/comfy";

/** Cloud answered with a definite refusal (bad input), not a transport error. */
export class MediaRejectedError extends Error {}

/** A graph input stored in private storage, streamed to Cloud when the graph runs. */
export interface StoredMediaPart {
  name: MediaPartName;
  r2Key: string;
  mediaType: string;
}

/**
 * Runs a job's lock, conform or square-pixel step as a ComfyUI graph on Comfy Cloud (see
 * packages/comfy/src/workflows/media-graphs.ts) and returns its MP4. The parts
 * stream from private storage into Cloud's uploads one at a time; nothing is buffered.
 */
export async function renderCloudMedia(
  env: RuntimeEnv,
  operation: MediaOperation,
  parts: readonly StoredMediaPart[],
  signal: AbortSignal,
  /** The source's sample aspect, when its pixels are not square. */
  pixelAspect?: number | null,
): Promise<{ body: ReadableStream<Uint8Array>; size: number }> {
  try {
    return await runCloudMedia({
      ...providerCredentials(env, "cloud"),
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
