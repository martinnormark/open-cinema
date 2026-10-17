import { Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { LibraryGrid } from "./library-grid";
import { UploadButton } from "./library-page";
import type { MediaItem, MediaKind } from "./model";
import { addUploads, useLibrary } from "./store";
import { useFileDrop } from "./use-file-drop";
import "./library.css";

/**
 * Choose an upload or generated output, or upload one on the spot. Embed it
 * wherever a feature needs a source or reference; `item.ref` is the AssetRef
 * to store.
 *
 * ```tsx
 * <MediaPicker open={open} onOpenChange={setOpen} kind="video"
 *   title="Choose footage" onSelect={(item) => setSource(item.ref)} />
 * ```
 */
export function MediaPicker({
  open,
  onOpenChange,
  onSelect,
  kind,
  title = "Choose from your library",
  description = "Pick something you uploaded or generated, or add a new file.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: MediaItem) => void;
  kind?: MediaKind;
  title?: string;
  description?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open && (
          <PickerBody
            kind={kind}
            onSelect={(item) => {
              onSelect(item);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickerBody({
  kind,
  onSelect,
}: {
  kind: MediaKind | undefined;
  onSelect: (item: MediaItem) => void;
}) {
  const status = useLibrary((s) => s.status);
  const items = useLibrary((s) => s.items);
  const hasUploads = useLibrary((s) => s.uploads.length > 0);
  const accept = (files: File[]) =>
    addUploads(kind ? files.filter((f) => f.type.startsWith(kind)) : files);
  const drop = useFileDrop(accept);
  const visible = kind ? items.filter((item) => item.kind === kind) : items;
  return (
    <div
      className="relative min-h-0 flex-1 overflow-y-auto px-6 py-5"
      {...drop.handlers}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {kind === "video"
            ? "Videos"
            : kind === "image"
              ? "Images"
              : "Images and videos"}{" "}
          · drop files here to add them
        </p>
        <UploadButton variant="outline" onFiles={accept} />
      </div>
      {status === "ready" || hasUploads ? (
        visible.length || hasUploads ? (
          <LibraryGrid
            items={visible}
            onOpen={onSelect}
            label="Library items to choose from"
          />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nothing to choose yet. Upload a file to use it here.
          </p>
        )
      ) : status === "signed-out" || status === "error" ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {status === "signed-out"
            ? "Start a local session from Studio to use your library."
            : "Your library did not load. Close this and try again."}
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      )}
      <div
        aria-hidden="true"
        data-active={drop.active}
        className="library-drop pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border border-dashed border-tungsten/70 bg-elevated/90"
      >
        <p className="flex items-center gap-2 text-sm font-medium">
          <Upload aria-hidden="true" className="size-4 text-tungsten" />
          Drop to upload
        </p>
      </div>
    </div>
  );
}
