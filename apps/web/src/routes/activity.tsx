import { createFileRoute, Link } from "@tanstack/react-router";
import { useGeneration } from "@/features/generation/store";
import { JobList } from "@/features/generation/job-list";
export const Route = createFileRoute("/activity")({ component: Activity });
function Activity() {
  const { snapshot, connection } = useGeneration();
  return (
    <section className="mx-auto max-w-5xl px-6 pt-10 pb-32 md:px-12 md:pt-14">
      <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {connection === "live"
          ? "Live updates across all your generations."
          : "Connecting to your jobs. Existing jobs keep running."}
      </p>
      {snapshot?.jobs.length ? (
        <div className="mt-6">
          <JobList jobs={snapshot.jobs} />
        </div>
      ) : (
        <p className="mt-8 text-sm">
          No generations to show.{" "}
          <Link to="/" className="underline underline-offset-4">
            Start in Studio
          </Link>
          .
        </p>
      )}
    </section>
  );
}
