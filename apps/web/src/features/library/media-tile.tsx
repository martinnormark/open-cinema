import { memo, type SyntheticEvent } from "react";
import { Film, ImageIcon, RotateCcw, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatBytes, formatDuration, type MediaItem } from "./model";
import {
  cancelUpload,
  dismissUpload,
  retryUpload,
  useLibrary,
  type UploadEntry,
} from "./store";

/** Marks cached images loaded at attach time; `onLoad` covers the rest. */
function revealWhenLoaded(img: HTMLImageElement | null) {
  if (img?.complete && img.naturalWidth) img.dataset.loaded = "true";
}

/**
 * A video's poster can take a moment on first view (the media container may be
 * starting); one quiet retry covers that before the icon is left in place.
 */
function retryOnce(event: SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  if (img.dataset.retried || img.src.startsWith("blob:")) return;
  img.dataset.retried = "true";
  const url = new URL(img.src);
  url.searchParams.set("retry", "1");
  setTimeout(() => (img.src = url.href), 2000);
}

/**
 * Fades in over a placeholder icon, which stays while a video's poster is
 * still being made and when a load fails.
 */
export function Thumbnail({
  src,
  kind,
  className,
}: {
  src: string | null;
  kind: MediaItem["kind"];
  className?: string;
}) {
  const Icon = kind === "video" ? Film : ImageIcon;
  return (
    <div className={cn("relative overflow-hidden bg-surface", className)}>
      <Icon
        aria-hidden="true"
        strokeWidth={1.5}
        className="absolute inset-0 m-auto size-6 text-subtle-foreground"
      />
      {src && (
        <img
          ref={revealWhenLoaded}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={(event) => (event.currentTarget.dataset.loaded = "true")}
          onError={retryOnce}
          className="library-thumb absolute inset-0 size-full object-cover"
        />
      )}
    </div>
  );
}

/** A clip's length over its thumbnail; nothing until the length is known. */
export function DurationBadge({
  item,
  className,
}: {
  item: MediaItem;
  className?: string;
}) {
  const seconds = item.durationSeconds;
  if (!seconds) return null;
  return (
    <span
      className={cn(
        "tabular absolute rounded bg-black/70 px-1 text-[0.6875rem] text-white",
        className,
      )}
    >
      {formatDuration(seconds)}
    </span>
  );
}

function describe(item: MediaItem) {
  const parts = [item.origin === "upload" ? "Upload" : "Generated"];
  if (item.width && item.height) parts.push(`${item.width}×${item.height}`);
  else if (item.sizeBytes !== null) parts.push(formatBytes(item.sizeBytes));
  return parts.join(" · ");
}

/**
 * Memoized: opening the detail changes the URL and re-renders the page, which
 * must not re-render every tile. Clicks are handled by `LibraryGrid` through
 * `data-media-id`, so tiles take no callbacks.
 */
export const MediaTile = memo(function MediaTile({
  item,
  selected,
  hidden,
}: {
  item: MediaItem;
  selected?: boolean | undefined;
  hidden?: boolean | undefined;
}) {
  const seconds = item.durationSeconds;
  return (
    <li className="library-tile" hidden={hidden}>
      <button
        type="button"
        data-media-id={item.id}
        aria-pressed={selected}
        className="group block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <div className="relative">
          <Thumbnail
            src={item.thumbnailUrl}
            kind={item.kind}
            className={cn(
              "aspect-square rounded-lg",
              selected && "ring-2 ring-tungsten",
            )}
          />
          {item.kind === "video" && (
            <span className="tabular absolute right-2 bottom-2 flex items-center gap-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-xs font-medium">
              <Film aria-hidden="true" className="size-3" />
              {formatDuration(seconds) || "Video"}
            </span>
          )}
        </div>
        <span className="mt-2 block truncate text-sm group-hover:text-foreground">
          {item.title}
        </span>
        <span className="tabular mt-0.5 block truncate text-xs text-muted-foreground">
          {describe(item)}
        </span>
      </button>
    </li>
  );
});

const phaseLabel: Record<UploadEntry["phase"], string> = {
  preparing: "Preparing",
  uploading: "Uploading",
  finishing: "Saving",
  failed: "Not uploaded",
};

/** Subscribes to one upload so progress ticks re-render only this tile. */
export function UploadTile({ uploadKey }: { uploadKey: string }) {
  const entry = useLibrary((s) => s.uploads.find((u) => u.key === uploadKey));
  if (!entry) return null;
  const failed = entry.phase === "failed";
  const percent = Math.round(entry.progress * 100);
  return (
    <li className="library-tile library-tile-enter">
      <div className="relative">
        <Thumbnail
          src={entry.previewUrl}
          kind={entry.kind}
          className={cn("aspect-square rounded-lg", !failed && "opacity-60")}
        />
        <div className="absolute inset-x-3 bottom-3">
          {!failed && (
            <Progress
              value={entry.phase === "uploading" ? percent : 100}
              aria-label={`Uploading ${entry.name}`}
              className="bg-background/70 [&>[data-slot=progress-indicator]]:bg-tungsten"
            />
          )}
        </div>
        <div className="absolute top-2 right-2 flex gap-1">
          {failed && entry.retryable && (
            <button
              type="button"
              onClick={() => retryUpload(entry.key)}
              className="flex size-7 items-center justify-center rounded-md bg-background/85 text-foreground hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Retry ${entry.name}`}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              failed ? dismissUpload(entry.key) : cancelUpload(entry.key)
            }
            className="flex size-7 items-center justify-center rounded-md bg-background/85 text-foreground hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`${failed ? "Dismiss" : "Cancel"} ${entry.name}`}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </div>
      <span className="mt-2 block truncate text-sm">{entry.name}</span>
      <span
        role={failed ? "alert" : undefined}
        className={cn(
          "tabular mt-0.5 block text-xs",
          failed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {failed
          ? entry.error
          : `${phaseLabel[entry.phase]}${entry.phase === "uploading" ? ` · ${percent}%` : ""}`}
      </span>
    </li>
  );
}
