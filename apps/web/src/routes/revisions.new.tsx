import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { parseAssetRefKey } from "@/features/library";
import { ReplacementStudio } from "@/features/revision/replacement-studio";
import { getProjectHome, getRevisionView } from "@/server/revisions";

export const Route = createFileRoute("/revisions/new")({
  validateSearch: z.object({
    source: z.string().max(400).optional(),
    kind: z
      .enum([
        "background",
        "character",
        "object",
        "restyle",
        "camera",
        "effect",
      ])
      .optional(),
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
  head: () => ({ meta: [{ title: "New revision · Open Cinema" }] }),
  component: NewRevision,
});

function NewRevision() {
  const { project, draft } = Route.useLoaderData();
  const search = Route.useSearch();
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
      <PageHeader
        title="Revise a shot"
        description="Change one decision and keep everything else you approved. The original stays beside the result."
      />
      <div className="mt-8">
        <ReplacementStudio
          key={`${search.source ?? ""}-${search.kind ?? ""}-${search.element ?? ""}-${search.retry ?? ""}`}
          initialSource={search.source ? parseAssetRefKey(search.source) : null}
          initialKind={search.kind}
          initialElementId={search.element}
          projectId={project?.id}
          parentRevisionId={search.parent}
          draft={draft}
        />
      </div>
    </section>
  );
}
