import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const REDUCED = "(prefers-reduced-motion: reduce)";
const reduced = () => window.matchMedia(REDUCED).matches;
const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const serverMotion = () => true;

/**
 * Plays a clip only while at least half of it is on screen, so a sheet of
 * moving references never decodes clips nobody is looking at.
 */
function playWhileVisible(video: HTMLVideoElement | null) {
  if (!video) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    },
    { threshold: 0.5 },
  );
  observer.observe(video);
  return () => observer.disconnect();
}

/**
 * A moving reference loops silently in place. With reduced motion it holds
 * its first frame and offers the controls instead.
 */
export function MovingReference({
  src,
  poster,
  label,
  className,
}: {
  src: string;
  poster?: string | undefined;
  label: string;
  className?: string;
}) {
  const still = useSyncExternalStore(subscribeMotion, reduced, serverMotion);
  return (
    <video
      key={still ? "still" : "moving"}
      ref={still ? undefined : playWhileVisible}
      src={src}
      poster={poster}
      aria-label={label}
      muted
      loop
      playsInline
      preload="metadata"
      controls={still}
      className={cn("reference-reveal size-full object-cover", className)}
    />
  );
}
