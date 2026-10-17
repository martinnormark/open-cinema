import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { WorldPage } from "@/features/world/world-page";
import { getWorldHome } from "@/server/world";

export const Route = createFileRoute("/world")({
  validateSearch: z.object({ project: z.string().max(100).optional() }),
  loader: () => getWorldHome(),
  head: () => ({ meta: [{ title: "Move your world · Open Cinema" }] }),
  component: World,
});

function World() {
  const home = Route.useLoaderData();
  const search = Route.useSearch();
  if (!home.signedIn)
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14">
        <h1 id="page-title" className="sr-only">
          Move your world
        </h1>
        <EmptyState icon={PackageOpen} title="Start a session first">
          <p>
            A world is saved from, and brought into, your session. Start a local
            session in the Studio, then come back.
          </p>
        </EmptyState>
      </section>
    );
  return (
    <WorldPage projects={home.projects} initialProjectId={search.project} />
  );
}
