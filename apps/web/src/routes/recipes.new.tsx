import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { NewRecipe } from "@/features/recipes/new-recipe";
import { draftRecipeFromJob } from "@/server/recipes";

export const Route = createFileRoute("/recipes/new")({
  validateSearch: z.object({
    /** A finished generation to keep as a recipe. */
    job: z.string().max(100).optional(),
  }),
  loaderDeps: ({ search }) => ({ job: search.job }),
  loader: async ({ deps }) => ({
    draft: deps.job
      ? await draftRecipeFromJob({ data: { jobId: deps.job } })
      : null,
    fromJob: !!deps.job,
  }),
  head: () => ({ meta: [{ title: "New recipe · Open Cinema" }] }),
  component: New,
});

function New() {
  const { draft, fromJob } = Route.useLoaderData();
  return <NewRecipe draft={draft} fromJob={fromJob} />;
}
