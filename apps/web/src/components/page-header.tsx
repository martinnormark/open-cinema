import type { ReactNode } from "react";

/** Page title block shared by studio surfaces; actions sit on the right. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 id="page-title" className="text-title font-semibold">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-body leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}
