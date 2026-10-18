import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { RevisionView } from "@/features/revision/revision-view";
import { getRevisionView } from "@/server/revisions";

export const Route = createFileRoute("/revisions/$revisionId")({
  loader: ({ params }) =>
    getRevisionView({ data: { revisionId: params.revisionId } }),
  head: () => ({ meta: [{ title: "Revision · Open Cinema" }] }),
  component: Revision,
});

function Revision() {
  const view = Route.useLoaderData();
  if (!view.signedIn || !view.revision)
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14">
        <h1 id="page-title" className="sr-only">
          Revision not found
        </h1>
        <EmptyState
          title="This revision isn’t here"
          actions={
            <Button asChild>
              <Link to="/revisions/new">Change a take</Link>
            </Button>
          }
        >
          <p>It may belong to another session, or the link is incomplete.</p>
        </EmptyState>
      </section>
    );
  return (
    <RevisionView
      key={view.revision.id}
      revision={view.revision}
      project={view.project}
      decisions={view.decisions}
      history={view.history}
      checks={view.checks}
    />
  );
}
