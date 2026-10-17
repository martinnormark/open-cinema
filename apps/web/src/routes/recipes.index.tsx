import { createFileRoute } from "@tanstack/react-router";
import { RecipesIndex } from "@/features/recipes/recipes-index";

export const Route = createFileRoute("/recipes/")({
  head: () => ({ meta: [{ title: "Recipes · Open Cinema" }] }),
  component: RecipesIndex,
});
