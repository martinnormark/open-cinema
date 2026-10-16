import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ElementPage } from "@/features/elements/element-page";

export const Route = createFileRoute("/elements/$elementId")({
  validateSearch: z.object({
    state: z.string().max(40).optional(),
    notice: z.string().max(400).optional(),
  }),
  head: () => ({ meta: [{ title: "Element · Open Cinema" }] }),
  component: Element,
});
function Element() {
  const { elementId } = Route.useParams();
  const { state, notice } = Route.useSearch();
  return (
    <ElementPage
      key={elementId}
      elementId={elementId}
      stateHandle={state}
      notice={notice}
    />
  );
}
