import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ElementCreate } from "@/features/elements/element-create";

export const Route = createFileRoute("/elements/new")({
  validateSearch: z.object({
    type: z.enum(["character", "location", "thing"]).optional(),
  }),
  head: () => ({ meta: [{ title: "New Element · Open Cinema" }] }),
  component: NewElement,
});
function NewElement() {
  const { type } = Route.useSearch();
  // Keyed so following a different "New …" link starts a fresh form.
  return <ElementCreate key={type ?? "any"} initialType={type} />;
}
