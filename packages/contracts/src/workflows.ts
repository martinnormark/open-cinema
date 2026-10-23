import { z } from "zod";
import {
  elementMentionSchema,
  elementTypeSchema,
  referenceRoleSchema,
  referenceViewSchema,
} from "./elements";
import { cameraMoveSchema, restageAngleSchema } from "./camera";
import { vfxEffectSchema } from "./vfx";
import {
  CLIP_PEOPLE,
  motionEngineSchema,
  motionResolutionSchema,
} from "./moves";
import {
  extendPipelineSchema,
  extendSecondsSchema,
  momentRangeSchema,
  reframeAspectSchema,
} from "./take-edits";
import { assetRefSchema, type AssetRef } from "./media";
import { directionSnapshotSchema } from "./direction";
import {
  framePointSchema,
  preservationIntentSchema,
  targetSelectionSchema,
} from "./replacement";
import { workflowKindSchema, type WorkflowKind } from "./workflow-kinds";

export { workflowKindSchema, type WorkflowKind } from "./workflow-kinds";

const prompt = z.string().trim().min(3).max(2000);
/** A short noun phrase for something in the frame, e.g. "the dancer on the left". */
const objectPhraseSchema = z.string().trim().min(3).max(200);
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

/**
 * Text-to-video from references: the mentioned Elements' approved references
 * carry the picture (faces, wardrobe, the place) and the prompt carries
 * everything else, including the geometry: who stands where, which side the
 * camera is on, what the light does. A Location's moving reference goes in as
 * a reference video, so the shot inherits the architecture around the camera
 * rather than one frontal still. No first frame: the shot is composed from
 * the words, not animated from a keyframe.
 */
export const referenceVideoInputsSchema = z.object({
  prompt,
  durationSeconds: z.literal([3, 4, 5, 6, 8, 10]).default(5),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  mentions,
  direction,
});
export type ReferenceVideoInputs = z.infer<typeof referenceVideoInputsSchema>;

export const backgroundPipelineSchema = z.enum([
  "kling",
  "ltx-alpha",
  "seedance",
]);
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
   * background image or clip, or the Location's best reference. `seedance`
   * moves the whole shot (Seedance 2.5 video edit) for takes whose camera
   * travels too far for Kling to hold the new setting.
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

export const performanceControlSchema = z.enum(["edges", "edges-detailed"]);
export type PerformanceControl = z.infer<typeof performanceControlSchema>;

/**
 * One swap in Copy the moves: a person the creator tagged on a frame of the
 * clip (`@person1`) and the Character who takes their place.
 */
export const castSwapSchema = z.object({
  /** The tag's number: 1 for `@person1`. */
  person: z.number().int().min(1).max(CLIP_PEOPLE.max),
  character: elementMentionSchema,
  /** Where they were clicked, in the time of the clip that is sent. */
  point: framePointSchema,
  /** That person cut out of the frame, so the model sees who is meant. */
  crop: assetRefSchema.optional(),
  /**
   * The person's box on that frame (0–1), when the studio's pose model found
   * them. SAM 3 segments the whole person from it; a click alone can catch
   * only what is under it, such as a shirt number.
   */
  box: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().positive().max(1),
      h: z.number().positive().max(1),
    })
    .optional(),
});
export type CastSwap = z.infer<typeof castSwapSchema>;

/**
 * "Copy the moves" (once "Reuse a performance"): the source clip supplies the
 * acting, choreography and timing; the result shows the intended Character
 * and setting instead. `engine` names the model that runs (contracts/moves.ts).
 */
