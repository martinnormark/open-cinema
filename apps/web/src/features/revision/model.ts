import { z } from "zod";
import { formatCost, type CostUnit } from "@/features/settings/preferences";
import { preflightSchema } from "./shot-checks";
import {
  approvedReferences,
  backgroundPipelineSchema,
  extendPipelineSchema,
  KLING_EDIT_LIMITS,
  MOTION_ENGINES,
  motionEngineSchema,
  motionResolutionSchema,
  reframeAspectSchema,
  restageAngleSchema,
  vfxEffectSchema,
  preservedAspectSchema,
  resultOutputs,
  type AssetRef,
  type BackgroundPipelineChoice,
  type Element,
  type ExtendPipeline,
  type MotionEngine,
  type ElementType,
  type GenerationEstimate,
  type GenerationRequest,
  type Job,
  type PreservedAspect,
  type ResultVariant,
  type Revision,
  type RevisionStatus,
} from "@open-cinema/contracts";

/** Browser-safe vocabulary for the revision studio. */
export const replacementKindSchema = z.enum([
  "background",
  "character",
  "object",
  "area",
  "moment",
  "extend",
  "reframe",
  "restyle",
  "camera",
  "effect",
  "moves",
]);
export type ReplacementKind = z.infer<typeof replacementKindSchema>;

export const replacementKinds = {
  background: {
    kind: "background",
    workflowKind: "video.background-replace",
    label: "Replace background",
    verb: "Move this shot",
    changes: "The setting behind every person and Thing in the shot.",
  },
  character: {
    kind: "character",
    workflowKind: "video.character-replace",
    label: "Recast a character",
    verb: "Recast this shot",
    changes:
      "Experimental. One person, face and body, with the wardrobe you choose; holds only while their face stays clear and medium or larger.",
  },
  object: {
    kind: "object",
    workflowKind: "video.object-swap",
    label: "Swap an object",
    verb: "Swap this object",
    changes: "One object becomes a Thing from your library.",
  },
  area: {
    kind: "area",
    workflowKind: "video.area",
    label: "Fix an area",
    verb: "Fix this area",
    changes: "Only what you paint over, rebuilt from the rest of the shot.",
  },
  moment: {
    kind: "moment",
    workflowKind: "video.moment",
    label: "Redo a moment",
    verb: "Redo this moment",
    changes: "Up to three seconds, acted again; the take either side stays.",
  },
  extend: {
    kind: "extend",
    workflowKind: "video.extend",
    label: "Make it longer",
    verb: "Make this longer",
    changes: "New seconds after the last frame, in the same shot.",
  },
  reframe: {
    kind: "reframe",
    workflowKind: "video.reframe",
    label: "Reframe",
    verb: "Reframe this shot",
    changes: "The frame's shape, with the new edges drawn in.",
  },
  restyle: {
    kind: "restyle",
    workflowKind: "video.restyle",
    label: "Restyle",
    verb: "Restyle this shot",
    changes: "The whole look, from a Location or style reference.",
  },
  camera: {
    kind: "camera",
    workflowKind: "video.restage",
    label: "Re-stage the camera",
    verb: "Re-stage this shot",
    changes: "The same take from a camera a step away.",
  },
  effect: {
    kind: "effect",
    workflowKind: "video.vfx",
    label: "Add an effect",
    verb: "Add an effect",
    changes: "Rain or a flood, day for night, or a cleared set, on LTX.",
  },
  moves: {
    kind: "moves",
    workflowKind: "video.performance-transfer",
    label: "Copy the moves",
    verb: "Copy these moves",
    changes:
      "A Character of yours performs the clip: every step, gesture and camera move, up to ten seconds.",
  },
} as const satisfies Record<
  ReplacementKind,
  {
    kind: ReplacementKind;
    workflowKind: GenerationRequest["workflowKind"];
    label: string;
    verb: string;
    changes: string;
  }
>;

/** The Element type a mode takes, if any; the front page and the studio agree. */
export const kindElementTypes = {
  background: "location",
  character: "character",
  object: "thing",
  restyle: "location",
  camera: null,
  effect: null,
  // A Thing as the area's reference came back empty; Swap an object takes Things.
  area: null,
  // Optional: who walks in, or who the moment is about.
  moment: "character",
  extend: "character",
  reframe: null,
  moves: "character",
} as const satisfies Record<ReplacementKind, ElementType | null>;

