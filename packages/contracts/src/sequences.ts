import { z } from "zod";
import { assetRefSchema } from "./media";

/**
 * A sequence turns an idea into an ordered set of shots. Each shot is directed
 * in two steps: a keyframe still establishes the frame (who, where, how it is
 * lit), then the approved keyframe is animated into the shot's motion take.
 * Approval is per shot, so one shot can be regenerated, continued or revised
 * without touching approved work elsewhere in the sequence.
 */

/** A sequence holds at most this many shots, however they were added. */
export const MAX_SEQUENCE_SHOTS = 24;

export const shotFramingSchema = z.enum([
  "wide",
  "medium",
  "close",
  "extreme-close",
  "over-shoulder",
  "insert",
]);
export type ShotFraming = z.infer<typeof shotFramingSchema>;

export const shotCameraSchema = z.enum([
  "static",
  "push-in",
  "pull-out",
  "pan",
  "tracking",
  "handheld",
  "orbit",
  "crane",
]);
export type ShotCamera = z.infer<typeof shotCameraSchema>;

/** Plain-language direction each choice adds to the shot's prompt. */
export const SHOT_FRAMING_PROMPTS: Record<ShotFraming, string> = {
  wide: "wide establishing shot, subjects small in a readable space",
  medium: "medium shot, framed from the waist up",
  close: "close-up on the face, shallow depth of field",
  "extreme-close": "extreme close-up on a telling detail",
  "over-shoulder": "over-the-shoulder shot, foreground shoulder soft",
  insert: "insert shot of an object or hands, tight framing",
};

export const SHOT_CAMERA_PROMPTS: Record<ShotCamera, string> = {
  static: "locked-off camera, no camera movement",
  "push-in": "slow push-in toward the subject",
  "pull-out": "slow pull-out revealing the surroundings",
  pan: "smooth pan following the action",
  tracking: "tracking shot moving alongside the subject",
  handheld: "subtle handheld camera, intimate and alive",
  orbit: "slow orbit around the subject",
  crane: "crane move rising over the scene",
};

export const shotDurationSchema = z.literal([2, 3, 4, 5, 6, 8, 10]);
export type ShotDuration = z.infer<typeof shotDurationSchema>;

/** `continue` starts from the last frame of the previous shot's approved take. */
export const shotContinuitySchema = z.enum(["fresh", "continue"]);
export type ShotContinuity = z.infer<typeof shotContinuitySchema>;

export const takeRoleSchema = z.enum(["keyframe", "motion"]);
export type TakeRole = z.infer<typeof takeRoleSchema>;

export const takeStatusSchema = z.enum(["candidate", "approved", "rejected"]);
export type TakeStatus = z.infer<typeof takeStatusSchema>;

/** Where a take came from, so the shot's history reads as decisions. */
export const takeOriginSchema = z.enum([
  "generated",
  "continued",
  "revision",
  "library",
  "performance",
]);
export type TakeOrigin = z.infer<typeof takeOriginSchema>;

export const shotTakeSchema = z.object({
  id: z.string(),
  shotId: z.string(),
  role: takeRoleSchema,
  origin: takeOriginSchema,
  status: takeStatusSchema,
  /** The job that is producing or produced this take, if any. */
  jobId: z.string().nullable(),
  /** Null while the job has not saved an output yet. */
  asset: assetRefSchema.nullable(),
  /** The prompt the take was made with, for provenance. */
  prompt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ShotTake = z.infer<typeof shotTakeSchema>;

export const shotSchema = z.object({
  id: z.string(),
  sequenceId: z.string(),
  sortOrder: z.number().int(),
  title: z.string(),
  /** The story beat this shot carries, in the creator's words. */
  beat: z.string(),
  /** What the frame shows; may contain @mentions. */
  prompt: z.string(),
  /**
   * The geometry in words: who stands where, which side the camera is on,
   * what the light does. References carry what things look like; this
   * carries where they are.
   */
  staging: z.string().default(""),
  framing: shotFramingSchema,
  camera: shotCameraSchema,
  durationSeconds: shotDurationSchema,
  continuity: shotContinuitySchema,
  takes: z.array(shotTakeSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Shot = z.infer<typeof shotSchema>;

export const sequenceSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  /** The rough idea or script the plan was made from. */
  idea: z.string(),
  shots: z.array(shotSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Sequence = z.infer<typeof sequenceSchema>;

/** The list view: no takes, only what a card needs. */
export const sequenceSummarySchema = sequenceSchema
  .omit({ shots: true })
  .extend({
    shotCount: z.number().int().nonnegative(),
    approvedCount: z.number().int().nonnegative(),
    poster: assetRefSchema.nullable(),
  });
export type SequenceSummary = z.infer<typeof sequenceSummarySchema>;

const shotText = z.string().trim().max(2000);

/** One proposed shot, from the planner or typed by the creator. */
export const shotDraftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  beat: shotText.default(""),
  prompt: shotText.default(""),
  staging: shotText.default(""),
  framing: shotFramingSchema.default("medium"),
  camera: shotCameraSchema.default("static"),
  durationSeconds: shotDurationSchema.default(5),
  continuity: shotContinuitySchema.default("fresh"),
});
export type ShotDraft = z.infer<typeof shotDraftSchema>;
export type ShotDraftInput = z.input<typeof shotDraftSchema>;

export const createSequenceInputSchema = z.object({
  projectId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(120),
  idea: z.string().trim().max(8000).default(""),
  shots: z.array(shotDraftSchema).max(MAX_SEQUENCE_SHOTS).default([]),
});
export type CreateSequenceInput = z.input<typeof createSequenceInputSchema>;

export const updateSequenceInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  idea: z.string().trim().max(8000).optional(),
});
export type UpdateSequenceInput = z.infer<typeof updateSequenceInputSchema>;

export const addShotInputSchema = shotDraftSchema.extend({
  sequenceId: z.string().min(1),
  /** Insert after this shot; omitted appends. */
  afterShotId: z.string().min(1).optional(),
});
export type AddShotInput = z.input<typeof addShotInputSchema>;

// Spelled out rather than `shotDraftSchema.partial()`: Zod 4 still applies a
// field's default inside optional, which would reset untouched fields.
export const updateShotInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120).optional(),
  beat: shotText.optional(),
  prompt: shotText.optional(),
  staging: shotText.optional(),
  framing: shotFramingSchema.optional(),
  camera: shotCameraSchema.optional(),
  durationSeconds: shotDurationSchema.optional(),
  continuity: shotContinuitySchema.optional(),
});
export type UpdateShotInput = z.input<typeof updateShotInputSchema>;

