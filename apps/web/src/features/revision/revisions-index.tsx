import { Link } from "@tanstack/react-router";
import { Wand2 } from "lucide-react";
import type { Revision } from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { Thumbnail } from "@/features/library";
import { useGeneration } from "@/features/generation/store";
import { posterUrl } from "@/lib/media-url";
import {
  phaseLabels,
  replacementKinds,
  revisionKindOf,
  revisionPhase,
  revisionResult,
} from "./model";

/** Every revision, newest first; each opens beside its original. */
export function RevisionsIndex({ revisions }: { revisions: Revision[] }) {
  const { snapshot } = useGeneration();
  const jobs = snapshot?.jobs ?? [];
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <PageHeader
        title="Revisions"
        description="Every change you made to a take. Each one keeps its original beside it for comparison."
        actions={
          revisions.length > 0 && (
            <Button asChild>
              <Link to="/revisions/new">
                <Wand2 aria-hidden="true" /> New revision
              </Link>
            </Button>
          )
        }
      />
      {revisions.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={Wand2}
          title="No revisions yet"
          actions={
            <Button asChild>
              <Link to="/revisions/new">Change a take</Link>
            </Button>
          }
        >
          <p>Move a take to a new Location or recast one of its characters.</p>
        </EmptyState>
      ) : (
        <ul className="mt-10 grid gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {revisions.map((revision) => {
            const job = jobs.find((j) => j.id === revision.jobId);
            const result = revisionResult(revision, job);
            const phase = revisionPhase(revision.status, job, !!result);
            const kind = revisionKindOf(revision.workflowKind);
            return (
              <li key={revision.id}>
                <Link
                  to="/revisions/$revisionId"
                  params={{ revisionId: revision.id }}
                  className="group block no-underline"
                >
                  <span className="relative block aspect-video overflow-hidden rounded-lg bg-letterbox">
                    <Thumbnail
                      src={posterUrl(result ?? revision.source)}
                      kind="video"
                      className={cn(
                        "size-full transition-opacity duration-(--duration-fast)",
                        result ? "opacity-100" : "opacity-45",
                      )}
                    />
                    <span
                      className={cn(
                        "absolute top-2 left-2 rounded-md bg-scrim/85 px-1.5 py-0.5 text-caption font-medium",
                        phase === "kept"
                          ? "text-success"
                          : phase === "failed" || phase === "attention"
                            ? "text-destructive"
                            : phase === "ready"
                              ? "text-on-media"
                              : "text-tungsten",
                      )}
                    >
                      {phaseLabels[phase]}
                    </span>
                  </span>
                  <span className="mt-2 block text-sm font-medium group-hover:underline">
                    {replacementKinds[kind].label}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    {revision.intent}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
