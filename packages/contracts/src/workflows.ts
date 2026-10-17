import { z } from "zod";
import {
  elementMentionSchema,
  elementTypeSchema,
  referenceRoleSchema,
  referenceViewSchema,
} from "./elements";
import { cameraMoveSchema, restageAngleSchema } from "./camera";
import { assetRefSchema, type AssetRef } from "./media";
import { directionSnapshotSchema } from "./direction";
import { preservationIntentSchema, targetSelectionSchema } from "./replacement";
import { workflowKindSchema, type WorkflowKind } from "./workflow-kinds";

export { workflowKindSchema, type WorkflowKind } from "./workflow-kinds";

const prompt = z.string().trim().min(3).max(2000);
const mentions = z.array(elementMentionSchema).max(8).default([]);
/** The project look, shot overrides and recipe this generation was directed with. */
const direction = directionSnapshotSchema.optional();

export const imageAspectRatioSchema = z.enum([
  "auto",
  "21:9",
  "16:9",
  "3:2",
  "4:3",
  "1:1",
  "3:4",
  "2:3",
  "9:16",
]);
export type ImageAspectRatio = z.infer<typeof imageAspectRatioSchema>;
export const imageResolutionSchema = z.enum(["1k", "1.5k", "2k"]);
export type ImageResolution = z.infer<typeof imageResolutionSchema>;

export const fluxImageInputsSchema = z.object({
  prompt,
  aspectRatio: imageAspectRatioSchema.default("1:1"),
  resolution: imageResolutionSchema.default("1k"),
  mentions,
  direction,
});
export type FluxImageInputs = z.infer<typeof fluxImageInputsSchema>;

export const fluxReferenceInputsSchema = fluxImageInputsSchema.extend({
  aspectRatio: imageAspectRatioSchema.default("auto"),
  /** Explicit references in addition to those resolved from mentions. */
  references: z.array(assetRefSchema).max(10).default([]),
});
export type FluxReferenceInputs = z.infer<typeof fluxReferenceInputsSchema>;

export const videoResolutionSchema = z.enum([
  "1280x720",
  "720x1280",
  "1920x1080",
  "1080x1920",
]);
export type VideoResolution = z.infer<typeof videoResolutionSchema>;

export const ltxVideoInputsSchema = z.object({
  prompt,
  durationSeconds: z.literal([2, 3, 4, 5, 6, 8, 10]).default(5),
  resolution: videoResolutionSchema.default("1280x720"),
  fps: z.literal([24, 25]).default(25),
  generateAudio: z.boolean().default(true),
  quality: z.enum(["fast", "pro"]).default("fast"),
  /** Animates this image. Router's LTX is text-only, so this runs on FLUX 3 Video. */
  firstFrame: assetRefSchema.optional(),
  /**
   * A camera move made by an LTX-2 camera-control LoRA on Comfy Cloud, with or
   * without a first frame. Without one, the prompt alone directs the camera.
   */
  camera: cameraMoveSchema.optional(),
  mentions,
  direction,
});
export type LtxVideoInputs = z.infer<typeof ltxVideoInputsSchema>;

export const backgroundPipelineSchema = z.enum(["kling", "ltx-alpha"]);
export type BackgroundPipelineChoice = z.infer<typeof backgroundPipelineSchema>;

export const backgroundReplaceInputsSchema = z.object({
  source: assetRefSchema,
  /** A Location (and optional state) to supply the new setting. */
  location: elementMentionSchema.optional(),
  /** Or an explicit background image/video. */
  background: assetRefSchema.optional(),
  prompt: prompt.optional(),
  target: targetSelectionSchema.default({ type: "background" }),
  preservation: preservationIntentSchema,
  /**
   * `kling` regenerates the setting around the take (Kling 3.0 Omni edit, with
   * relight and parallax). `ltx-alpha` keeps the take's pixels: LTX 2.5 Alpha
   * Gen mattes the subject on Comfy Cloud and composites it over the
   * background image or clip, or the Location's best reference.
   */
  pipeline: backgroundPipelineSchema.default("kling"),
  /** The project look the new setting should follow (palette, light, texture). */
  direction,
});
export type BackgroundReplaceInputs = z.infer<
  typeof backgroundReplaceInputsSchema
