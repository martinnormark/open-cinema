import { useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { Shot } from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { shotPicture, takeUrl } from "./model";

/**
 * Plays approved takes back to back as hard cuts. Two video slots alternate:
 * while one plays, the next shot loads in the other, so a cut lands on the
 * next shot's first frame instead of a loading gap. A shot with only an
 * approved keyframe holds its still for the shot's length.
 */
export function SequencePlayer({
  open,
  onOpenChange,
  title,
  shots,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  shots: Shot[];
}) {
  const items = shots.flatMap((shot) => {
    const picture = shotPicture(shot);
    return picture
      ? [{ shot, kind: picture.kind, url: takeUrl(picture.asset) }]
      : [];
  });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const slots = useRef<(HTMLVideoElement | null)[]>([null, null]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The still whose hold timer is running, so a re-render never restarts it. */
  const timedIndex = useRef(-1);
  const item = items[index];

  function stop() {
    clearTimeout(timer.current);
    for (const video of slots.current) video?.pause();
  }

  function show(next: number) {
    stop();
    const target = items[next];
    if (!target) {
      setEnded(true);
      return;
    }
    setIndex(next);
    setEnded(false);
    setPaused(false);
    timedIndex.current = -1;
    if (target.kind === "image") return;
    // A preloaded slot plays now; a jump to a shot that is not loaded yet
    // gets its src on this render and starts through autoPlay.
    const video = slots.current[next % 2];
    if (video && video.getAttribute("src") === target.url) {
      video.currentTime = 0;
      void video.play().catch(() => setPaused(true));
    }
  }

  function toggle() {
    if (ended) return show(0);
    const video = item?.kind === "video" ? slots.current[index % 2] : null;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  }

  // Each slot holds the item at an index of its parity: the current one, or
  // the next one preloading.
  function slotItem(slot: 0 | 1) {
    const at = index % 2 === slot ? index : index + 1;
    const candidate = items[at];
    return candidate?.kind === "video" ? { at, ...candidate } : null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) stop();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[min(96vw,1200px)] gap-0 overflow-hidden bg-letterbox p-0 sm:max-w-[min(96vw,1200px)]">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Plays each shot’s approved take in order.
        </DialogDescription>
        <div className="relative aspect-video w-full bg-letterbox">
          {([0, 1] as const).map((slot) => {
            const entry = slotItem(slot);
            return (
              <video
                key={slot}
                ref={(element) => {
                  slots.current[slot] = element;
                }}
                src={entry?.url}
                autoPlay={!!entry && entry.at === index}
                muted={false}
                playsInline
                preload="auto"
                onEnded={() => entry?.at === index && show(index + 1)}
                className={
                  entry && entry.at === index && !ended
                    ? "absolute inset-0 size-full object-contain"
                    : "invisible absolute inset-0 size-full object-contain"
                }
              />
            );
          })}
          {item?.kind === "image" && !ended && (
            <img
              key={index}
              ref={(element) => {
                // A still has no media clock; hold it for the shot's length.
                if (!element || timedIndex.current === index) return;
                timedIndex.current = index;
                const at = index;
                timer.current = setTimeout(
                  () => show(at + 1),
                  item.shot.durationSeconds * 1000,
                );
              }}
              src={item.url}
              alt=""
              className="absolute inset-0 size-full object-contain"
            />
          )}
          {ended && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-letterbox text-on-media">
              <p className="text-sm">End of {title}</p>
              <Button variant="secondary" onClick={() => show(0)}>
                <RotateCcw aria-hidden="true" /> Play again
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-4 bg-elevated px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={toggle}
              aria-label={ended ? "Play again" : paused ? "Play" : "Pause"}
            >
              {paused || ended ? (
                <Play aria-hidden="true" />
              ) : (
                <Pause aria-hidden="true" />
              )}
            </Button>
            <p className="min-w-0 truncate text-sm" aria-live="polite">
              <span className="tabular text-muted-foreground">
                {Math.min(index + 1, items.length)} / {items.length}
              </span>{" "}
              {item?.shot.title}
              {item?.kind === "image" && (
                <span className="text-muted-foreground"> · keyframe only</span>
              )}
            </p>
          </div>
          <ol className="flex gap-1" aria-label="Jump to shot">
            {items.map((entry, i) => (
              <li key={entry.shot.id}>
                <button
                  type="button"
                  onClick={() => show(i)}
                  aria-label={`Play from shot ${i + 1}: ${entry.shot.title}`}
                  aria-current={i === index ? "step" : undefined}
                  className={
                    i === index
                      ? "block h-1.5 w-6 rounded-full bg-tungsten"
                      : "block h-1.5 w-6 rounded-full bg-input hover:bg-muted-foreground"
                  }
                />
              </li>
            ))}
          </ol>
        </div>
      </DialogContent>
    </Dialog>
  );
}
