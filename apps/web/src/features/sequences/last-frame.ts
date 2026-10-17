import { mediaItemSchema } from "@/features/library/model";
import type { AssetRef } from "@open-cinema/contracts";

/**
 * Continuing a shot starts the next one from the exact frame the previous take
 * ends on. The browser decodes the take, draws its final frame and uploads it
 * as an image, so the continuation's first frame is the previous last frame.
 */
export async function captureLastFrame(
  videoUrl: string,
  filename: string,
  signal?: AbortSignal,
): Promise<AssetRef> {
  const blob = await lastFrameBlob(videoUrl, signal);
  const response = await fetch("/api/media/upload", {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "X-Media-Filename": encodeURIComponent(filename),
      "X-Media-Width": String(blob.width),
      "X-Media-Height": String(blob.height),
    },
    body: blob.png,
    ...(signal ? { signal } : {}),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      (body as { error?: string } | null)?.error ??
        "The frame could not be saved. Try again.",
    );
  return mediaItemSchema.parse(body).ref;
}

async function lastFrameBlob(
  url: string,
  signal?: AbortSignal,
): Promise<{ png: Blob; width: number; height: number }> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  const settle = (event: "loadedmetadata" | "seeked") =>
    new Promise<void>((resolve, reject) => {
      const done = () => {
        cleanup();
        resolve();
      };
      const fail = () => {
        cleanup();
        reject(new Error("This take could not be read in the browser."));
      };
      const abort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const cleanup = () => {
        video.removeEventListener(event, done);
        video.removeEventListener("error", fail);
        signal?.removeEventListener("abort", abort);
      };
      video.addEventListener(event, done, { once: true });
      video.addEventListener("error", fail, { once: true });
      signal?.addEventListener("abort", abort, { once: true });
    });
  try {
    const loaded = settle("loadedmetadata");
    video.src = url;
    await loaded;
    // The very last timestamp often has no decodable frame; step back a hair.
    const seeked = settle("seeked");
    video.currentTime = Math.max(0, video.duration - 0.05);
    await seeked;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width)
      throw new Error("This take could not be read in the browser.");
    context.drawImage(video, 0, 0);
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!png) throw new Error("The frame could not be encoded.");
    return { png, width: canvas.width, height: canvas.height };
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}
