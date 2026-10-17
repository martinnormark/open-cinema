import { z } from "zod";
import { assetRefSchema } from "./media";
import { workflowKindSchema } from "./workflow-kinds";

/**
 * Kling 3.0 Omni video-edit limits (Router schema, 2026-10-16), shared by the
 * request builders and the studio's source check.
 */
export const KLING_EDIT_LIMITS = {
  minSeconds: 3,
  maxSeconds: 10,
  minShortSidePx: 720,
  minFps: 23.9,
  maxFps: 60.5,
  maxReferenceImages: 4,
} as const;

/** Coordinates are normalized to 0..1 of the frame so they survive rescaling. */
const unit = z.number().min(0).max(1);
export const framePointSchema = z.object({
  x: unit,
  y: unit,
  timeMs: z.number().int().nonnegative(),
});
export type FramePoint = z.infer<typeof framePointSchema>;

export const frameBoxSchema = z.object({
  x: unit,
  y: unit,
  width: unit,
  height: unit,
  timeMs: z.number().int().nonnegative(),
});
export type FrameBox = z.infer<typeof frameBoxSchema>;

/** Which part of the source a selective revision may change. */
export const targetSelectionSchema = z.discriminatedUnion("type", [
  /** The background behind every foreground subject. */
  z.object({ type: z.literal("background") }),
  /** One person, identified by a point or box on a frame plus an optional description. */
  z.object({
    type: z.literal("person"),
    point: framePointSchema.optional(),
    box: frameBoxSchema.optional(),
    description: z.string().trim().max(300).optional(),
  }),
  /** A creator-supplied or previously generated alpha matte. */
  z.object({ type: z.literal("mask"), mask: assetRefSchema }),
]);
export type TargetSelection = z.infer<typeof targetSelectionSchema>;

/** What the result must keep from the source, per GOALS.md section 8. */
export const preservedAspectSchema = z.enum([
  "performance",
  "timing",
  "camera",
  "framing",
  "foreground",
  "background",
  "other-people",
  "things",
  "audio",
  "wardrobe",
  "lighting",
]);
export type PreservedAspect = z.infer<typeof preservedAspectSchema>;

export const preservationIntentSchema = z.object({
  preserve: z.array(preservedAspectSchema).min(1),
  /** Allows scoped integration changes such as contact shadows or relighting. */
  allowIntegration: z.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});
export type PreservationIntent = z.infer<typeof preservationIntentSchema>;

export const DEFAULT_PRESERVATION = {
  background: {
    preserve: ["foreground", "performance", "timing", "camera", "audio"],
    allowIntegration: true,
  },
  character: {
    preserve: [
      "performance",
      "timing",
      "camera",
      "framing",
      "background",
      "other-people",
      "things",
      "audio",
    ],
    allowIntegration: true,
  },
  object: {
    preserve: [
      "performance",
      "timing",
      "camera",
      "framing",
      "background",
      "other-people",
      "audio",
    ],
    allowIntegration: true,
  },
  restyle: {
    preserve: ["performance", "timing", "camera", "framing", "audio"],
    allowIntegration: true,
  },
  restage: {
    preserve: ["performance", "timing", "audio"],
    allowIntegration: true,
  },
} as const satisfies Record<string, PreservationIntent>;

export const revisionStatusSchema = z.enum([
  "pending",
  "proposed",
  "kept",
  "rejected",
  "failed",
]);
export type RevisionStatus = z.infer<typeof revisionStatusSchema>;

/**
 * A revision records a deliberate change to a source: the original stays
 * available for comparison, branching, and reversal.
 */
export const revisionSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  projectId: z.string().nullable().default(null),
  /** Branching: the revision this one was made from, if any. */
  parentRevisionId: z.string().nullable().default(null),
  source: assetRefSchema,
  /** The generated result once the job succeeds. */
  result: assetRefSchema.nullable().default(null),
  jobId: z.string().nullable().default(null),
  workflowKind: workflowKindSchema,
  /** The creator's stated change, e.g. "Move this scene to @Harbor at dusk". */
  intent: z.string(),
  status: revisionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Revision = z.infer<typeof revisionSchema>;

export const setRevisionStatusInputSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["kept", "rejected"]),
  /**
   * Keeps a different result variant of the same job (for example the relit
   * edit instead of the foreground lock). Must be one of that job's outputs.
   */
  resultOutputId: z.string().min(1).optional(),
});
export type SetRevisionStatusInput = z.infer<
  typeof setRevisionStatusInputSchema
>;
