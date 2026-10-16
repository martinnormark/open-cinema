import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PlaceholderPage({
  title,
  description,
  detail,
}: {
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <section
      className="mx-auto w-full max-w-5xl px-6 py-10 md:px-12 md:py-16"
      aria-labelledby="page-title"
    >
      <h1
        id="page-title"
        className="text-3xl font-semibold tracking-tight text-balance"
      >
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
        {description}
      </p>
      <div className="mt-12 border-t border-border pt-8">
        <h2 className="text-base font-medium">This space is taking shape</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {detail}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Back to Studio
          </Link>
        </Button>
      </div>
    </section>
  );
}
