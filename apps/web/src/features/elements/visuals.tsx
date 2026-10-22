import { useState } from "react";
import {
  Box,
  Film,
  KeyRound,
  MapPin,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startSession } from "./generate";
import { assetUrl, posterUrl } from "@/lib/media-url";
import { revealOnLoad } from "@/lib/reveal";
import { leadRank } from "@open-cinema/contracts";
import { isMovingView, type Element, type ElementType } from "./model";
import "./elements.css";

export const typeIcons: Record<ElementType, LucideIcon> = {
  character: UserRound,
  location: MapPin,
  thing: Box,
};

/** A Location's approved moving reference, if it has one. */
export function coverMove(element: Element) {
  return (
    element.references.find(
      (r) => r.status === "approved" && !r.stateId && isMovingView(r.view),
    ) ?? null
  );
}

/** The approved view that leads its mentions (a close portrait, hero view or
 * establishing view), else the newest exploration. */
export function coverUrl(element: Element) {
  const approved = element.references
    .filter(
      (r) => r.status === "approved" && !r.stateId && !isMovingView(r.view),
    )
    .sort((a, b) => leadRank(a.view) - leadRank(b.view));
  const reference =
    approved[0] ??
    [...element.references]
      .reverse()
      .find((r) => r.status === "experiment" && !isMovingView(r.view));
  return reference ? assetUrl(reference.asset) : null;
}

export function ElementCover({
  element,
  className,
}: {
  element: Element;
  className?: string;
}) {
  const url = coverUrl(element);
  const move = coverMove(element);
  const Icon = typeIcons[element.type];
  return (
    <div className={cn("relative overflow-hidden bg-surface", className)}>
      {move && (
        <span className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-sm bg-background/90 px-1.5 py-0.5 text-xs font-medium">
          <Film aria-hidden="true" className="size-3" />
          Moving reference
        </span>
      )}
      {move ? (
        <video
          src={assetUrl(move.asset)}
          poster={url ?? posterUrl(move.asset)}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          // Plays only under the pointer, so a grid of places decodes one clip.
          onPointerEnter={(event) =>
            void event.currentTarget.play().catch(() => {})
          }
          onPointerLeave={(event) => event.currentTarget.pause()}
          className="size-full object-cover"
        />
      ) : url ? (
        <img
          ref={revealOnLoad}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="img-reveal size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-subtle-foreground">
          <Icon aria-hidden="true" className="size-7" strokeWidth={1.25} />
        </div>
      )}
    </div>
  );
}

/** Elements belong to a session; offer to start the local one. */
export function SessionRequired({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div
      className={cn("mx-auto w-full max-w-5xl px-6 py-10 md:px-12", className)}
    >
      <EmptyState
        icon={KeyRound}
        title="Start a session to see your Elements"
        actions={
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              startSession()
                .catch(() =>
                  setError(
                    "Local testing is not configured. Set up the local session variables in apps/web/.dev.vars.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Starting…" : "Start local session"}
          </Button>
        }
      >
        Your cast, places and Things are saved with your session. This early
        preview uses a local test session in this browser.
        {error && (
          <span role="alert" className="mt-3 block text-destructive">
            {error}
          </span>
        )}
      </EmptyState>
    </div>
  );
}