>;

export const characterReplaceInputsSchema = z.object({
  source: assetRefSchema,
  target: targetSelectionSchema,
  character: elementMentionSchema,
  /** Extra references beyond the Character's approved sheet, e.g. wardrobe. */
  references: z.array(assetRefSchema).max(7).default([]),
  prompt: prompt.optional(),
  preservation: preservationIntentSchema,
});
export type CharacterReplaceInputs = z.infer<
  typeof characterReplaceInputsSchema
>;

export const performanceControlSchema = z.enum(["pose", "pose-depth"]);
export type PerformanceControl = z.infer<typeof performanceControlSchema>;

/**
 * "Reuse a performance": the source clip supplies acting, choreography and
 * timing; the result shows the intended Character and setting instead.
 */
export const performanceTransferInputsSchema = z.object({
  /** The performance clip, uploaded or generated. */
  source: assetRefSchema,
  /** Who performs in the new shot. */
  character: elementMentionSchema.optional(),
  /** Where the new shot takes place. */
  location: elementMentionSchema.optional(),
  /**
   * The new shot's opening frame, e.g. a FLUX keyframe of the Character in the
   * source's first pose. Without it the Character's reference is used.
   */
  firstFrame: assetRefSchema.optional(),
  /** What the new shot shows. */
  prompt,
  /**
   * `pose` reads only a skeleton, so the Character's build and outfit are free.
   * `pose-depth` adds the source's depth for tighter blocking, at the cost of
   * carrying the original performer's silhouette.
   */
  control: performanceControlSchema.default("pose"),
  /** How closely the new clip follows the source's motion. */
  strength: z.number().min(0.3).max(1).default(0.9),
  mentions,
});
export type PerformanceTransferInputs = z.infer<
  typeof performanceTransferInputsSchema
>;
/** Short descriptions SAM 3 can find in every frame, e.g. "the table lamp". */
const objectPhrase = z.string().trim().min(3).max(200);

export const objectSwapInputsSchema = z.object({
  source: assetRefSchema,
  /** The Thing that takes the object's place, with its approved sheet. */
  thing: elementMentionSchema,
  /** The object in the take that is replaced, in words. */
  original: objectPhrase,
  /** Where the creator marked the object, to word the instruction. */
  point: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      timeMs: z.number().int().nonnegative().optional(),
    })
    .optional(),
  prompt: prompt.optional(),
  preservation: preservationIntentSchema,
});
export type ObjectSwapInputs = z.infer<typeof objectSwapInputsSchema>;

export const restyleInputsSchema = z.object({
  source: assetRefSchema,
  /** A Location (or any Element) whose approved references set the look. */
  style: elementMentionSchema.optional(),
  /** Or an explicit style reference image. */
  styleImage: assetRefSchema.optional(),
  /** The look in words; required when no reference is given. */
  prompt: prompt.optional(),
  preservation: preservationIntentSchema,
});
export type RestyleInputs = z.infer<typeof restyleInputsSchema>;

export const restageInputsSchema = z.object({
  source: assetRefSchema,
  angle: restageAngleSchema,
  /** What is in the shot, so the new angle keeps it. */
  prompt: prompt.optional(),
  preservation: preservationIntentSchema,
});
export type RestageInputs = z.infer<typeof restageInputsSchema>;

export const workflowInputsSchemas = {
  "image.flux": fluxImageInputsSchema,
  "image.flux-reference": fluxReferenceInputsSchema,
  "video.ltx": ltxVideoInputsSchema,
  "video.background-replace": backgroundReplaceInputsSchema,
  "video.character-replace": characterReplaceInputsSchema,
  "video.performance-transfer": performanceTransferInputsSchema,
  "video.object-swap": objectSwapInputsSchema,
  "video.restyle": restyleInputsSchema,
  "video.restage": restageInputsSchema,
} as const satisfies Record<WorkflowKind, z.ZodType>;

