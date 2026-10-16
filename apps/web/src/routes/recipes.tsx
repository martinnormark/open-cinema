import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/recipes")({
  head: () => ({ meta: [{ title: "Recipes · Open Cinema" }] }),
  component: () => (
    <PlaceholderPage
      title="Recipes"
      description="Keep a creative direction worth using again."
      icon={BookOpen}
      emptyTitle="No recipes saved"
      detail="When a look works, save its direction, references and capabilities as a recipe and apply it to new subjects without rewriting the prompt."
    />
  ),
});