export const performanceTransferInputsSchema = z.object({
  /** The performance clip, uploaded or generated. */
  source: assetRefSchema,
  /**
   * The model that copies the moves. Runs made before the engines existed
   * were all LTX 2.3 Union Control, so that stays the default when absent.
   */
  engine: motionEngineSchema.default("ltx-edges"),
  /** Who performs in the new shot. With `cast`, the first swap's Character. */
  character: elementMentionSchema.optional(),
  /**
   * Wan 3.0: tagged people and who each becomes, for clips with several
   * people. Replaces `performer`; untagged people stay as filmed.
   */
  cast: z.array(castSwapSchema).max(CLIP_PEOPLE.maxSwaps).default([]),
  /** Where the new shot takes place; without one the clip's own place stays. */
  location: elementMentionSchema.optional(),
  /** Which person in the clip the Character replaces, in words. */
  performer: objectPhraseSchema.optional(),
  /**
   * The new shot's opening frame, e.g. a FLUX keyframe of the Character in the
   * source's first pose. Without it the Character's reference is used.
   */
  firstFrame: assetRefSchema.optional(),
  /** What the new shot shows. */
  prompt,
  /**
   * The clip's length in seconds, as the composer measured it. Wan 3.0 makes
   * a clip this long, and Wan Animate 2 samples its frames over it.
   */
  seconds: z.number().positive().max(60).optional(),
  /**
   * Wan 3.0: lay the clip's own sound under the result. Off for a silent clip,
   * which has none to lay.
   */
  sound: z.boolean().default(true),
  /** Wan engines: the output's resolution tier. */
  resolution: motionResolutionSchema.default("720p"),
  /**
   * LTX only. Motion is read as edges traced from each frame, with no
   * third-party weights. `edges` softens the frame first so mostly outlines
   * and large shapes guide the motion, leaving the Character's look to the
   * keyframe; `edges-detailed` keeps finer lines (folds, fingers) for tighter
   * blocking, at the cost of carrying more of the original performer's look.
   */
  control: performanceControlSchema.default("edges"),
  /** LTX only: how closely the new clip follows the source's motion. */
  strength: z.number().min(0.3).max(1).default(0.9),
  mentions,
});
export type PerformanceTransferInputs = z.infer<
  typeof performanceTransferInputsSchema
>;
/** Short descriptions SAM 3 can find in every frame, e.g. "the table lamp". */
const objectPhrase = objectPhraseSchema;

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

export const vfxInputsSchema = z.object({
  source: assetRefSchema,
  effect: vfxEffectSchema,
  /** The water, the night, or what to clear, in the creator's words. */
  prompt: prompt.optional(),
  /** Clear the set only: who stays in the shot, as a short noun phrase. */
  keep: objectPhrase.optional(),
  preservation: preservationIntentSchema,
});
export type VfxInputs = z.infer<typeof vfxInputsSchema>;

/** Make it longer: new seconds after the take's last frame. */
export const extendInputsSchema = z.object({
  source: assetRefSchema,
  pipeline: extendPipelineSchema.default("seedance"),
  /** Seedance only; LTX adds about three seconds. */
  seconds: extendSecondsSchema.default(4),
  /** What happens next; @mentions bring in Elements. */
  prompt: prompt.optional(),
  mentions,
  preservation: preservationIntentSchema,
});
export type ExtendInputs = z.infer<typeof extendInputsSchema>;

/** A small PNG of the brushed area: white is redone, black is kept. */
const maskDataUri = z
  .string()
  .max(400_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);

/**
 * Fix an area: a brushed region of the take's first seconds, rebuilt. Empty
 * words clear it (LTX 2.3); words put something there (Wan VACE).
 */
export const areaInputsSchema = z.object({
  source: assetRefSchema,
  mask: maskDataUri,
  /** What the area should show instead; empty clears it. */
  prompt: prompt.optional(),
  preservation: preservationIntentSchema,
});
export type AreaInputs = z.infer<typeof areaInputsSchema>;

/** Redo a moment: up to three seconds anywhere in the take, acted again. */
export const momentInputsSchema = z.object({
  source: assetRefSchema,
  range: momentRangeSchema,
  /** What happens in the moment instead. */
  prompt,
  mentions,
  preservation: preservationIntentSchema,
});
export type MomentInputs = z.infer<typeof momentInputsSchema>;

/** Reframe: the take on a new aspect, the new edges drawn in. */
export const reframeInputsSchema = z.object({
  source: assetRefSchema,
  aspect: reframeAspectSchema,
  /** What is around the shot, for the new edges. */
  prompt: prompt.optional(),
  preservation: preservationIntentSchema,
});
export type ReframeInputs = z.infer<typeof reframeInputsSchema>;

