import type { GenerationEstimate } from "@open-cinema/contracts";

/**
 * Kling 3.0 Omni edits cost about 27 credits per source second (5.4 Kling
 * credits for 6 s at 720p in Phase 0); see `@open-cinema/comfy/estimates`.
 */
const KLING_CREDITS_PER_SECOND = 27;
/** Bria's matte for the foreground lock: about $0.05 per source second. */
const MATTE_CREDITS_PER_SECOND = 10.5;
const BACKGROUND_CREDITS_PER_SECOND =
  KLING_CREDITS_PER_SECOND + MATTE_CREDITS_PER_SECOND;

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
              min: BACKGROUND_CREDITS_PER_SECOND * clip * 0.9,
              max: BACKGROUND_CREDITS_PER_SECOND * clip * 1.1,
            },
      // Provider time was 2–4 min; the shared Router queue can add much more.
      seconds: { min: 150, max: 1800 },
      basis: "observed",
      ...(clip === null
        ? { note: "About 38 credits per second of source video." }
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
