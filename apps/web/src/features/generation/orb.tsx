import { lazy, Suspense, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { getOrbState } from "@open-cinema/contracts";
import { useGeneration } from "./store";
const Orb29 = lazy(() => import("@/components/orbs/orb-29"));
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
    : "Syncing";
  const status = snapshot?.jobs.some((j) => j.state === "needs_attention")
    ? "Needs attention"
    : connection !== "live"
      ? "Reconnecting"
      : "View activity";
  return (
    <Link
      to="/activity"
      className="generation-orb"
      aria-label={`${label}. ${status}`}
    >
      <Suspense
        fallback={
          <span
            className="orb-fallback"
            style={{ position: "relative", width: 56, height: 56 }}
          />
        }
      >
        <Orb29
          size={56}
          state={activity}
          paused={paused || !snapshot}
          maxDpr={1.5}
        />
      </Suspense>
      <span>
        <span className="block text-sm font-medium" role="status">
          {label}
        </span>
        <span className="block text-xs text-muted-foreground">{status}</span>
      </span>
    </Link>
  );
}
