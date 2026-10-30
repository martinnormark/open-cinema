import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseAssetRefKey } from "@/features/library";
import { ReplacementStudio } from "@/features/revision/replacement-studio";
import { TaskHero } from "@/features/revision/task-hero";
import { takeGoalForKind } from "@/features/start/goals";
import { replacementKindSchema } from "@/features/revision/model";
import { getRevisionView } from "@/server/revisions";

export const Route = createFileRoute("/revisions/new")({
  validateSearch: z.object({
    source: z.string().max(400).optional(),
    kind: replacementKindSchema.optional(),
    /** An Element chosen on the front page for this mode. */
    element: z.string().max(100).optional(),
    parent: z.string().max(100).optional(),
    /** A failed revision whose choices "Try again" starts from. */
    retry: z.string().max(100).optional(),
  }),
  loaderDeps: ({ search }) => ({ retry: search.retry }),
  loader: async ({ deps }) => {
    const retry = deps.retry
      ? await getRevisionView({ data: { revisionId: deps.retry } })
      : null;
    return {
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
  const { draft } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const kind = search.kind ?? draft?.kind ?? "background";
  return (
    <section
      className="mx-auto w-full max-w-7xl px-6 pt-8 pb-32 md:px-10 md:pt-10"
      aria-labelledby="page-title"
    >
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
          parentRevisionId={search.parent}
          draft={draft}
        />
      </div>
    </section>
  );
}
