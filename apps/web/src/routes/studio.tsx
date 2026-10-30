import { createFileRoute } from "@tanstack/react-router";
import { PromptStudio } from "@/features/generation/prompt-studio";
import { getStudioIntroduction } from "@/server/studio";
export const Route = createFileRoute("/studio")({
  loader: () => getStudioIntroduction(),
  head: () => ({ meta: [{ title: "Studio · Open Cinema" }] }),
  component: Studio,
});
function Studio() {
  return <PromptStudio introduction={Route.useLoaderData()} />;
}
