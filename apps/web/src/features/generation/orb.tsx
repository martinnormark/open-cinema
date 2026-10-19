import { lazy, Suspense, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { getOrbState } from "@open-cinema/contracts";
import { useGeneration } from "./store";
const StudioOrb = lazy(() => import("@/components/orbs/studio-orb"));
const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const subscribeMotion = (callback: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
};
const serverMotion = () => true;
export function GenerationOrb() {
  const { snapshot, connection } = useGeneration();
  const paused = useSyncExternalStore(subscribeMotion, reduced, serverMotion);
  const activity = getOrbState(snapshot?.jobs ?? []);
  const label = snapshot
    ? activity === "thinking"
      ? "Thinking"
      : "Idle"
    : connection === "unavailable"
      ? "Not connected"
      : "Connecting";
  const status = snapshot?.jobs.some((j) => j.state === "needs_attention")
    ? "Needs attention"
    : !snapshot && connection === "unavailable"
      ? "Start in Studio"
      : connection === "live"
        ? "View activity"
        : connection === "reconnecting"
          ? "Reconnecting"
          : connection === "unavailable"
            ? "Offline"
            : "Connecting";
  const fallback = (
    <span aria-hidden="true" className="orb-static">
      <span className="orb-fallback" />
    </span>
  );
  return (
    <Link
      to={!snapshot && connection === "unavailable" ? "/studio" : "/activity"}
      className="generation-orb"
      aria-label={`${label}. ${status}`}
    >
      {snapshot && !paused ? (
        <Suspense fallback={fallback}>
          <StudioOrb size={56} state={activity} paused={false} maxDpr={1.5} />
        </Suspense>
      ) : (
        fallback
      )}
      <span>
        <span className="block text-sm font-medium" role="status">
          {label}
        </span>
        <span className="block text-xs text-muted-foreground">{status}</span>
      </span>
    </Link>
  );
}
