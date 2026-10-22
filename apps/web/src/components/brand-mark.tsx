import { cn } from "@/lib/utils";

/**
 * Open Cinema mark: a lit frame with letterbox bars. The geometry is fixed by
 * DESIGN.md (tile radius 25%, bar inset 15% / 35%, bar radius 5%) and matches
 * public/favicon.svg and the showcase film.
 *
 * - `lamp` (default): tungsten tile, ink bar. On the app's dark surfaces.
 * - `ink`: ink tile, tungsten bar. On a tungsten flood (the end card).
 */
export function BrandMark({
  className,
  tone = "lamp",
}: {
  className?: string;
  tone?: "lamp" | "ink";
}) {
  const [tile, bar] =
    tone === "ink"
      ? ["var(--tungsten-foreground)", "var(--tungsten)"]
      : ["var(--tungsten)", "var(--tungsten-foreground)"];
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <rect width="20" height="20" rx="5" fill={tile} />
      <rect x="3" y="7" width="14" height="6" rx="1" fill={bar} />
    </svg>
  );
}

/**
 * Mark and wordmark, locked up as in the showcase film: the mark is 0.83 of
 * the type size and sits 0.22em from the word. Size it with a text utility;
 * everything scales from the font size.
 */
export function BrandLockup({
  className,
  tone = "lamp",
}: {
  className?: string;
  tone?: "lamp" | "ink";
}) {
  return (
    <span
      className={cn(
        "brand-lockup inline-flex items-center gap-[0.22em]",
        className,
      )}
    >
      <BrandMark tone={tone} className="size-[0.83em] shrink-0" />
      <span className="brand-wordmark">Open Cinema</span>
    </span>
  );
}