export const workflowInputsSchemas = {
  "image.flux": fluxImageInputsSchema,
  "image.flux-reference": fluxReferenceInputsSchema,
  "video.ltx": ltxVideoInputsSchema,
  "video.reference": referenceVideoInputsSchema,
  "video.background-replace": backgroundReplaceInputsSchema,
  "video.character-replace": characterReplaceInputsSchema,
  "video.performance-transfer": performanceTransferInputsSchema,
  "video.object-swap": objectSwapInputsSchema,
  "video.restyle": restyleInputsSchema,
  "video.restage": restageInputsSchema,
  "video.vfx": vfxInputsSchema,
  "video.extend": extendInputsSchema,
  "video.area": areaInputsSchema,
  "video.moment": momentInputsSchema,
  "video.reframe": reframeInputsSchema,
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
    workflowKind: z.literal("video.reference"),
    inputs: referenceVideoInputsSchema,
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
  z.object({
    workflowKind: z.literal("video.vfx"),
    inputs: vfxInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.extend"),
    inputs: extendInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.area"),
    inputs: areaInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.moment"),
    inputs: momentInputsSchema,
  }),
  z.object({
    workflowKind: z.literal("video.reframe"),
    inputs: reframeInputsSchema,
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
    case "video.reference":
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
        ...request.inputs.cast.flatMap((swap) =>
          swap.crop ? [swap.crop] : [],
        ),
      ];
    case "video.object-swap":
    case "video.restage":
    case "video.vfx":
    case "video.extend":
    case "video.area":
    case "video.moment":
    case "video.reframe":
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
      const { character, location, mentions, cast } = request.inputs;
      const all = [
        ...(character ? [character] : []),
        ...cast.map((swap) => swap.character),
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
    case "video.vfx":
      return [];
    case "video.area":
    case "video.reframe":
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
  "video.reference": {
    kind: "video.reference",
    label: "Video from references",
    output: "video",
    models: ["kling/kling-v3-omni"],
  },
  "video.background-replace": {
    kind: "video.background-replace",
    label: "Replace background",
    output: "video",
    models: ["kling/kling-v3-omni", "comfy-cloud/ltx-2.5-alpha-gen"],
  },
  "video.character-replace": {
    kind: "video.character-replace",
    label: "Recast character",
    output: "video",
    models: ["kling/kling-v3-omni"],
  },
  "video.performance-transfer": {
    kind: "video.performance-transfer",
    label: "Copy the moves",
    output: "video",
    models: [
      "wan/wan3.0-video",
      "comfy-cloud/sam3-wan3-cast",
      "comfy-cloud/wan-animate-2",
      "comfy-cloud/ltx-2.3-union-edges",
    ],
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
    models: ["comfy-cloud/ltx-2.3-restage"],
  },
  "video.vfx": {
    kind: "video.vfx",
    label: "Add an effect",
    output: "video",
    models: ["comfy-cloud/ltx-2.3-vfx"],
  },
  "video.extend": {
    kind: "video.extend",
    label: "Make it longer",
    output: "video",
    models: [
      "byteplus/dreamina-seedance-2-5-260628",
      "comfy-cloud/ltx-2.3-fill",
    ],
  },
  "video.area": {
    kind: "video.area",
    label: "Fix an area",
    output: "video",
    models: ["comfy-cloud/ltx-2.3-fill", "comfy-cloud/wan-2.1-vace"],
  },
  "video.moment": {
    kind: "video.moment",
    label: "Redo a moment",
    output: "video",
    models: ["comfy-cloud/ltx-2.3-fill"],
  },
  "video.reframe": {
    kind: "video.reframe",
    label: "Reframe",
    output: "video",
    models: ["comfy-cloud/ltx-2.3-fill"],
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
  /** Approved moving references (a Location's empty-location clips), best first. */
  motion: z
    .array(
      z.object({
        asset: assetRefSchema,
        view: referenceViewSchema.nullable(),
      }),
    )
    .max(3)
    .default([]),
});
export type ResolvedMention = z.infer<typeof resolvedMentionSchema>;

/** Converts the legacy prompt-only command into the typed request it means. */
export function promptToRequest(prompt: string): GenerationRequest {
  return generationRequestSchema.parse({
    workflowKind: "image.flux",
    inputs: { prompt },
  });
}
