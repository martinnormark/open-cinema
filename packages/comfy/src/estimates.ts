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

/**
 * The open-weights graphs on Comfy Cloud bill GPU time, which Cloud does not
 * report per job. Times are from the check runs in docs/revision-modes.md;
 * a cold worker spends most of them loading weights.
 */
export const CLOUD_GRAPH_ESTIMATES = {
  alpha: {
    // Not yet measured: one 8-step distilled pass of the 22B model on a
    // Cloud GPU, plus model loading on a cold worker.
    seconds: [60, 900],
    basis: "heuristic",
    note: "Runs LTX 2.5 Alpha Gen on Comfy Cloud, billed by GPU time. Mattes the first 5 seconds (121 frames) of the take.",
  },
  camera: {
    seconds: [45, 600],
    note: "Runs LTX-2 with a camera-control LoRA on Comfy Cloud, billed by GPU time.",
  },
  swap: {
    seconds: [60, 900],
    note: "Runs FLUX 3 Klein and LTX 2.3 on Comfy Cloud, billed by GPU time. Uses the first 4 seconds of the take.",
  },
  restyle: {
    seconds: [30, 900],
    note: "Runs FLUX 3 Klein and LTX 2.3 on Comfy Cloud, billed by GPU time. Uses the first 4 seconds of the take.",
  },
  vfx: {
    seconds: [30, 900],
    note: "Runs LTX 2.3 with a Lightricks effect IC-LoRA on Comfy Cloud, billed by GPU time. Uses the first 4 seconds of the take.",
  },
  restage: {
    seconds: [60, 1200],
    note: "Re-projects the take with MoGe-2 and fills the gaps with LTX 2.3 on Comfy Cloud, billed by GPU time. Uses the first 4 seconds of the take.",
  },
} as const;

export function cloudEstimate(
  graph: keyof typeof CLOUD_GRAPH_ESTIMATES,
): GenerationEstimate {
  const entry: {
    seconds: readonly [number, number];
    basis?: GenerationEstimate["basis"];
    note: string;
  } = CLOUD_GRAPH_ESTIMATES[graph];
  return {
    credits: null,
    seconds: round(entry.seconds[0], entry.seconds[1]),
    basis: entry.basis ?? "observed",
    note: entry.note,
  };
}

/** Kling 3.0 Omni std edit: 5.4 Kling credits (29.54 Router credits each) for a 6 s 720p clip in Phase 0. */
const KLING_EDIT_CREDITS_PER_SECOND = 27;
/** Bria's matte for the background foreground lock: about $0.05 per source second. */
const MATTE_CREDITS_PER_SECOND = 10.5;

/**
 * Router edits that bill per second of the source clip. Background replacement
 * is Kling's std (720p) edit plus the foreground lock's matte; a recast is
 * Kling's pro (1080p) edit, 6 Kling credits (~177 credits / $0.84) per 5 s clip
 * in Phase 0. Provider time was minutes; the shared Router queue dominated.
 */
export const SOURCE_EDIT_ESTIMATES = {
  "video.background-replace": {
    creditsPerSecond: KLING_EDIT_CREDITS_PER_SECOND + MATTE_CREDITS_PER_SECOND,
    seconds: [150, 1800],
  },
  "video.character-replace": { creditsPerSecond: 35, seconds: [180, 2400] },
} as const;

/** Credits per source second as creators read them, e.g. "About 38 credits". */
export function sourceEditRate(kind: keyof typeof SOURCE_EDIT_ESTIMATES) {
  return Math.round(SOURCE_EDIT_ESTIMATES[kind].creditsPerSecond);
}

/** A per-source-second edit; credits are unknown until the clip length is. */
/**
 * Seedance 2.5 video edit at 720p bills 4.5154 credits per 1,000 video tokens
 * (published Router price). The 8.4 s street take used 353,700 tokens on
 * 2026-10-18, about 1,600 credits ($7.57) or 190 credits per source second.
 */
const SEEDANCE_RELOCATE_CREDITS_PER_SECOND = 190;

export function seedanceRelocateEstimate(
  sourceSeconds: number | null,
): GenerationEstimate {
  const rate = SEEDANCE_RELOCATE_CREDITS_PER_SECOND;
  return {
    credits:
      sourceSeconds === null
        ? null
        : round(rate * sourceSeconds * 0.9, rate * sourceSeconds * 1.1),
    // Observed: 3 to 4 minutes on Router, plus the conform step.
    seconds: round(180, 1800),
    basis: "observed",
    note:
      sourceSeconds === null
        ? `About ${rate} credits per second of source video (Seedance 2.5 at 720p).`
        : "Seedance 2.5 at 720p. Every frame is rebuilt, so it costs about five times Kling's background edit.",
  };
}

export function sourceEditEstimate(
  kind: keyof typeof SOURCE_EDIT_ESTIMATES,
  sourceSeconds: number | null,
): GenerationEstimate {
  const { creditsPerSecond, seconds } = SOURCE_EDIT_ESTIMATES[kind];
  return {
    credits:
      sourceSeconds === null
        ? null
        : {
            min: creditsPerSecond * sourceSeconds * 0.9,
            max: creditsPerSecond * sourceSeconds * 1.1,
          },
    seconds: round(seconds[0], seconds[1]),
    basis: "observed",
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
      if (request.inputs.camera) return cloudEstimate("camera");
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
    case "video.reference": {
      // Kling 3.0 Omni std text-to-video; billed like its std edit per output second.
      const credits =
        KLING_EDIT_CREDITS_PER_SECOND * request.inputs.durationSeconds;
      return {
        credits: round(credits * 0.9, credits * 1.2),
        seconds: round(90, 1200),
        basis: "heuristic",
        note: "Runs Kling 3.0 Omni at 720p with your Elements' references.",
      };
    }
    case "video.background-replace":
      if (request.inputs.pipeline === "ltx-alpha")
        return cloudEstimate("alpha");
      if (request.inputs.pipeline === "seedance")
        return seedanceRelocateEstimate(null);
      // The clip length is unknown here.
      return {
        ...sourceEditEstimate(request.workflowKind, null),
        note: `About ${sourceEditRate(request.workflowKind)} credits per second of source video (Kling 3.0 Omni at 720p, plus the matte for the foreground lock).`,
      };
    case "video.character-replace":
      return {
        ...sourceEditEstimate(request.workflowKind, null),
        note: `About ${sourceEditRate(request.workflowKind)} credits per second of source video (Kling 3.0 Omni, 1080p).`,
      };
    case "video.performance-transfer":
      return {
        // One 8-step distilled pass of LTX 2.3 22B plus edge tracing over every
        // frame, on a Cloud GPU billed by time. Observed once: 73 frames at
        // 640×384 in 28 s end to end on a warm worker (checkpoint cached).
        // A cold worker loads ~35 GB of weights first, which is not measured.
        // Cloud reports no per-job charge to the API.
        credits: null,
        seconds: round(30, 900),
        basis: "heuristic",
        note: "Runs LTX 2.3 Union Control on Comfy Cloud, billed by GPU time. Reuses the first 4 seconds (97 frames) of the take, at most 768 px wide.",
      };
    case "video.object-swap":
      return cloudEstimate("swap");
    case "video.restyle":
      return cloudEstimate("restyle");
    case "video.restage":
      return cloudEstimate("restage");
    case "video.vfx":
      return cloudEstimate("vfx");
  }
}
