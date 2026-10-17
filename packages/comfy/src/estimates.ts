import type {
  GenerationEstimate,
  GenerationRequest,
  LtxVideoInputs,
} from "@open-cinema/contracts";
import { requestedDuration } from "./workflows/ltx-video";

/**
 * Pre-generation estimates. Prices are Router's published rates (211 credits =
 * $1, docs.comfy.org/development/comfy-router/pricing, read 2026-10-16); times
 * are wall-clock observations from live runs recorded in docs/comfy-capabilities.md.
 * Router queue waits are shared across the account, so maxima are generous.
 */
export const CREDITS_PER_USD = 211;
/** BFL models bill per active GPU-second. */
const BFL_CREDITS_PER_GPU_SECOND = 0.266;
/** Observed GPU time for one 1k FLUX 3 image (19–22 s), scaled by pixel count. */
const FLUX_GPU_SECONDS = {
  "1k": [18, 24],
  "1.5k": [28, 40],
  "2k": [40, 60],
} as const;
/** LTX 2.5 bills per output second by resolution class. */
const LTX_CREDITS_PER_SECOND = {
  fast: { "720p": 27.1557, "1080p": 39.2249 },
  pro: { "720p": 36.2076, "1080p": 51.2941 },
} as const;

const round = (min: number, max: number) => ({
  min: Math.round(min * 10) / 10,
  max: Math.round(max * 10) / 10,
});

function ltxEstimate(inputs: LtxVideoInputs): GenerationEstimate {
  const tier = inputs.resolution.includes("1080") ? "1080p" : "720p";
  const credits =
    LTX_CREDITS_PER_SECOND[inputs.quality][tier] * inputs.durationSeconds;
  return {
    credits: round(credits, credits),
    // Observed: 17 s of generation for 4 s at 720p, behind up to 90 s of queue.
    seconds: round(
      inputs.durationSeconds * 3,
      inputs.durationSeconds * (tier === "1080p" ? 12 : 8) + 120,
    ),
    basis: "published-pricing",
  };
}

export function estimateGeneration(
  request: GenerationRequest,
  /** Resolved reference count, including Element sheets from mentions. */
  options: { references?: number | undefined } = {},
): GenerationEstimate {
  switch (request.workflowKind) {
    case "image.flux":
    case "image.flux-reference": {
      const [low, high] = FLUX_GPU_SECONDS[request.inputs.resolution];
      const references =
        request.workflowKind === "image.flux-reference"
          ? Math.max(1, options.references ?? request.inputs.references.length)
          : 0;
      // Each reference adds a few GPU-seconds of encoding (observed +3 s for one).
      const extra = references * 3;
      return {
        credits: round(
          (low + extra) * BFL_CREDITS_PER_GPU_SECOND,
          (high + extra) * BFL_CREDITS_PER_GPU_SECOND,
        ),
        seconds: round(low + extra + 10, high + extra + 60),
        basis: "observed",
      };
    }
    case "video.ltx": {
      if (!request.inputs.firstFrame) return ltxEstimate(request.inputs);
      // FLUX 3 Video bills GPU-seconds Router does not report back; BFL reported 75 of
      // its own credits ($0.75) for 5 s at hd. Scale that by length, with margin.
      const seconds = requestedDuration(request.inputs, true);
      const credits = (CREDITS_PER_USD * 0.75 * seconds) / 5;
      return {
        credits: round(credits * 0.7, credits * 1.3),
        seconds: round(60, 90 + 25 * seconds),
        basis: "heuristic",
        note: "Image-to-video runs on FLUX 3 Video; Router does not report its exact charge.",
      };
    }
    case "video.background-replace":
      return {
        // Kling 3.0 Omni std edit: 5.4 Kling credits for a 6 s 720p clip in Phase 0
        // (29.54 Router credits each), so ~27 credits per source second. Length is
        // unknown here. Provider time was 2–4 min; the shared queue added the rest.
        // The foreground lock's Bria matte adds ~10.5 credits per second.
        credits: null,
        seconds: round(150, 1800),
        basis: "observed",
        note: "About 38 credits per second of source video (Kling 3.0 Omni at 720p, plus the matte for the foreground lock).",
      };
    case "video.character-replace":
      return {
        // Kling 3.0 Omni pro edit: 6 Kling credits (29.54 Router credits each,
        // ~177 credits / $0.84) per 5 s clip in Phase 0, so ~35 credits per source
        // second. Length is unknown here. The shared Router queue dominated time.
        credits: null,
        seconds: round(180, 2400),
        basis: "observed",
        note: "About 35 credits per second of source video (Kling 3.0 Omni, 1080p).",
      };
  }
}
