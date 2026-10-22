import { z } from "zod";

/**
 * Copy the moves: a clip (a dance, a stunt, a gesture) supplies the motion and
 * one of the creator's Characters performs it. docs/copy-the-moves.md records
 * the runs behind each engine.
 *
 * Every engine is named by the model that actually runs, who makes it, whether
 * its weights are open, and where it runs. Nothing is rebranded.
 */
export const motionEngineSchema = z.enum(["wan-3", "wan-animate", "ltx-edges"]);
export type MotionEngine = z.infer<typeof motionEngineSchema>;

export interface MotionEngineFacts {
  /** The model's own name, as its maker publishes it. */
  model: string;
  /** Every model the run uses, as the job records it (`Job.model`). */
  jobModel: string;
  maker: string;
  /** Open weights with their licence, or the provider's hosted model. */
  weights: string;
  runsOn: string;
  /** The id a job records: a Router model or a Comfy Cloud pipeline. */
  modelId: string;
  /** Where to read about the model or the exact graph that runs. */
  source: string;
  /** One sentence: what it is good at and where it falls short. */
  description: string;
  /** Longest stretch one run copies, in seconds. */
  maxSeconds: number;
  /** Offered in the composer; LTX stays for runs made before it was replaced. */
  offered: boolean;
}

export const MOTION_ENGINES: Record<MotionEngine, MotionEngineFacts> = {
  "wan-3": {
    model: "Wan 3.0",
    jobModel: "Wan 3.0",
    maker: "Alibaba (Tongyi Wan)",
    weights: "Hosted model, closed weights",
    runsOn: "Comfy Router",
    modelId: "wan/wan3.0-video",
    source:
      "https://docs.comfy.org/development/comfy-router/models/wan/wan3-0-video/code",
    description:
      "The most faithful copy: the Character takes the performer's place in the clip's own setting, or in your Location, at up to 1080p.",
    maxSeconds: 10,
    offered: true,
  },
  "wan-animate": {
    model: "Wan Animate 2",
    jobModel: "FLUX 3 Klein + Wan Animate 2",
    maker: "Alibaba (Tongyi Wan)",
    weights: "Open weights, Apache 2.0",
    runsOn: "Comfy Cloud",
    modelId: "comfy-cloud/wan-animate-2",
    source: "https://cloud.comfy.org/?template=video_wan_animate2",
    description:
      "Open weights you could run yourself. FLUX 3 Klein first puts the Character in the opening frame, then Wan Animate 2 moves them, framed exactly as the clip. Best with one person in frame.",
    maxSeconds: 10,
    offered: true,
  },
  "ltx-edges": {
    model: "LTX 2.3 Union Control",
    jobModel: "LTX 2.3 Union Control",
    maker: "Lightricks",
    weights: "Open weights, LTX-2 Community License",
    runsOn: "Comfy Cloud",
    modelId: "comfy-cloud/ltx-2.3-union-edges",
    source: "https://github.com/Lightricks/LTX-2",
    description:
      "Traces the clip's edges. Faces drift once the head turns, so it is no longer offered.",
    maxSeconds: 4,
    offered: false,
  },
};

/** Output resolution; Wan Animate 2 renders the two lower tiers only. */
export const motionResolutionSchema = z.enum(["480p", "720p", "1080p"]);
export type MotionResolution = z.infer<typeof motionResolutionSchema>;

export const MOTION_LIMITS = { minSeconds: 2, maxSeconds: 10 } as const;
