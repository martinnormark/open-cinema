import { useState } from "react";
import {
  Box,
  KeyRound,
  MapPin,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { startSession } from "./generate";
import { assetUrl, type Element, type ElementType } from "./model";
import "./elements.css";

export const typeIcons: Record<ElementType, LucideIcon> = {
  character: UserRound,
  location: MapPin,
  thing: Box,
};

/** The approved close portrait, else the first approved identity reference,
 * else the newest exploration. */
export function coverUrl(element: Element) {
  const approved = element.references.filter(
    (r) => r.status === "approved" && !r.stateId,
  );
  const reference =
    approved.find((r) => r.view === "face-closeup") ??
    approved[0] ??
    [...element.references].reverse().find((r) => r.status === "experiment");
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
  const Icon = typeIcons[element.type];
  return (
    <div className={cn("overflow-hidden bg-surface", className)}>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
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
