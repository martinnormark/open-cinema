import type { MediaItem, MediaKind } from "./model";
import { MediaTile, UploadTile } from "./media-tile";
import { useLibrary } from "./store";

export type LibraryFilter = "all" | MediaKind | "upload" | "generated";

export function matchesFilter(item: MediaItem, filter: LibraryFilter) {
  if (filter === "all") return true;
  if (filter === "upload" || filter === "generated")
    return item.origin === filter;
  return item.kind === filter;
}

/** Uploads in flight first, then stored items. */
export function LibraryGrid({
  items,
  selectedId,
  onOpen,
  label,
  showUploads = true,
}: {
  items: readonly MediaItem[];
  selectedId?: string | null;
  onOpen: (item: MediaItem) => void;
  label: string;
  showUploads?: boolean;
}) {
  // A joined string keeps progress ticks from re-rendering the whole grid.
  const uploadKeys = useLibrary((s) => s.uploads.map((u) => u.key).join(" "));
  const keys = showUploads && uploadKeys ? uploadKeys.split(" ") : [];
  return (
    <ul
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"
    >
      {keys.map((key) => (
        <UploadTile key={key} uploadKey={key} />
      ))}
      {items.map((item) => (
        <MediaTile
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          onOpen={onOpen}
        />
      ))}
    </ul>
  );
}
