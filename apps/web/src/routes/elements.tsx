import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/elements")({
  head: () => ({ meta: [{ title: "Elements · Open Cinema" }] }),
  component: () => (
    <PlaceholderPage
      title="Elements"
      description="The people, places, and things that make a world yours."
      detail="Create Characters, Locations, and Things with curated reference sheets and reusable states. Element authoring is not available yet."
    />
  ),
});
