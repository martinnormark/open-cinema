import type {
  BackgroundPipelineChoice,
  ExtendPipeline,
  GenerationEstimate,
  MotionEngine,
  MotionResolution,
  RecastPipelineChoice,
} from "@open-cinema/contracts";
import { KLING_EDIT_LIMITS } from "@open-cinema/contracts";
import {
  cloudEstimate,
  movesEstimate,
  seedanceExtendEstimate,
  seedanceRelocateEstimate,
  sourceEditEstimate,
  sourceEditRate,
} from "@open-cinema/comfy/estimates";
import type { ReplacementKind } from "./model";

/**
 * Replacement estimates know the clip length, which the shared estimator does
 * not receive; the rates and times come from `@open-cinema/comfy/estimates`.
 */
export function estimateReplacement(
  kind: ReplacementKind,
  sourceSeconds: number | null,
  pipeline: BackgroundPipelineChoice = "kling",
  extend: {
    extendPipeline: ExtendPipeline;
    extendSeconds: number;
    areaAdds?: boolean;
  } = {
    extendPipeline: "seedance",
    extendSeconds: 4,
  },
  moves: {
    engine: MotionEngine;
    seconds: number | null;
    resolution: MotionResolution;
    /** Tagged people: Wan 3.0 also reads SAM 3.1's tracks. */
    tagged?: boolean;
  } = { engine: "wan-3", seconds: sourceSeconds, resolution: "720p" },
  recastPipeline: RecastPipelineChoice = "kling",
): GenerationEstimate {
  if (kind === "moves")
    return movesEstimate(
      moves.engine,
      moves.seconds,
      moves.resolution,
      moves.tagged,
    );
  if (kind === "object") return cloudEstimate("swap");
  if (kind === "area")
    return cloudEstimate(extend.areaAdds ? "area-add" : "area");
  if (kind === "moment") return cloudEstimate("moment");
  if (kind === "reframe") return cloudEstimate("reframe");
  if (kind === "extend")
    return extend.extendPipeline === "seedance"
      ? seedanceExtendEstimate(extend.extendSeconds, sourceSeconds)
      : cloudEstimate("extend");
  if (kind === "restyle") return cloudEstimate("restyle");
  if (kind === "camera") return cloudEstimate("restage");
  if (kind === "effect") return cloudEstimate("vfx");
  if (kind === "background" && pipeline === "ltx-alpha")
    return {
      ...cloudEstimate("alpha"),
      note: "Runs on Comfy Cloud, billed by GPU time. Only the first 5 seconds are matted.",
    };
  if (kind === "background" && pipeline === "seedance")
    return seedanceRelocateEstimate(sourceSeconds);
  if (kind === "background") {
    const estimate = sourceEditEstimate(
      "video.background-replace",
      sourceSeconds,
    );
    return sourceSeconds === null
      ? {
          ...estimate,
          note: `About ${sourceEditRate("video.background-replace")} credits per second of source video.`,
        }
      : estimate;
  }
  if (recastPipeline === "minimax-h3") return cloudEstimate("recast");
  if (recastPipeline === "wan-scail2") return cloudEstimate("recast-wan");
  // The live recast took about 12 minutes.
  return {
    ...sourceEditEstimate("video.character-replace", sourceSeconds),
    note:
      sourceSeconds === null
        ? `About ${sourceEditRate("video.character-replace")} credits per second of source video, at 1080p. Clips need ${KLING_EDIT_LIMITS.minSeconds} to ${KLING_EDIT_LIMITS.maxSeconds} seconds.`
        : "Kling 3.0 Omni at 1080p. The shared Router queue can add much more time.",
  };
}
