import { createFileRoute } from "@tanstack/react-router";
import { PromptStudio } from "@/features/generation/prompt-studio";
import { getStudioIntroduction } from "@/server/studio";
export const Route = createFileRoute("/")({
  loader: () => getStudioIntroduction(),
  component: Studio,
});
function Studio() {
  return <PromptStudio introduction={Route.useLoaderData()} />;
}
