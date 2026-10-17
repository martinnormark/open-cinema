import {
  canvasBlob,
  POSTER_EDGE,
  posterTime,
  SquarePixelsError,
  type PosterFrame,
  type VideoFacts,
} from "./video-frames";
import type {
  VideoWorkerRequest,
  VideoWorkerResponse,
} from "./video-frames.worker";

/**
 * Main-thread side of the browser's video work. Mediabunny runs in
 * video-frames.worker.ts; only the `<video>` element fallback runs here.
 */

let worker: Worker | null = null;
let nextId = 1;
type Answer = Exclude<VideoWorkerResponse, { type: "progress" }>;
const pending = new Map<number, (answer: Answer) => void>();
const progressHandlers = new Map<number, (progress: number) => void>();

type Unsent<T> = T extends unknown ? Omit<T, "id"> : never;

function call(
  request: Unsent<VideoWorkerRequest>,
  onProgress?: (progress: number) => void,
) {
  worker ??= (() => {
    const w = new Worker(new URL("./video-frames.worker.ts", import.meta.url), {
      type: "module",
      name: "video-frames",
    });
    w.onmessage = (event: MessageEvent<VideoWorkerResponse>) => {
      const response = event.data;
      if (response.type === "progress") {
        progressHandlers.get(response.id)?.(response.progress);
        return;
      }
      pending.get(response.id)?.(response);
      pending.delete(response.id);
      progressHandlers.delete(response.id);
    };
    w.onerror = () => {
      for (const [id, resolve] of pending)
        resolve({
          id,
          ok: false,
          type: "error",
          error: "The video worker stopped.",
        });
      pending.clear();
      progressHandlers.clear();
      worker = null;
    };
    return w;
  })();
  const id = nextId++;
  if (onProgress) progressHandlers.set(id, onProgress);
  return new Promise<Answer>((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ ...request, id });
  });
}
/**
 * Measures a clip and draws its poster with WebCodecs. `poster` is null when
 * this browser cannot decode the codec; the measurements come from the
 * container alone.
 */
export async function readVideo(
  source: Blob | string,
): Promise<VideoFacts & { poster: PosterFrame | null }> {
  const response = await call({
    type: "read",
    // The worker resolves relative URLs against its own script, not the page.
    source:
      typeof source === "string"
        ? new URL(source, window.location.href).href
        : source,
  });
  if (!response.ok) throw new Error(response.error);
  if (response.type !== "read") throw new Error("Unexpected worker answer");
  return { ...response.facts, poster: response.poster };
}

/**
 * Resamples a clip with non-square pixels to its display size with square
 * pixels (see video-frames.ts), in the worker.
 */
export async function convertToSquarePixels(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<{ file: File; width: number; height: number }> {
  const response = await call({ type: "square", file }, onProgress);
  if (!response.ok) throw new SquarePixelsError(response.error);
  if (response.type !== "square") throw new Error("Unexpected worker answer");
  return {
    file: new File([response.bytes], response.name, { type: "video/mp4" }),
    width: response.width,
    height: response.height,
  };
}

/**
 * Poster for a stored video, by URL. Falls back to the browser's own decoder
 * when WebCodecs cannot decode the codec (e.g. HEVC on some systems).
 */
export async function posterFromUrl(url: string): Promise<PosterFrame | null> {
  const read = await readVideo(url).catch(() => null);
  return read?.poster ?? (await posterFromElement(url));
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

/** The `<video>` element's decoder, for codecs WebCodecs does not offer. */
export async function posterFromElement(
  source: Blob | string,
): Promise<PosterFrame | null> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
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
    video.currentTime = posterTime(0, duration ?? 0);
    await seeked;
    const { videoWidth: width, videoHeight: height } = video;
    if (!width || !height) return null;
    const scale = Math.min(1, POSTER_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas
      .getContext("2d")
      ?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas);
    return blob ? { blob, width, height, durationSeconds: duration } : null;
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}