/**
 * Modes whose Element is the change itself. With exactly one ready Element of
 * the type, it is chosen for the creator; with several, they pick.
 */
const ELEMENT_LED: readonly ReplacementKind[] = [
  "background",
  "character",
  "object",
  "moves",
];
export function defaultElement(
  kind: ReplacementKind,
  candidates: readonly Element[],
): Element | null {
  if (!ELEMENT_LED.includes(kind)) return null;
  const ready = candidates.filter((e) => approvedReferences(e).length > 0);
  return ready.length === 1 ? ready[0]! : null;
}

/** How each result variant reads to a creator choosing between them. */
export const variantLabels: Record<
  ResultVariant,
  { label: string; description: string }
> = {
  locked: {
    label: "As shot",
    description:
      "Your performers exactly as filmed, placed in the new setting. They keep the light of the original take.",
  },
  unlocked: {
    label: "Relit",
    description:
      "The model relights the performers to sit in the new setting. Faces, hands and props can drift slightly.",
  },
};

export const preservedLabels: Record<PreservedAspect, string> = {
  performance: "Performance",
  timing: "Timing",
  camera: "Camera movement",
  framing: "Framing",
  foreground: "People and Things in front",
  background: "Background",
  "other-people": "Other people",
  things: "Unrelated Things",
  audio: "Original audio",
  wardrobe: "Wardrobe",
  lighting: "Lighting",
};

/**
 * `unavailable` options stay visible so the limit is stated, not hidden: in
 * Phase 0 Kling dressed the Character in their reference outfit on both clips
 * that asked to keep the source clothing (G4, U5; docs/phase0-recast.md).
 */
export const wardrobeIntents: Record<
  "keep" | "character" | "describe",
  { label: string; detail: string; unavailable?: string }
> = {
  keep: {
    label: "Keep the source wardrobe",
    detail: "The new character wears what the original person wore.",
    unavailable:
      "Not reliable yet. In testing, the model dressed the new character in their reference outfit instead.",
  },
  character: {
    label: "Use the character’s look",
    detail: "Wardrobe comes from the Character’s approved references.",
  },
  describe: {
    label: "Describe new wardrobe",
    detail: "Say what they wear; it applies to this shot only.",
  },
};
export type WardrobeIntent = keyof typeof wardrobeIntents;

/**
 * What the creator decided, kept beside the revision so history can explain a
 * result. Elements live in the browser for now, so names travel with the ids.
 */
export const revisionDecisionsSchema = z.object({
  kind: replacementKindSchema,
  sourceTitle: z.string().max(300),
  element: z
    .object({
      id: z.string(),
      name: z.string(),
      handle: z.string(),
      stateName: z.string().nullable(),
      referenceCount: z.number().int().nonnegative(),
    })
    .nullable(),
  direction: z.string().max(2000),
  target: z.string().max(300),
  wardrobe: z.enum(["keep", "character", "describe"]).nullable(),
  wardrobeNote: z.string().max(500),
  preserve: z.array(preservedAspectSchema),
  allowIntegration: z.boolean(),
  estimate: z
    .object({ cost: z.string(), time: z.string(), basis: z.string() })
    .nullable(),
  /** Where the recast person was marked, for the post-run checks. */
  targetPoint: z
    .object({ x: z.number(), y: z.number(), timeMs: z.number() })
    .nullable()
    .optional(),
  /** The composer's shot check when the recast was started. */
  preflight: preflightSchema.nullable().optional(),
  /** The studio's exact choices, so "Try again" reopens it as it was. */
  draft: z
    .object({
      stateId: z.string().nullable(),
      targetNote: z.string().max(300),
      pipeline: backgroundPipelineSchema,
      /** `assetRefKey` of the chosen plate, for the alpha composite. */
      plate: z.string().max(400).nullable(),
      /** Re-staging: the new angle. */
      angle: restageAngleSchema.nullable().optional(),
      /** Object Swap: what the Thing replaces, in the creator's words. */
      original: z.string().max(200).nullable().optional(),
      /** Restyle: `assetRefKey` of an explicit style reference image. */
      styleImage: z.string().max(400).nullable().optional(),
      /** Effects: which one, and who stays when the set is cleared. */
      effect: vfxEffectSchema.nullable().optional(),
      keep: z.string().max(200).nullable().optional(),
      /** Make it longer: which model, and how many seconds Seedance adds. */
      extendPipeline: extendPipelineSchema.nullable().optional(),
      extendSeconds: z.number().int().positive().nullable().optional(),
      /** Redo a moment: the stretch, in seconds. */
      range: z
        .object({ start: z.number(), end: z.number() })
        .nullable()
        .optional(),
      /** Reframe: the new shape. */
      aspect: reframeAspectSchema.nullable().optional(),
      /** Copy the moves: the engine, the output size, and a Location for the new place. */
      engine: motionEngineSchema.nullable().optional(),
      resolution: motionResolutionSchema.nullable().optional(),
      locationId: z.string().max(200).nullable().optional(),
    })
    .optional(),
});
export type RevisionDecisions = z.infer<typeof revisionDecisionsSchema>;

