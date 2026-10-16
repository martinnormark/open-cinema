import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Open Cinema" }] }),
  component: () => (
    <PlaceholderPage
      title="Settings"
      description="Make the studio work for you."
      detail="Account, generation, and storage preferences will live here. Settings are not available yet."
    />
  ),
});
