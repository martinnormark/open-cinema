import type { GenerationEstimate } from "@open-cinema/contracts";

/** Bria bills per second of source video (Router pricing, read 2026-10-16). */
const BRIA_CREDITS_PER_SECOND = 10.55;

/**
 * Replacement estimates need the clip length, which the shared estimator does
 * not receive; everything else comes from `@open-cinema/comfy/estimates`.
 */
export function estimateReplacement(
  kind: "background" | "character",
  sourceSeconds: number | null,
): GenerationEstimate {
  if (kind === "background") {
    const clip = sourceSeconds ?? null;
    return {
      credits:
        clip === null
          ? null
          : {
              min: BRIA_CREDITS_PER_SECOND * clip,
              max: BRIA_CREDITS_PER_SECOND * clip,
            },
      seconds: {
        min: 60,
        max: Math.max(180, 120 + (clip ?? 20) * 15),
      },
      basis: clip === null ? "heuristic" : "published-pricing",
      ...(clip === null
        ? { note: "Charged at 10.55 credits per second of source video." }
        : {}),
    };
  }
  const clip = Math.min(30, sourceSeconds ?? 10);
  return {
    credits: null,
    seconds: { min: 120, max: Math.max(300, 240 + clip * 20) },
    basis: "heuristic",
    note: "Recasting has no published price yet. Clips shorter than 4 seconds are refused; longer ones are trimmed to 30 seconds.",
  };
}
