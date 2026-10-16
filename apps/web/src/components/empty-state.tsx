import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * An empty 2.39:1 frame with crop marks: the place where the work will appear.
 * Use it for any surface that has no content yet, and always offer a next step.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  actions,
  className,
}: {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "relative flex min-h-72 flex-col items-center justify-center rounded-sm bg-surface/60 px-6 py-12 text-center md:aspect-[2.39/1] md:min-h-0",
        className,
      )}
    >
      <CropMarks />
      {Icon && (
        <Icon
          aria-hidden="true"
          className="mb-5 size-6 text-subtle-foreground"
          strokeWidth={1.5}
        />
      )}
      <h2 className="text-base font-medium">{title}</h2>
      {children && (
        <div className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {children}
        </div>
      )}
      {actions && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}

const marks = [
  "top-0 left-0 border-t border-l",
  "top-0 right-0 border-t border-r",
  "bottom-0 left-0 border-b border-l",
  "bottom-0 right-0 border-b border-r",
];

function CropMarks() {
  return (
    <>
      {marks.map((position) => (
        <span
          key={position}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute size-5 border-subtle-foreground/70",
            position,
          )}
        />
      ))}
    </>
  );
}
