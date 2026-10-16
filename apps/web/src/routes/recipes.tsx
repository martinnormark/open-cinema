import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/recipes")({
  head: () => ({ meta: [{ title: "Recipes · Open Cinema" }] }),
  component: () => (
    <PlaceholderPage
      title="Recipes"
      description="Keep a creative direction worth using again."
      detail="Save combinations of visual direction, references, and capabilities for future work. Recipe authoring is not available yet."
    />
  ),
});
