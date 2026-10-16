import { createFileRoute } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/projects")({
  head: () => ({ meta: [{ title: "Projects · Open Cinema" }] }),
  component: () => (
    <PlaceholderPage
      title="Projects"
      description="Give every story a place to grow."
      icon={FolderOpen}
      emptyTitle="No projects yet"
      detail="A project holds its direction, related images and shot sequence, so every new shot belongs. Start from a first frame and the project grows from there."
    />
  ),
});
