import type { SyntheticEvent } from "react";
import { posterFromUrl } from "./video-frames-client";

/**
 * A stored video without a poster (an older upload, or a result a job saved)
 * gets one drawn here from its original and saved beside it, so every later
 * view loads it directly. The poster routes answer 404 until then.
 */

const repairs = new Map<string, Promise<boolean>>();
const checks = new Map<string, Promise<"present" | "made" | "failed">>();
/** Decoding is heavy; a grid of older clips repairs two at a time. */
let slots = 2;
const queue: (() => void)[] = [];

async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (slots > 0) slots--;
  else await new Promise<void>((resolve) => queue.push(resolve));
  try {
    return await work();
  } finally {
    const next = queue.shift();
    if (next) next();
    else slots++;
  }
}

/** The poster URL without cache-busting, so every view shares one repair. */
function canonical(posterUrl: string) {
  const url = new URL(posterUrl, window.location.origin);
  url.searchParams.delete("retry");
  return url;
}

function withRetry(posterUrl: string) {
  const url = new URL(posterUrl, window.location.origin);
  url.searchParams.set("retry", "1");
  return url.href;
}

async function make(poster: URL) {
  const original = new URL(poster);
  original.searchParams.delete("variant");
  const frame = await slot(() =>
    posterFromUrl(original.pathname + original.search),
  ).catch(() => null);
  if (!frame) return false;
  const headers: Record<string, string> = {
    "Content-Type": frame.blob.type,
    "X-Poster-Width": String(frame.width),
    "X-Poster-Height": String(frame.height),
  };
  if (frame.durationSeconds)
    headers["X-Poster-Duration-Ms"] = String(
      Math.round(frame.durationSeconds * 1000),
    );
  const saved = await fetch(poster.pathname + poster.search, {
    method: "PUT",
    headers,
    body: frame.blob,
  }).catch(() => null);
  return saved?.ok ?? false;
}

/** Draws and saves a missing poster once per page; true when it was saved. */
export function repairPoster(posterUrl: string): Promise<boolean> {
  const url = canonical(posterUrl);
  let pending = repairs.get(url.href);
  if (!pending) {
    pending = make(url).then((made) => {
      // A later view tries again, e.g. once a just-finished result is listed.
      if (!made) repairs.delete(url.href);
      return made;
    });
    repairs.set(url.href, pending);
  }
  return pending;
}

/** `onError` for a video's poster `<img>`: repair it, then load it again. */
export function repairOnError(event: SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  const src = img.getAttribute("src");
  if (!src || src.startsWith("blob:") || img.dataset.repaired) return;
  img.dataset.repaired = "true";
  void repairPoster(src).then((made) => {
    if (made && img.getAttribute("src") === src) img.src = withRetry(src);
  });
}

/**
 * Callback ref for a `<video poster>`: a video element does not report a
 * poster that failed to load, so the poster is checked once per page.
 */
export function repairVideoPoster(video: HTMLVideoElement | null) {
  const poster = video?.getAttribute("poster");
  if (!video || !poster || poster.startsWith("blob:")) return;
  const key = canonical(poster).href;
  let missing = checks.get(key);
  if (!missing) {
    missing = fetch(poster, { method: "HEAD" })
      .then(async (r) =>
        r.ok
          ? "present"
          : r.status === 404 && (await repairPoster(poster))
            ? "made"
            : "failed",
      )
      .catch(() => "failed" as const)
      .then((state) => {
        if (state === "failed") checks.delete(key);
        return state;
      });
    checks.set(key, missing);
  }
  void missing.then((state) => {
    if (state === "made" && video.getAttribute("poster") === poster)
      video.poster = withRetry(poster);
  });
}