export const revisionSubmissionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  projectId: z.string().min(1).optional(),
  parentRevisionId: z.string().min(1).optional(),
  intent: z.string().trim().min(1).max(2000),
  request: z.unknown(),
  decisions: revisionDecisionsSchema,
});

export { assetUrl, posterUrl } from "@/lib/media-url";

/** The revision kind a stored workflow kind belongs to. */
export function revisionKindOf(
  workflowKind: Revision["workflowKind"],
): ReplacementKind {
  switch (workflowKind) {
    case "video.character-replace":
      return "character";
    case "video.object-swap":
      return "object";
    case "video.restyle":
      return "restyle";
    case "video.restage":
      return "camera";
    case "video.vfx":
      return "effect";
    case "video.extend":
      return "extend";
    case "video.area":
      return "area";
    case "video.moment":
      return "moment";
    case "video.reframe":
      return "reframe";
    case "video.performance-transfer":
      return "moves";
    default:
      return "background";
  }
}

/** The result a revision shows: its stored result, or the finished job's first video. */
export function revisionResult(
  revision: Pick<Revision, "result" | "jobId">,
  job: Job | undefined,
): AssetRef | null {
  if (revision.result) return revision.result;
  const output = resultOutputs(job?.outputs ?? []).find(
    (o) => o.r2Key && o.mediaType.startsWith("video/"),
  );
  return output && job?.state === "succeeded"
    ? { type: "job-output", jobId: job.id, outputId: output.id }
    : null;
}

export type RevisionPhase =
  | "queued"
  | "generating"
  | "saving"
  | "ready"
  | "kept"
  | "rejected"
  | "failed"
  | "attention";

/** One honest phase from the stored revision and the live job, if any. */
export function revisionPhase(
  status: RevisionStatus,
  job: Job | undefined,
  hasResult: boolean,
): RevisionPhase {
  if (status === "kept" || status === "rejected") return status;
  if (status === "failed") return "failed";
  if (status === "proposed" || hasResult) return "ready";
  switch (job?.state) {
    case "failed":
    case "cancelled":
      return "failed";
    case "needs_attention":
      return "attention";
    case "persisting":
      return "saving";
    case "queued":
      // A later stage waits for its turn after earlier results were saved.
      return job.outputs.some((o) => o.r2Key) ? "generating" : "queued";
    case "running":
    case "submitting":
    case "cancelling":
      return "generating";
    default:
      return "queued";
  }
}

export const phaseLabels: Record<RevisionPhase, string> = {
  queued: "Waiting to start",
  generating: "Generating",
  saving: "Saving result",
  ready: "Ready to review",
  kept: "Kept",
  rejected: "Rejected",
  failed: "Failed",
  attention: "Needs attention",
};

/**
 * Maps a moment in the source to the same moment in the result. Providers may
 * trim or retime a clip, so playback compares proportional positions.
 */
export function correspondingTime(
  time: number,
  fromDuration: number,
  toDuration: number,
) {
  if (!(fromDuration > 0) || !(toDuration > 0)) return time;
  return Math.min(toDuration, (time / fromDuration) * toDuration);
}

export function formatTimecode(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(safe);
  const frames = Math.floor((safe - whole) * 25);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}.${String(frames).padStart(2, "0")}`;
}

/** Estimate copy in the creator's preferred cost unit. */
export function formatEstimate(estimate: GenerationEstimate, unit: CostUnit) {
  const minutes = (s: number) =>
    s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`;
  const { min, max } = estimate.seconds;
  const time =
    minutes(min) === minutes(max)
      ? minutes(max)
      : `${minutes(min)}–${minutes(max)}`;
  return {
    cost: estimate.credits
      ? formatCost(estimate.credits, unit)
      : estimate.basis === "observed"
        ? "Depends on the clip length"
        : "Price not published",
    time,
    basis:
      estimate.basis === "published-pricing"
        ? "From published pricing"
        : estimate.basis === "observed"
          ? "From recent runs"
          : "Rough estimate",
    note: estimate.note ?? null,
  };
}

