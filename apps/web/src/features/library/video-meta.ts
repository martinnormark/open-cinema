import { useSyncExternalStore } from "react";

/**
 * Durations that video thumbnails learn from their own metadata, by URL.
 * Generated clips carry no measured duration, so a tile's badge reads it here
 * once the poster frame's metadata has loaded.
 */
const durations = new Map<string, number>();
const listeners = new Set<() => void>();

export function recordVideoDuration(url: string, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  if (durations.get(url) === seconds) return;
  durations.set(url, seconds);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVideoDuration(url: string | null): number | null {
  return useSyncExternalStore(
    subscribe,
    () => (url ? (durations.get(url) ?? null) : null),
    () => null,
  );
}

let observer: IntersectionObserver | null = null;
/**
 * Callback ref: a poster video fetches its metadata and first frame only once
 * it comes near the viewport, so a large library does not open every clip.
 */
export function loadWhenVisible(video: HTMLVideoElement | null) {
  if (!video) return;
  if (typeof IntersectionObserver === "undefined") {
    video.src = video.dataset.src ?? "";
    return;
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLVideoElement;
        observer?.unobserve(target);
        if (target.dataset.src) target.src = target.dataset.src;
      }
    },
    { rootMargin: "200px" },
  );
  observer.observe(video);
  return () => observer?.unobserve(video);
}
