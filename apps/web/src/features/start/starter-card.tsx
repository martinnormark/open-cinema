import type { CSSProperties } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { LoopingClip } from "@/components/looping-clip";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { revealOnLoad } from "@/lib/reveal";
import { cn } from "@/lib/utils";
import { bringStarterWorld, useStarter } from "./starter";
import { starterMediaUrl } from "./starter-world";
import "./start.css";

const CAST = [
  {
    mention: "@Cal",
    what: "Character, wet and injured states",
    src: "media/cal-portrait.jpg",
  },
  {
    mention: "@TideMill",
    what: "Location with a moving reference",
    src: "media/tide-mill-push-in.mp4",
    poster: "media/tide-mill-bridge.jpg",
  },
  {
    mention: "@StormLantern",
    what: "Thing, turnaround and details",
    src: "media/lantern-hero.jpg",
  },
] as const;

/**
 * The offer of a world to start from, wherever the studio would otherwise be
 * empty. The three Elements are shown as they will arrive; one button brings
 * them and the scene in as the creator's own.
 */
export function StarterWorld({
  signedOut,
  compact = false,
  className,
}: {
  signedOut: boolean;
  /** Fits the front page's stage: smaller type, no Element captions. */
  compact?: boolean;
  className?: string;
}) {
  const starter = useStarter();
  const router = useRouter();
  const percent =
    starter.phase === "bringing"
      ? Math.round((starter.sent / Math.max(1, starter.total)) * 100)
      : 0;
  return (
    <div
      className={cn("starter flex flex-col", className)}
      data-bringing={starter.phase === "bringing" || undefined}
    >
      <ul
        className={cn("grid grid-cols-3", compact ? "gap-2" : "gap-3")}
        aria-label="In the Tide Mill"
      >
        {CAST.map((item, i) => (
          <li
            key={item.mention}
            className="starter-cast min-w-0"
            style={{ "--i": i } as CSSProperties}
          >
            <div className="starter-frame relative aspect-[4/5] overflow-hidden rounded-md bg-surface">
              {"poster" in item ? (
                <LoopingClip
                  src={starterMediaUrl(item.src)}
                  poster={starterMediaUrl(item.poster)}
                />
              ) : (
                <img
                  ref={revealOnLoad}
                  src={starterMediaUrl(item.src)}
                  alt=""
                  decoding="async"
                  className="img-reveal size-full object-cover"
                />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-background/85 to-transparent px-2 pt-6 pb-1.5 text-xs font-medium">
                {item.mention}
              </span>
            </div>
            {!compact && (
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                {item.what}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
          compact ? "mt-4" : "mt-6",
        )}
      >
        <div className="max-w-md min-w-0 flex-1">
          <h2 className={cn("font-medium", compact ? "text-base" : "text-lg")}>
            Start from the Tide Mill
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            A cast, a place and a prop with approved references, and a four-shot
            scene to carry on. It all arrives as yours to change.
          </p>
        </div>
        {starter.phase === "done" ? (
          <div className="flex flex-wrap gap-2">
            {starter.result.sequences[0] && (
              <Button asChild>
                <Link
                  to="/sequences/$sequenceId"
                  params={{ sequenceId: starter.result.sequences[0].id }}
                >
                  Open the scene
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/elements">See the Elements</Link>
            </Button>
          </div>
        ) : (
          <Button
            disabled={starter.phase === "bringing"}
            onClick={() =>
              // Pages that loaded their data on the server read it again.
              void bringStarterWorld(signedOut).then(() => router.invalidate())
            }
          >
            {starter.phase === "bringing"
              ? "Bringing it in…"
              : "Bring in the Tide Mill"}
          </Button>
        )}
      </div>
      <div aria-live="polite" className="text-sm">
        {starter.phase === "bringing" && (
          <div className="mt-4 grid gap-2">
            <Progress value={percent} aria-label="Bringing in the Tide Mill" />
            <p className="text-xs text-muted-foreground">
              {starter.step}
              <span className="tabular">
                {percent > 0 && percent < 100 ? ` · ${percent}%` : ""}
              </span>
            </p>
          </div>
        )}
        {starter.phase === "done" && (
          <p className="mt-3 text-muted-foreground">
            The Tide Mill is in your studio. Type @Cal anywhere you write.
          </p>
        )}
        {starter.phase === "idle" && starter.error && (
          <p role="alert" className="mt-3 text-destructive">
            {starter.error}
          </p>
        )}
      </div>
    </div>
  );
}