/**
 * Kling 3.0 Omni's video edit envelope (docs/phase0-background.md and
 * docs/phase0-recast.md). Outside it Kling answers with a bare provider_error
 * after the run is queued, so the studio refuses first and says why.
 */
/**
 * The open-weights revisions (Object Swap, Restyle, re-staging, effects) run on the
 * first 97 frames of a take, about four seconds at 24 or 25 fps.
 */
export const LTX_REVISION_SECONDS = 4;

export interface SourceFacts {
  seconds: number | null;
  /** Display size, as a player shows it. */
  width: number | null;
  height: number | null;
  fps: number | null;
  pixelAspect: number | null;
}

/**
 * What stops a clip from going to Kling (`problems`), and what the job changes
 * on the way without asking (`notes`). Unknown facts are not held against it.
 */
export function checkKlingSource(source: SourceFacts) {
  const problems: string[] = [];
  const notes: string[] = [];
  const { seconds, width, height, fps, pixelAspect } = source;
  if (seconds !== null && seconds < KLING_EDIT_LIMITS.minSeconds - 0.05)
    problems.push(
      `Kling needs a clip of at least ${KLING_EDIT_LIMITS.minSeconds} seconds; this one is ${seconds.toFixed(1)} s.`,
    );
  if (seconds !== null && seconds > KLING_EDIT_LIMITS.maxSeconds + 0.05)
    problems.push(
      `Kling edits up to ${KLING_EDIT_LIMITS.maxSeconds} seconds; this clip is ${seconds.toFixed(1)} s. Trim it and upload it again.`,
    );
  if (
    width !== null &&
    height !== null &&
    Math.min(width, height) < KLING_EDIT_LIMITS.minShortSidePx
  )
    problems.push(
      `Kling needs at least ${KLING_EDIT_LIMITS.minShortSidePx} pixels on the short side; this clip is ${width}×${height}.`,
    );
  if (
    fps !== null &&
    (fps < KLING_EDIT_LIMITS.minFps || fps > KLING_EDIT_LIMITS.maxFps)
  )
    problems.push(
      `Kling takes 24 to 60 frames per second; this clip is ${Math.round(fps * 100) / 100} fps.`,
    );
  if (pixelAspect !== null && Math.abs(pixelAspect - 1) > 0.001)
    notes.push(
      "This clip has non-square pixels, which Kling cannot read. It is converted to square pixels first, keeping the shot's shape.",
    );
  return { problems, notes };
}

/**
 * The model a revision runs on, named as the job will record it (each
 * workflow definition's `displayModel` in @open-cinema/comfy), so the studio
 * says which model makes the result before anything runs.
 */
export function studioModel(
  kind: ReplacementKind,
  choices: {
    pipeline: BackgroundPipelineChoice;
    extendPipeline: ExtendPipeline;
    areaAdds: boolean;
    engine: MotionEngine;
  },
): string {
  switch (kind) {
    case "background":
      return choices.pipeline === "ltx-alpha"
        ? "LTX 2.5 Alpha Gen"
        : choices.pipeline === "seedance"
          ? "Seedance 2.5"
          : "Kling 3.0 Omni";
    case "character":
      return "Kling 3.0 Omni";
    case "object":
    case "restyle":
      return "FLUX 3 Klein + LTX 2.3";
    case "camera":
      return "MoGe-2 + LTX 2.3 In-Outpainting";
    case "effect":
      return "LTX 2.3 + Lightricks effect IC-LoRA";
    case "area":
      return choices.areaAdds
        ? "Wan 2.1 VACE"
        : "LTX 2.3 In-Outpainting IC-LoRA";
    case "moment":
      return "LTX 2.3";
    case "extend":
      return choices.extendPipeline === "seedance" ? "Seedance 2.5" : "LTX 2.3";
    case "reframe":
      return "LTX 2.3 outpainting IC-LoRA";
    case "moves":
      return MOTION_ENGINES[choices.engine].jobModel;
  }
}
