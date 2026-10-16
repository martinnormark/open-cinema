import type { ComponentType, SVGProps } from "react";
import { Link } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export function PlaceholderPage({
  title,
  description,
  detail,
  emptyTitle = "Nothing in frame yet",
  icon = Clapperboard,
}: {
  title: string;
  description: string;
  detail: string;
  emptyTitle?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14"
      aria-labelledby="page-title"
    >
      <PageHeader title={title} description={description} />
      <EmptyState
        className="mt-10"
        icon={icon}
        title={emptyTitle}
        actions={
          <Button asChild>
            <Link to="/">Make a first frame</Link>
          </Button>
        }
      >
        <p>{detail}</p>
      </EmptyState>
    </section>
  );
}
