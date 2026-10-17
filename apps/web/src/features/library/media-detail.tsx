import { useState } from "react";
import { Download, Layers, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatBytes,
  formatDuration,
  mediaUseHref,
  type MediaItem,
} from "./model";
import { removeItem } from "./store";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function typeLabel(mediaType: string) {
  const subtype = mediaType.split("/")[1] ?? mediaType;
  return (
    { quicktime: "MOV", jpeg: "JPEG", png: "PNG", webp: "WebP" }[subtype] ??
    subtype.toUpperCase()
  );
}

// The sheet opens from a URL change, not a Radix trigger, so return focus by hand.
let opener: HTMLElement | null = null;
export function rememberOpener(element: HTMLElement) {
  opener = element;
}

export function MediaDetailSheet({
  item,
  onClose,
}: {
  item: MediaItem | null;
  onClose: () => void;
}) {
  return (
    // Non-modal: an inspector beside the grid. Picking another tile swaps the
    // item in place, and skipping the scroll lock avoids a full style recalc.
    <Sheet
      modal={false}
      open={!!item}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent
        showCloseButton={false}
        onInteractOutside={(event) => {
          if ((event.target as Element).closest("[data-media-id]"))
            event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          if (!opener?.isConnected) return;
          event.preventDefault();
          opener.focus();
        }}
        className="w-full gap-0 overflow-y-auto bg-elevated sm:max-w-md md:max-w-lg"
      >
        {item && <Detail key={item.id} item={item} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const facts: [string, string][] = [
    [
      "Type",
      `${item.kind === "video" ? "Video" : "Image"} · ${typeLabel(item.mediaType)}`,
    ],
  ];
  if (item.width && item.height)
    facts.push(["Dimensions", `${item.width} × ${item.height}`]);
  if (item.durationSeconds)
    facts.push(["Duration", formatDuration(item.durationSeconds)]);
  facts.push(["Size", formatBytes(item.sizeBytes)]);
  facts.push([
    item.origin === "upload" ? "Uploaded" : "Generated",
    dateFormat.format(new Date(item.createdAt)),
  ]);
  return (
    <>
      <div className="relative flex min-h-56 items-center justify-center bg-background">
        {/* Sits over the media, so it carries its own backdrop. */}
        <SheetClose className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-md bg-background/80 text-foreground hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <X aria-hidden="true" className="size-4" />
          <span className="sr-only">Close</span>
        </SheetClose>
        {item.kind === "video" ? (
          <video
            src={item.url}
            poster={item.thumbnailUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="max-h-[55vh] w-full"
          />
        ) : (
          <img
            src={item.url}
            alt={item.prompt ?? item.title}
            decoding="async"
            className="max-h-[55vh] w-full object-contain"
          />
        )}
      </div>
      <SheetHeader className="gap-1 px-5 pt-5 pb-0">
        <SheetTitle className="pr-6 text-base leading-6 font-medium break-words">
          {item.title}
        </SheetTitle>
        <SheetDescription>
          {item.origin === "upload"
            ? "Your upload. Use it to direct a shot or shape an Element."
            : "Generated in Studio."}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-wrap gap-2 px-5 pt-5">
        <Button asChild>
          <a href={mediaUseHref(item, "source")}>
            <Wand2 aria-hidden="true" />
            Use as source
          </a>
        </Button>
        {item.kind === "image" && (
          <Button asChild variant="outline">
            <a href={mediaUseHref(item, "reference")}>
              <Layers aria-hidden="true" />
              Use as reference
            </a>
          </Button>
        )}
        <Button asChild variant="ghost">
          <a href={item.url} download={item.title}>
            <Download aria-hidden="true" />
            Download
          </a>
        </Button>
      </div>
      <dl className="mx-5 mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 border-t border-border pt-5 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {item.prompt && (
        <div className="mx-5 mt-5 border-t border-border pt-5">
          <h3 className="text-sm font-medium">Prompt</h3>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {item.prompt}
          </p>
        </div>
      )}
      {item.origin === "upload" && (
        <div className="mx-5 mt-6 mb-6 border-t border-border pt-5">
          {confirming ? (
            <div role="group" aria-label="Confirm delete">
              <p className="text-sm leading-6">
                Delete this file? Elements and shots that use it lose the
                reference.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    if (await removeItem(item.id)) onClose();
                    else setDeleting(false);
                  }}
                >
                  {deleting ? "Deleting…" : "Delete file"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  onClick={() => setConfirming(false)}
                >
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      )}
    </>
  );
}
