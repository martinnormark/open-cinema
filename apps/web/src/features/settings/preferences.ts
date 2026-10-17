import { useSyncExternalStore } from "react";

/** Comfy publishes Router prices in credits at a fixed rate. */
export const CREDITS_PER_USD = 211;

export type CostUnit = "usd" | "credits";
export type EstimateVisibility = "always" | "video" | "never";

export interface CostPreferences {
  unit: CostUnit;
  estimates: EstimateVisibility;
}

const KEY = "open-cinema:cost-preferences";
const defaults: CostPreferences = { unit: "usd", estimates: "always" };
const listeners = new Set<() => void>();
let cached: CostPreferences | null = null;

function read(): CostPreferences {
  if (cached) return cached;
  try {
    const stored = JSON.parse(
      localStorage.getItem(KEY) ?? "null",
    ) as Partial<CostPreferences> | null;
    cached = {
      unit: stored?.unit === "credits" ? "credits" : defaults.unit,
      estimates:
        stored?.estimates === "video" || stored?.estimates === "never"
          ? stored.estimates
          : defaults.estimates,
    };
  } catch {
    cached = defaults;
  }
  return cached;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    cached = null;
    callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** Per-browser display preferences for cost estimates. */
export function useCostPreferences() {
  return useSyncExternalStore(subscribe, read, () => defaults);
}

export function setCostPreferences(next: Partial<CostPreferences>) {
  cached = { ...read(), ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* Private mode or blocked storage: keep the preference for this tab. */
  }
  for (const listener of listeners) listener();
}

/** Whether to show an estimate for this output kind under the preference. */
export function shouldShowEstimate(
  preferences: CostPreferences,
  output: "image" | "video",
) {
  return (
    preferences.estimates === "always" ||
    (preferences.estimates === "video" && output === "video")
  );
}

/** Formats a credit amount or range in the creator's preferred unit. */
export function formatCost(
  credits: number | { min: number; max: number },
  unit: CostUnit,
) {
  const range =
    typeof credits === "number" ? { min: credits, max: credits } : credits;
  const one = (value: number) =>
    unit === "credits"
      ? `${Math.round(value).toLocaleString()} credits`
      : (value / CREDITS_PER_USD).toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: value / CREDITS_PER_USD < 0.1 ? 3 : 2,
        });
  if (Math.abs(range.max - range.min) < 0.5) return one(range.min);
  return unit === "credits"
    ? `${Math.round(range.min).toLocaleString()}–${Math.round(range.max).toLocaleString()} credits`
    : `${one(range.min)}–${one(range.max)}`;
}
