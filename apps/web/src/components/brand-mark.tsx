/** Open Cinema mark: a lit frame with letterbox bars. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <rect width="20" height="20" rx="5" fill="var(--tungsten)" />
      <rect
        x="3"
        y="7"
        width="14"
        height="6"
        rx="1"
        fill="var(--tungsten-foreground)"
      />
    </svg>
  );
}
