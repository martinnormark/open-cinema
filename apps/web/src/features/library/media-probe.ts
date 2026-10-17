import { POSTER_EDGE } from "./video-frames";
import { posterFromElement, readVideo } from "./video-frames-client";

export interface MediaProbe {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Video only, from the frames' timestamps; null when unknown. */
  fps: number | null;
  /** Sample aspect ratio; 1 means square pixels. */
  pixelAspect: number | null;
  hasAudio: boolean | null;
  poster: Blob | null;
}

const noVideoMeta = { fps: null, pixelAspect: null, hasAudio: null };

function drawPoster(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Blob | null> {
  const scale = Math.min(1, POSTER_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/webp", 0.82),
  );
}

async function probeImage(file: File): Promise<MediaProbe> {
  // Decodes off the main thread where supported; animated GIFs use frame one.
  const bitmap = await createImageBitmap(file);
  try {
    const poster =
      Math.max(bitmap.width, bitmap.height) > POSTER_EDGE ||
      file.size > 512 * 1024
        ? await drawPoster(bitmap, bitmap.width, bitmap.height)
        : null;
    return {
      width: bitmap.width,
      height: bitmap.height,
      durationSeconds: null,
      ...noVideoMeta,
      poster,
    };
  } finally {
    bitmap.close();
  }
}

async function probeVideo(file: File): Promise<MediaProbe> {
  // Mediabunny reads the container without decoding; the poster needs WebCodecs
  // and falls back to the <video> element's decoder.
  const read = await readVideo(file).catch(() => null);
  const poster = read?.poster ?? (await posterFromElement(file));
  return {
    width: read?.width ?? poster?.width ?? null,
    height: read?.height ?? poster?.height ?? null,
    durationSeconds: read?.durationSeconds ?? poster?.durationSeconds ?? null,
    fps: read?.fps ?? null,
    pixelAspect: read?.pixelAspect ?? null,
    hasAudio: read?.hasAudio ?? null,
    poster: poster?.blob ?? null,
  };
}

/** Browser-side measurements. Failure is non-fatal: the upload proceeds without them. */
export async function probeMedia(file: File): Promise<MediaProbe> {
  try {
    return file.type.startsWith("video/")
      ? await probeVideo(file)
      : await probeImage(file);
  } catch {
    return {
      width: null,
      height: null,
      durationSeconds: null,
      ...noVideoMeta,
      poster: null,
    };
  }
}
