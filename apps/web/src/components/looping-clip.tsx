import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/** Plays only while a quarter of the clip is on screen, so off-screen loops never decode. */
function playWhileVisible(video: HTMLVideoElement | null) {
  if (!video) return;
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    },
    { threshold: 0.25 },
  );
  observer.observe(video);
  return () => observer.disconnect();
}

/**
 * A short silent loop of finished work. Decorative by default; with reduced
 * motion it is its poster, a still that says the same thing.
 */
export function LoopingClip({
  src,
  poster,
  className,
}: {
  src: string;
  poster: string;
  className?: string;
}) {
  const still = useReducedMotion();
  if (still)
    return (
      <img
        src={poster}
        alt=""
        decoding="async"
        className={cn("size-full object-cover", className)}
      />
    );
  return (
    <video
      ref={playWhileVisible}
      src={src}
      poster={poster}
      aria-hidden="true"
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      className={cn("size-full object-cover", className)}
    />
  );
}
