import { useRef, useState } from "react";
import { ImagePlus, Upload } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { beginLocalSession } from "@/server/functions";
import { reconnectGeneration } from "@/features/generation/store";
import { cn } from "@/lib/utils";
import { LibraryGrid, matchesFilter, type LibraryFilter } from "./library-grid";
import { MediaDetailSheet } from "./media-detail";
import { UPLOAD_ACCEPT, type MediaItem } from "./model";
import { addUploads, clearNotice, refreshLibrary, useLibrary } from "./store";
import { useFileDrop } from "./use-file-drop";
import "./library.css";

const filters: { value: LibraryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "upload", label: "Uploads" },
  { value: "generated", label: "Generated" },
];

/** Hidden file input behind a regular button, shared by the page and picker. */
export function UploadButton({
  variant = "default",
  label = "Upload",
  onFiles = addUploads,
}: {
  variant?: "default" | "outline";
  label?: string;
  onFiles?: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} onClick={() => input.current?.click()}>
        <Upload aria-hidden="true" />
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={UPLOAD_ACCEPT}
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

export function LibraryPage({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const status = useLibrary((s) => s.status);
  const items = useLibrary((s) => s.items);
  const notice = useLibrary((s) => s.notice);
  const uploading = useLibrary(
    (s) => s.uploads.filter((u) => u.phase !== "failed").length,
  );
  const hasUploads = useLibrary((s) => s.uploads.length > 0);
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [starting, setStarting] = useState(false);
  const drop = useFileDrop(addUploads);
  const visible = items.filter((item) => matchesFilter(item, filter));
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const counts = Object.fromEntries(
    filters.map((f) => [
      f.value,
      items.filter((item) => matchesFilter(item, f.value)).length,
    ]),
  ) as Record<LibraryFilter, number>;
  const signedIn = status === "ready";

  async function startSession() {
    setStarting(true);
    try {
      await beginLocalSession();
      reconnectGeneration();
      await refreshLibrary();
    } finally {
      setStarting(false);
    }
  }

  return (
    <section
      aria-labelledby="page-title"
      className="relative mx-auto min-h-[calc(100dvh-4rem)] max-w-6xl px-4 pt-10 pb-32 sm:px-6 md:px-12 md:pt-14"
      {...(signedIn ? drop.handlers : {})}
    >
      <PageHeader
        title="Library"
        description="Everything you upload or generate, ready to become a source for a shot or a reference for an Element."
        actions={signedIn ? <UploadButton /> : undefined}
      />

      <p role="status" className="sr-only">
        {uploading
          ? `Uploading ${uploading} ${uploading === 1 ? "file" : "files"}`
          : ""}
      </p>
      {notice && (
        <p
          role="alert"
          className="mt-6 flex items-center gap-3 text-sm text-destructive"
        >
          {notice}
          <button
            type="button"
            className="text-foreground underline"
            onClick={clearNotice}
          >
            Dismiss
          </button>
        </p>
      )}

      {(status === "idle" || status === "loading") && (
        <ul
          aria-label="Loading your library"
          className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <Skeleton className="aspect-square rounded-lg" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </li>
          ))}
        </ul>
      )}

      {status === "signed-out" && (
        <EmptyState
          icon={ImagePlus}
          title="Start a session to open your library"
          className="mt-10"
          actions={
            <Button disabled={starting} onClick={() => void startSession()}>
              {starting ? "Starting…" : "Start local session"}
            </Button>
          }
        >
          Uploads and generations stay with this browser session while account
          sign-in is in development.
        </EmptyState>
      )}

      {status === "error" && (
        <EmptyState
          title="Your library did not load"
          className="mt-10"
          actions={
            <Button variant="outline" onClick={() => void refreshLibrary()}>
              Try again
            </Button>
          }
        >
          The connection to storage was interrupted. Nothing was lost.
        </EmptyState>
      )}

      {signedIn && !items.length && !hasUploads && (
        <EmptyState
          icon={ImagePlus}
          title="Drop images or short videos here"
          className="mt-10"
          actions={<UploadButton label="Choose files" />}
        >
          PNG, JPEG, or WebP images up to 25 MB. MP4, WebM, or MOV videos up to
          95 MB and two minutes. Your generations appear here too.
        </EmptyState>
      )}

      {signedIn && (items.length > 0 || hasUploads) && (
        <>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={filter}
            onValueChange={(value) =>
              value && setFilter(value as LibraryFilter)
            }
            aria-label="Show"
            className="mt-8 max-w-full overflow-x-auto"
          >
            {filters.map((f) => (
              <ToggleGroupItem
                key={f.value}
                value={f.value}
                className="flex-none px-3"
              >
                {f.label}
                <span className="tabular text-xs text-muted-foreground">
                  {counts[f.value]}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="mt-6">
            <LibraryGrid
              items={visible}
              selectedId={selectedId}
              onOpen={(item: MediaItem) => onSelect(item.id)}
              label="Library items"
              showUploads={filter === "all" || filter === "upload"}
            />
            {!visible.length && !hasUploads && (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing here yet.
              </p>
            )}
          </div>
        </>
      )}

      {signedIn && (
        <div
          aria-hidden="true"
          data-active={drop.active}
          className={cn(
            "library-drop pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-xl border border-dashed border-tungsten/70 bg-background/85",
          )}
        >
          <p className="flex items-center gap-2 text-base font-medium">
            <Upload aria-hidden="true" className="size-5 text-tungsten" />
            Drop to add to your library
          </p>
        </div>
      )}

      <MediaDetailSheet item={selected} onClose={() => onSelect(null)} />
    </section>
  );
}
