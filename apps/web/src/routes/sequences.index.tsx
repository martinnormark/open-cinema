import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Clapperboard } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { SequencesIndex } from "@/features/sequences/sequences-index";
import { getSequencesHome } from "@/server/sequences";

export const Route = createFileRoute("/sequences/")({
  validateSearch: z.object({ project: z.string().max(100).optional() }),
  loader: () => getSequencesHome(),
  head: () => ({ meta: [{ title: "Sequences · Open Cinema" }] }),
  component: Sequences,
});

function Sequences() {
  const home = Route.useLoaderData();
  const search = Route.useSearch();
  if (!home.signedIn)
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14">
        <h1 id="page-title" className="sr-only">
          Sequences
        </h1>
        <EmptyState icon={Clapperboard} title="Start a session to direct">
          <p>
            Sequences belong to your session. Start a local session in the
            Studio, then come back to plan your shots.
          </p>
        </EmptyState>
      </section>
    );
  return (
    <SequencesIndex
      sequences={home.sequences}
      projects={home.projects}
      initialProjectId={search.project}
    />
  );
}
