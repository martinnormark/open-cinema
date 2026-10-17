import { createFileRoute } from "@tanstack/react-router";
import { ProjectsIndex } from "@/features/revision/projects-index";
import { getProjects } from "@/server/revisions";

export const Route = createFileRoute("/projects/")({
  head: () => ({ meta: [{ title: "Projects · Open Cinema" }] }),
  loader: () => getProjects(),
  component: Projects,
});
function Projects() {
  const { signedIn, projects } = Route.useLoaderData();
  return <ProjectsIndex signedIn={signedIn} projects={projects} />;
}
