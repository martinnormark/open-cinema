import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "Projects · Open Cinema" }] }),
  component: () => (
    <PlaceholderPage
      title="Projects"
      description="Give every story a place to grow."
      detail="Project direction, related images, and shot sequences will live here. Project creation is not available yet."
    />
  ),
});