export type WorkflowInputs<K extends WorkflowKind = WorkflowKind> = z.infer<
  (typeof workflowInputsSchemas)[K]
>;

/** A typed generation request: the workflow kind plus its validated inputs. */
export const generationRequestSchema = z.discriminatedUnion("workflowKind", [
  z.object({
    workflowKind: z.literal("image.flux"),
    inputs: fluxImageInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("image.flux-reference"),
    inputs: fluxReferenceInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.ltx"),
    inputs: ltxVideoInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.background-replace"),
    inputs: backgroundReplaceInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.character-replace"),
    inputs: characterReplaceInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.performance-transfer"),
    inputs: performanceTransferInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.object-swap"),
    inputs: objectSwapInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.restyle"),
    inputs: restyleInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.restage"),
    inputs: restageInputsSchema,
  }),
]);
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GenerationRequestInput = z.input<typeof generationRequestSchema>;

export const workflowCommandSchema = z.object({
  idempotencyKey: z.string().uuid(),
  request: generationRequestSchema,
  projectId: z.string().min(1).optional(),
  /** Set when this generation is a selective revision of an existing source. */
  revision: z
    .object({
      intent: z.string().trim().min(1).max(2000),
      parentRevisionId: z.string().min(1).optional(),
    })
    .optional(),
});
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>;
export type WorkflowCommandInput = z.input<typeof workflowCommandSchema>;

/** Explicit media refs a request carries; mentions resolve to references separately. */
export function requestAssetRefs(request: GenerationRequest): AssetRef[] {
  switch (request.workflowKind) {
    case "image.flux":
      return [];
    case "video.ltx":
      return request.inputs.firstFrame ? [request.inputs.firstFrame] : [];
    case "image.flux-reference":
      return request.inputs.references;
    case "video.background-replace":
      return [
        request.inputs.source,
        ...(request.inputs.background ? [request.inputs.background] : []),
        ...(request.inputs.target.type === "mask"
          ? [request.inputs.target.mask]
          : []),
      ];
    case "video.character-replace":
      return [
        request.inputs.source,
        ...request.inputs.references,
        ...(request.inputs.target.type === "mask"
          ? [request.inputs.target.mask]
          : []),
      ];
    case "video.performance-transfer":
      return [
        request.inputs.source,
        ...(request.inputs.firstFrame ? [request.inputs.firstFrame] : []),
      ];
    case "video.object-swap":
    case "video.restage":
      return [request.inputs.source];
    case "video.restyle":
      return [
        request.inputs.source,
        ...(request.inputs.styleImage ? [request.inputs.styleImage] : []),
      ];
  }
}

export function requestPrompt(request: GenerationRequest): string {
  return request.inputs.prompt ?? "";
}

export function requestDirection(request: GenerationRequest) {
  return "direction" in request.inputs ? request.inputs.direction : undefined;
}

export function requestMentions(request: GenerationRequest) {
  switch (request.workflowKind) {
    case "video.background-replace":
      return request.inputs.location ? [request.inputs.location] : [];
    case "video.character-replace":
      return [request.inputs.character];
    case "video.performance-transfer": {
      const { character, location, mentions } = request.inputs;
      const all = [
        ...(character ? [character] : []),
        ...(location ? [location] : []),
        ...mentions,
      ];
      // The Character may also be in `mentions`; resolve each Element once.
      return all.filter(
        (m, i) => all.findIndex((n) => n.elementId === m.elementId) === i,
      );
    }
    case "video.object-swap":
      return [request.inputs.thing];
    case "video.restyle":
      return request.inputs.style ? [request.inputs.style] : [];
    case "video.restage":
      return [];
    default:
      return request.inputs.mentions;
  }
}

