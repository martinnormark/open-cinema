import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LibraryPage } from "@/features/library/library-page";

export const Route = createFileRoute("/library")({
  validateSearch: z.object({ item: z.string().max(400).optional() }),
  head: () => ({ meta: [{ title: "Library · Open Cinema" }] }),
  component: Library,
});
function Library() {
  const { item } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <LibraryPage
      selectedId={item ?? null}
      onSelect={(id) =>
        void navigate({
          search: id ? { item: id } : {},
          replace: !!item && !!id,
        })
      }
    />
  );
}
