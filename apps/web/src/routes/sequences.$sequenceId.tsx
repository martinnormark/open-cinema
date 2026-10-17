import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SequenceBoard } from "@/features/sequences/sequence-board";
import { getSequenceView } from "@/server/sequences";

export const Route = createFileRoute("/sequences/$sequenceId")({
  validateSearch: z.object({ note: z.string().max(300).optional() }),
  loader: async ({ params }) =>
    getSequenceView({ data: { sequenceId: params.sequenceId } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.signedIn && loaderData.sequence ? loaderData.sequence.title : "Sequence"} · Open Cinema`,
      },
    ],
  }),
  component: SequencePage,
});

function SequencePage() {
  const view = Route.useLoaderData();
  const { note } = Route.useSearch();
  if (!view.signedIn || !view.sequence)
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14">
        <h1 id="page-title" className="sr-only">
          Sequence not found
        </h1>
        <EmptyState
          icon={Clapperboard}
          title="This sequence isn’t here"
          actions={
            <Button asChild>
              <Link to="/sequences">All sequences</Link>
            </Button>
          }
        >
          <p>It may belong to another session, or it was deleted.</p>
        </EmptyState>
      </section>
    );
  return (
    <SequenceBoard
      key={view.sequence.id}
      initial={view.sequence}
      project={view.project}
      revisions={view.revisions}
      note={note}
    />
  );
}
