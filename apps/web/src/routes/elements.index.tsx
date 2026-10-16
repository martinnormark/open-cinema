import { createFileRoute } from "@tanstack/react-router";
import { ElementIndex } from "@/features/elements/element-index";

export const Route = createFileRoute("/elements/")({
  head: () => ({ meta: [{ title: "Elements · Open Cinema" }] }),
  component: ElementIndex,
});
