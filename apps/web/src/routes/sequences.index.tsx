import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { createFileRoute, Link } from "@tanstack/react-router";
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
      <section className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10 md:px-12 md:py-14">
        <PageHeader
          title="Sequences"
          description="Plan shots that cut together, with a shared creative direction."
        />
        <EmptyState
          icon={Clapperboard}
          title="Start a session to direct"
          actions={
            <Button asChild>
              <Link to="/studio">Go to Studio</Link>
            </Button>
          }
        >
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
