import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PromptStudio } from "@/features/generation/prompt-studio";
import { getStudioIntroduction } from "@/server/studio";
export const Route = createFileRoute("/")({
  validateSearch: z.object({ project: z.string().max(100).optional() }),
  loader: () => getStudioIntroduction(),
  component: Studio,
});
function Studio() {
  const { project } = Route.useSearch();
  return (
    <PromptStudio
      key={project ?? "studio"}
      introduction={Route.useLoaderData()}
      {...(project ? { projectId: project } : {})}
    />
  );
}
