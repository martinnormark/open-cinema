import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ElementCreate } from "@/features/elements/element-create";
import { parseAssetRefKey } from "@/features/library";

export const Route = createFileRoute("/elements/new")({
  validateSearch: z.object({
    type: z.enum(["character", "location", "thing"]).optional(),
    /** An `asset:` or `output:` key from the Library's "Use as reference". */
    reference: z.string().max(300).optional(),
  }),
  head: () => ({ meta: [{ title: "New Element · Open Cinema" }] }),
  component: NewElement,
});
function NewElement() {
  const { type, reference } = Route.useSearch();
  // Keyed so following a different "New …" link starts a fresh form.
  return (
    <ElementCreate
      key={`${type ?? "any"}:${reference ?? ""}`}
      initialType={type}
      initialReference={reference ? parseAssetRefKey(reference) : null}
    />
  );
}
