import { createFileRoute } from "@tanstack/react-router";
import { RevisionsIndex } from "@/features/revision/revisions-index";
import { getRevisionsHome } from "@/server/revisions";

export const Route = createFileRoute("/revisions/")({
  head: () => ({ meta: [{ title: "Revisions · Open Cinema" }] }),
  loader: () => getRevisionsHome(),
  component: Revisions,
});

function Revisions() {
  const home = Route.useLoaderData();
  return <RevisionsIndex revisions={home.signedIn ? home.revisions : []} />;
}
