import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { WorldPage } from "@/features/world/world-page";
import { getWorldHome } from "@/server/world";

export const Route = createFileRoute("/world")({
  loader: () => getWorldHome(),
  head: () => ({ meta: [{ title: "Move your world · Open Cinema" }] }),
  component: World,
});

function World() {
  const home = Route.useLoaderData();
  if (!home.signedIn)
    return (
      <section className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10 md:px-12 md:py-14">
        <PageHeader
          title="Move your world"
          description="Save your creative world, or bring one into this studio."
        />
        <EmptyState
          icon={PackageOpen}
          title="Start a session first"
          actions={
            <Button asChild>
              <Link to="/studio">Go to Studio</Link>
            </Button>
          }
        >
          <p>
            A world is saved from, and brought into, your session. Start a local
            session in the Studio, then come back.
          </p>
        </EmptyState>
      </section>
    );
  return <WorldPage />;
}
