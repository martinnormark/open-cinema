import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { parseAssetRefKey } from "@/features/library";
import { ReplacementStudio } from "@/features/revision/replacement-studio";
import { TaskHero } from "@/features/revision/task-hero";
import { takeGoalForKind } from "@/features/start/goals";
import { replacementKindSchema } from "@/features/revision/model";
import { getProjectHome, getRevisionView } from "@/server/revisions";

export const Route = createFileRoute("/revisions/new")({
  validateSearch: z.object({
    source: z.string().max(400).optional(),
    kind: replacementKindSchema.optional(),
    project: z.string().max(100).optional(),
    /** An Element chosen on the front page for this mode. */
    element: z.string().max(100).optional(),
    parent: z.string().max(100).optional(),
    /** A failed revision whose choices "Try again" starts from. */
    retry: z.string().max(100).optional(),
  }),
  loaderDeps: ({ search }) => ({
    project: search.project,
    retry: search.retry,
  }),
  loader: async ({ deps }) => {
    const [home, retry] = await Promise.all([
      deps.project
        ? getProjectHome({ data: { projectId: deps.project } })
        : null,
      deps.retry ? getRevisionView({ data: { revisionId: deps.retry } }) : null,
    ]);
    return {
      project: home?.signedIn ? (home.project ?? null) : null,
      draft: retry?.signedIn && retry.revision ? retry.decisions : null,
    };
  },
  head: ({ match }) => ({
    meta: [
      {
        title: `${takeGoalForKind(match.search.kind ?? "background").title} · Open Cinema`,
      },
    ],
  }),
  component: NewRevision,
});

function NewRevision() {
  const { project, draft } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const kind = search.kind ?? draft?.kind ?? "background";
  return (
    <section
      className="mx-auto w-full max-w-7xl px-6 pt-8 pb-32 md:px-10 md:pt-10"
      aria-labelledby="page-title"
    >
      {project && (
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" /> {project.name}
        </Link>
      )}
      <TaskHero kind={kind} />
      <div className="mt-10 md:mt-12">
        <ReplacementStudio
          key={`${search.source ?? ""}-${search.element ?? ""}-${search.retry ?? ""}`}
          initialSource={search.source ? parseAssetRefKey(search.source) : null}
          kind={kind}
          kindChosen={search.kind !== undefined || !!draft?.kind}
          onKind={(next) =>
            void navigate({
              search: (prev) => ({ ...prev, kind: next }),
              replace: true,
              resetScroll: false,
            })
          }
          initialElementId={search.element}
          projectId={project?.id}
          parentRevisionId={search.parent}
          draft={draft}
        />
      </div>
    </section>
  );
}
