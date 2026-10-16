import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/library")({
  head: () => ({ meta: [{ title: "Library · Open Cinema" }] }),
  component: () => (
    <PlaceholderPage
      title="Library"
      description="Your images, films, and references, together."
      detail="Browse the work you choose to keep and bring it into new projects. Uploading and saving media are not available yet."
    />
  ),
});
