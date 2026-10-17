import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity as ActivityIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useGeneration } from "@/features/generation/store";
import { JobList } from "@/features/generation/job-list";
export const Route = createFileRoute("/activity")({ component: Activity });
function Activity() {
  const { snapshot, connection } = useGeneration();
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <PageHeader
        title="Activity"
        description={
          connection === "live"
            ? "Live updates across all your generations."
            : "Connecting to your jobs. Existing jobs keep running."
        }
      />
      {snapshot?.jobs.length ? (
        <div className="mt-6 max-w-4xl">
          <JobList jobs={snapshot.jobs} />
        </div>
      ) : (
        <EmptyState
          icon={ActivityIcon}
          title="Nothing is running"
          className="mt-8"
          actions={
            <Button asChild>
              <Link to="/">Start in Studio</Link>
            </Button>
          }
        >
          <p>
            Every image, video and revision you start shows its progress here,
            even after you leave the page.
          </p>
        </EmptyState>
      )}
    </section>
  );
}
