import type {
  BackgroundPipelineChoice,
  GenerationEstimate,
} from "@open-cinema/contracts";
import { cloudEstimate } from "@open-cinema/comfy/estimates";
import type { ReplacementKind } from "./model";

/**
 * Kling 3.0 Omni edits cost about 27 credits per source second (5.4 Kling
 * credits for 6 s at 720p in Phase 0); see `@open-cinema/comfy/estimates`.
 */
const KLING_CREDITS_PER_SECOND = 27;
/** Bria's matte for the foreground lock: about $0.05 per source second. */
const MATTE_CREDITS_PER_SECOND = 10.5;
const BACKGROUND_CREDITS_PER_SECOND =
  KLING_CREDITS_PER_SECOND + MATTE_CREDITS_PER_SECOND;
/** Recasts run Kling's pro (1080p) edit, with no matte. */
const RECAST_CREDITS_PER_SECOND = 35;

/**
 * Replacement estimates need the clip length, which the shared estimator does
 * not receive; everything else comes from `@open-cinema/comfy/estimates`.
 */
export function estimateReplacement(
  kind: ReplacementKind,
  sourceSeconds: number | null,
  pipeline: BackgroundPipelineChoice = "kling",
): GenerationEstimate {
  if (kind === "object") return cloudEstimate("swap");
  if (kind === "restyle") return cloudEstimate("restyle");
  if (kind === "camera") return cloudEstimate("restage");
  if (kind === "background" && pipeline === "ltx-alpha")
    return {
      // Not yet measured: one 8-step pass of the 22B model on a Cloud GPU.
      credits: null,
      seconds: { min: 60, max: 900 },
      basis: "heuristic",
      note: "Runs on Comfy Cloud, billed by GPU time. Only the first 5 seconds are matted.",
    };
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
  // Kling 3.0 Omni pro edit: about 35 credits per source second in Phase 0
  // (6 Kling credits per 5 s clip). The live recast took about 12 minutes.
  const clip = sourceSeconds ?? null;
  return {
    credits:
      clip === null
        ? null
        : {
            min: RECAST_CREDITS_PER_SECOND * clip * 0.9,
            max: RECAST_CREDITS_PER_SECOND * clip * 1.1,
          },
    seconds: { min: 180, max: 2400 },
    basis: "observed",
    note:
      clip === null
        ? "About 35 credits per second of source video, at 1080p. Clips need 4 to 10 seconds."
        : "Kling 3.0 Omni at 1080p. The shared Router queue can add much more time.",
  };
}
