import { readContainerMeta } from "./mp4-meta";

export interface MediaProbe {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  poster: Blob | null;
}

const POSTER_EDGE = 640;

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
      poster,
    };
  } finally {
    bitmap.close();
  }
}

function once(target: HTMLVideoElement, event: string, timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${event} timed out`)),
      timeoutMs,
    );
    target.addEventListener(
      event,
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    target.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("Video could not be decoded"));
      },
      { once: true },
    );
  });
}

async function probeVideo(file: File): Promise<MediaProbe> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const metadata = once(video, "loadedmetadata");
    video.src = url;
    await metadata;
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    const seeked = once(video, "seeked");
    // A frame slightly in avoids black fade-in frames.
    video.currentTime = Math.min(1, (duration ?? 0) * 0.1);
    await seeked;
    return {
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      durationSeconds: duration,
      poster: video.videoWidth
        ? await drawPoster(video, video.videoWidth, video.videoHeight)
        : null,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Browser-side measurements. Failure is non-fatal: the upload proceeds without them. */
export async function probeMedia(file: File): Promise<MediaProbe> {
  try {
    return file.type.startsWith("video/")
      ? await probeVideo(file)
      : await probeImage(file);
  } catch {
    // Undecodable codec: the container still knows duration and frame size.
    const meta =
      file.type === "video/mp4" || file.type === "video/quicktime"
        ? await readContainerMeta(file).catch(() => null)
        : null;
    return {
      width: meta?.width || null,
      height: meta?.height || null,
      durationSeconds: meta?.durationSeconds || null,
      poster: null,
    };
  }
}
