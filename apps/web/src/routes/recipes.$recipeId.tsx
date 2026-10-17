import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RecipePage } from "@/features/recipes/recipe-page";

export const Route = createFileRoute("/recipes/$recipeId")({
  validateSearch: z.object({ edit: z.boolean().optional() }),
  head: () => ({ meta: [{ title: "Recipe · Open Cinema" }] }),
  component: Recipe,
});

function Recipe() {
  const { recipeId } = Route.useParams();
  const { edit } = Route.useSearch();
  return (
    <RecipePage
      key={`${recipeId}:${edit ? "edit" : "view"}`}
      recipeId={recipeId}
      editing={!!edit}
    />
  );
}