export const workflowOutputKindSchema = z.enum(["image", "video"]);

export const estimateRangeSchema = z.object({
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
});

/** Shown before generation; `basis` keeps guesses distinguishable from measurements. */
export const generationEstimateSchema = z.object({
  /** Comfy credits; null when the provider publishes no price for these inputs. */
  credits: estimateRangeSchema.nullable(),
  seconds: estimateRangeSchema,
  basis: z.enum(["published-pricing", "observed", "heuristic"]),
  note: z.string().optional(),
});
export type GenerationEstimate = z.infer<typeof generationEstimateSchema>;

/** Static, display-safe facts about a workflow kind. */
export interface WorkflowDescriptor {
  kind: WorkflowKind;
  label: string;
  output: z.infer<typeof workflowOutputKindSchema>;
  /** Router model id(s) this kind dispatches to. */
  models: readonly string[];
}

export const WORKFLOW_DESCRIPTORS = {
  "image.flux": {
    kind: "image.flux",
    label: "Image",
    output: "image",
    models: ["bfl/flux-3-image"],
  },
  "image.flux-reference": {
    kind: "image.flux-reference",
    label: "Image from references",
    output: "image",
    models: ["bfl/flux-3-image"],
  },
  "video.ltx": {
    kind: "video.ltx",
    label: "Video",
    output: "video",
    models: [
      "ltx/ltx-2-5-fast",
      "ltx/ltx-2-5-pro",
      "bfl/flux-3-video",
      "comfy-cloud/ltx-2-camera-lora",
    ],
  },
  "video.background-replace": {
    kind: "video.background-replace",
    label: "Replace background",
    output: "video",
    models: [
      "kling/kling-v3-omni",
      "beeble/switchx",
      "comfy-cloud/ltx-2.5-alpha-gen",
    ],
  },
  "video.character-replace": {
    kind: "video.character-replace",
    label: "Recast character",
    output: "video",
    models: ["kling/kling-v3-omni"],
  },
  "video.performance-transfer": {
    kind: "video.performance-transfer",
    label: "Reuse performance",
    output: "video",
    models: ["comfy-cloud/ltx-2.3-union-pose"],
  },
  "video.object-swap": {
    kind: "video.object-swap",
    label: "Swap an object",
    output: "video",
    models: ["comfy-cloud/ltx-2.3-object-swap"],
  },
  "video.restyle": {
    kind: "video.restyle",
    label: "Restyle",
    output: "video",
    models: ["comfy-cloud/ltx-2.3-restyle"],
  },
  "video.restage": {
    kind: "video.restage",
    label: "Re-stage the camera",
    output: "video",
    // Not registered: no model of our own yet (docs/third-party-ip.md).
    models: [],
  },
} as const satisfies Record<WorkflowKind, WorkflowDescriptor>;

/**
 * What a mention resolved to when the job was accepted. Persisted with the job
 * so a result records the Element version and references that produced it.
 */
export const resolvedMentionSchema = z.object({
  elementId: z.string(),
  handle: z.string(),
  name: z.string(),
  type: elementTypeSchema,
  version: z.number().int().positive(),
  description: z.string(),
  stateId: z.string().nullable(),
  stateName: z.string().nullable(),
  stateDescription: z.string().nullable(),
  /** Every combined state, primary first; older records have none. */
  states: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        kind: z.string(),
      }),
    )
    .max(3)
    .default([]),
  references: z
    .array(
      z.object({
        asset: assetRefSchema,
        view: referenceViewSchema.nullable(),
        roles: z.array(referenceRoleSchema),
      }),
    )
    .max(16),
});
export type ResolvedMention = z.infer<typeof resolvedMentionSchema>;

/** Converts the legacy prompt-only command into the typed request it means. */
export function promptToRequest(prompt: string): GenerationRequest {
  return generationRequestSchema.parse({
    workflowKind: "image.flux",
    inputs: { prompt },
  });
}