export const moveShotInputSchema = z.object({
  id: z.string().min(1),
  direction: z.enum(["earlier", "later"]),
});
export type MoveShotInput = z.infer<typeof moveShotInputSchema>;

export const addTakeInputSchema = z
  .object({
    shotId: z.string().min(1),
    role: takeRoleSchema,
    origin: takeOriginSchema,
    jobId: z.string().min(1).optional(),
    asset: assetRefSchema.optional(),
    prompt: z.string().max(4000).default(""),
    /** Approve on arrival, e.g. a continuation frame the creator chose. */
    approve: z.boolean().default(false),
  })
  .refine((take) => take.jobId || take.asset, {
    message: "A take needs a job or an asset.",
  });
export type AddTakeInput = z.input<typeof addTakeInputSchema>;

export const setTakeStatusInputSchema = z.object({
  id: z.string().min(1),
  status: takeStatusSchema,
  /** The job's output, recorded when a take is decided before SQLite caught up. */
  asset: assetRefSchema.optional(),
});
export type SetTakeStatusInput = z.input<typeof setTakeStatusInputSchema>;

/** The take a shot currently stands on for a role, if one is approved. */
export function approvedTake(shot: Shot, role: TakeRole): ShotTake | null {
  return (
    shot.takes.find((t) => t.role === role && t.status === "approved") ?? null
  );
}

/**
 * The shot's direction as one prompt: what the frame shows, then framing and
 * camera language. Identity stays in the mentions; the project's look is
 * added on submission from the project itself, as for every other shot.
 */
export function composeShotPrompt(
  shot: Pick<Shot, "prompt" | "beat" | "framing" | "camera"> &
    Partial<Pick<Shot, "staging">>,
  options: { role: TakeRole },
): string {
  const parts = [
    (shot.prompt || shot.beat).trim().replace(/[.\s]+$/, ""),
    // Staging follows the subject so positions attach to who they describe.
    shot.staging?.trim().replace(/[.\s]+$/, ""),
    SHOT_FRAMING_PROMPTS[shot.framing],
  ];
  if (options.role === "motion") parts.push(SHOT_CAMERA_PROMPTS[shot.camera]);
  return `${parts.filter(Boolean).join(". ")}.`.slice(0, 2000);
}

/** Ask the planner for shots from an idea, using the creator's Elements. */
export const planSequenceInputSchema = z.object({
  idea: z.string().trim().min(3).max(8000),
  /** The project's portrayal, so beats are framed to match it. */
  direction: z.string().max(2000).default(""),
  /** Handles the planner may use in prompts, with what each one is. */
  elements: z
    .array(
      z.object({
        handle: z.string(),
        type: z.enum(["character", "location", "thing"]),
        name: z.string(),
        description: z.string().max(1000),
        states: z.array(z.string()).max(12).default([]),
      }),
    )
    .max(40)
    .default([]),
  maxShots: z.number().int().min(1).max(12).default(6),
});
export type PlanSequenceInput = z.input<typeof planSequenceInputSchema>;

export const sequencePlanSchema = z.object({
  title: z.string().trim().min(1).max(120),
  shots: z.array(shotDraftSchema).min(1).max(12),
  /** Who planned it: the model, or the offline beat splitter as a fallback. */
  planner: z.enum(["model", "beats"]),
  note: z.string().optional(),
});
export type SequencePlan = z.infer<typeof sequencePlanSchema>;

/**
 * The offline fallback: one shot per paragraph or sentence, in order. Honest
 * about what it is; the creator edits every shot before generating anyway.
 */
export function splitIdeaIntoBeats(idea: string, maxShots = 6): SequencePlan {
  const text = idea.trim();
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const pieces =
    paragraphs.length > 1
      ? paragraphs
      : (text.match(/[^.!?]+[.!?]*/g) ?? [text])
          .map((s) => s.trim())
          .filter((s) => s.length > 2);
  const beats = pieces.slice(0, maxShots);
  const framings: ShotFraming[] = ["wide", "medium", "close", "medium"];
  return sequencePlanSchema.parse({
    title: titleFrom(text),
    planner: "beats",
    shots: beats.map((beat, index) => ({
      title: titleFrom(beat),
      beat,
      prompt: beat,
      framing: index === 0 ? "wide" : framings[index % framings.length]!,
      camera: index === 0 ? "push-in" : "static",
      durationSeconds: 5,
      continuity: "fresh",
    })),
  });
}

function titleFrom(text: string): string {
  const words = text
    .replace(/@([A-Za-z][A-Za-z0-9_]*)/g, "$1")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
  const title = words || "Untitled sequence";
  return title.charAt(0).toUpperCase() + title.slice(1);
}
