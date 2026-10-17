import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ProjectHome } from "@/features/revision/project-home";
import { getProjectHome } from "@/server/revisions";
import { getProjectShots } from "@/server/projects";

export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ params }) => {
    const home = await getProjectHome({
      data: { projectId: params.projectId },
    });
    return {
      home,
      shots:
        home.signedIn && home.project
          ? await getProjectShots({ data: { projectId: params.projectId } })
          : [],
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.home.signedIn && loaderData.home.project ? loaderData.home.project.name : "Project"} · Open Cinema`,
      },
    ],
  }),
  component: Project,
});

function Project() {
  const { home, shots } = Route.useLoaderData();
  if (!home.signedIn || !home.project)
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14">
        <h1 id="page-title" className="sr-only">
          Project not found
        </h1>
        <EmptyState
          icon={FolderOpen}
          title="This project isn’t here"
          actions={
            <Button asChild>
              <Link to="/projects">All projects</Link>
            </Button>
          }
        >
          <p>
            It may belong to another session, or it was never created in this
            browser.
          </p>
        </EmptyState>
      </section>
    );
  return (
    <ProjectHome
      key={home.project.id}
      project={home.project}
      revisions={home.revisions}
      shots={shots}
    />
  );
}
