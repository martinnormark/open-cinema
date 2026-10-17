/**
 * "Reuse a performance": LTX 2.3 Union Control IC-LoRA, run as a ComfyUI graph
 * on Comfy Cloud. The source clip supplies only motion: ComfyUI's own Canny
 * node traces edges from every frame, and the IC-LoRA makes a new clip whose
 * shapes follow those edges frame for frame. No third-party weights are used:
 * the checkpoint and IC-LoRA are Lightricks', and edge tracing is plain image
 * processing. Who is performing and where comes
 * from the prompt and a keyframe at frame 0 (a FLUX keyframe the app composes
 * from the Character and Location, or the Character's own reference).
 *
 * Edges carry the performer's outline, so the new Character's build and
 * silhouette lean toward the original's. `edges` blurs each frame before
 * tracing so texture (fabric, hair strands, faces) drops out and mostly
 * outlines and large shapes remain; the keyframe then decides the look.
 * `edges-detailed` traces the sharp frame for tighter blocking.
 *
 * The sampling half follows Comfy's own Cloud template `video_ltx2_3_ic_lora`
 * (github.com/Comfy-Org/workflow_templates), itself based on Lightricks'
 * LTX-2.3_ICLoRA_Union_Control_Distilled example: the fp8 distilled
 * checkpoint, the fp4 Gemma encoder, the IC-LoRA's own guide parameters read
 * by GetICLoRAParameters, and an 8-step KSampler. Lightricks' example (bf16 dev
 * checkpoint plus the distilled LoRA) crashed the Cloud worker on 2026-10-17;
 * see docs/performance-transfer.md. The example's DWPose annotator was replaced
 * by edge tracing so the entry relies on no other lab's weights. The source's audio is kept instead of the model's, since the
 * timing is the take's.
 */

import type {
  AssetRef,
  ReferenceView,
  ResolvedMention,
} from "@open-cinema/contracts";
import { LTX23_MODELS, type Graph, type Link } from "./ltx-graph";
import { expandMentions } from "./results";

export const LTX_PERFORMANCE_MODELS = {
  /**
   * Union Control is trained on LTX 2.3 22B, not 2.5. One fp8 file holds the
   * distilled transformer, both VAEs and the text projection.
   */
  checkpoint: LTX23_MODELS.checkpoint,
  textEncoder: LTX23_MODELS.textEncoder,
  /** Depth, pose and edges in one adapter; guides are read at half resolution. */
  unionControlLora: LTX23_MODELS.unionControl,
} as const;

/** The pipeline's id in job records; Comfy Cloud runs it, not Router. */
export const LTX_PERFORMANCE_MODEL_ID = "comfy-cloud/ltx-2.3-union-edges";

export const LTX_PERFORMANCE_LIMITS = {
  /** 8n+1 frames; about 4 s at 24 fps keeps one run cheap and inside memory. */
  maxFrames: 97,
  /** Longer side of the generated clip. */
  maxSide: 768,
  /**
   * The ref0.5 adapter reads its guide at half size, so the clip's sides are
   * multiples of 32 latent-pixels times that factor (the example's `a*32`).
   */
  sideMultiple: 64,
  maxSourceBytes: 100 * 1024 * 1024,
} as const;

/** From the Lightricks example; steers away from game-render and cartoon looks. */
const NEGATIVE_PROMPT =
  "pc game, console game, video game, cartoon, childish, ugly, deformed face, extra limbs, distorted hands";

export const LTX_PERFORMANCE_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
  keyframe: { node: "keyframe", field: "image" },
} as const;

/** SaveVideo nodes, in the order outputs are presented: the new shot, then its control. */
export const LTX_PERFORMANCE_OUTPUT_NODES = [
  "save_result",
  "save_control",
] as const;

export type PerformanceControl = "edges" | "edges-detailed";

/** Blur and Canny thresholds per control; softer edges carry less of the original look. */
export const PERFORMANCE_EDGES = {
  edges: { blurRadius: 4, sigma: 2, low: 0.2, high: 0.5 },
  "edges-detailed": { blurRadius: 1, sigma: 0.6, low: 0.4, high: 0.8 },
} as const satisfies Record<
  PerformanceControl,
  { blurRadius: number; sigma: number; low: number; high: number }
>;

export interface LtxPerformanceGraphOptions {
  prompt: string;
  control: PerformanceControl;
  /** How strongly the new clip follows the control video, 0.3–1. */
  strength: number;
  /** Frame-0 conditioning strength, or null to generate without a keyframe. */
  keyframeStrength: number | null;
  seed: number;
}

/** Sides scaled to fit maxSide, rounded to the adapter's multiple. */
function sideExpression(side: "a" | "b") {
  const { maxSide, sideMultiple: m } = LTX_PERFORMANCE_LIMITS;
  return `max(${m}, round(${side} * min(1, ${maxSide} / max(a, b)) / ${m}) * ${m})`;
}

/**
 * The API-format graph. File inputs are left empty; the Cloud client sets them
 * to uploaded assets named by LTX_PERFORMANCE_MEDIA_INPUTS.
 */
export function ltxPerformanceGraph(
  options: LtxPerformanceGraphOptions,
): Graph {
  const frames: Link = ["source_frames", 0];
  const audio: Link = ["source_frames", 1];
  const fps: Link = ["source_frames", 2];
  const width: Link = ["out_width", 1];
  const height: Link = ["out_height", 1];
  const length: Link = ["frame_count", 1];
  const control: Link = ["edges", 0];
  const edges = PERFORMANCE_EDGES[options.control];
  const latent: Link =
    options.keyframeStrength === null
      ? ["empty_video", 0]
      : ["keyframe_condition", 0];

  const graph: Graph = {
    source: { class_type: "LoadVideo", inputs: { file: "" } },
    source_frames: {
      class_type: "GetVideoComponents",
      inputs: { video: ["source", 0] },
    },
    source_size: { class_type: "GetImageSize", inputs: { image: frames } },
    // LTX needs 8n+1 frames; take the longest such run within the limit.
    frame_count: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: `max(1, ((min(a, ${LTX_PERFORMANCE_LIMITS.maxFrames}) - 1) // 8) * 8 + 1)`,
        "values.a": ["source_size", 2],
      },
    },
    out_width: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: sideExpression("a"),
        "values.a": ["source_size", 0],
        "values.b": ["source_size", 1],
      },
    },
    out_height: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: sideExpression("b"),
        "values.a": ["source_size", 0],
        "values.b": ["source_size", 1],
      },
    },
    clip: {
      class_type: "ImageFromBatch",
      inputs: { image: frames, batch_index: 0, length },
    },
    clip_fit: {
      class_type: "ImageScale",
      inputs: {
        image: ["clip", 0],
        upscale_method: "area",
        width,
        height,
        crop: "center",
      },
    },
    // Softening first drops texture so mostly outlines and large shapes guide
    // the motion; the Canny node is ComfyUI's own, with no model weights.
    soften: {
      class_type: "ImageBlur",
      inputs: {
        image: ["clip_fit", 0],
        blur_radius: edges.blurRadius,
        sigma: edges.sigma,
      },
    },
    edges: {
      class_type: "Canny",
      inputs: {
        image: ["soften", 0],
        low_threshold: edges.low,
        high_threshold: edges.high,
      },
    },

    checkpoint: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: LTX_PERFORMANCE_MODELS.checkpoint },
    },
    union_control: {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["checkpoint", 0],
        lora_name: LTX_PERFORMANCE_MODELS.unionControlLora,
        strength_model: 1,
      },
    },
    // The ref0.5 adapter's metadata says its guide is read at half size.
    iclora_parameters: {
      class_type: "GetICLoRAParameters",
      inputs: { iclora_model: ["union_control", 0] },
    },
    text_encoder: {
      class_type: "LTXAVTextEncoderLoader",
      inputs: {
        text_encoder: LTX_PERFORMANCE_MODELS.textEncoder,
        ckpt_name: LTX_PERFORMANCE_MODELS.checkpoint,
        device: "default",
      },
    },
    audio_vae: {
      class_type: "LTXVAudioVAELoader",
      inputs: { ckpt_name: LTX_PERFORMANCE_MODELS.checkpoint },
    },
    positive_text: {
      class_type: "CLIPTextEncode",
      inputs: { text: options.prompt, clip: ["text_encoder", 0] },
    },
    negative_text: {
      class_type: "CLIPTextEncode",
      inputs: { text: NEGATIVE_PROMPT, clip: ["text_encoder", 0] },
    },
    conditioning: {
      class_type: "LTXVConditioning",
      inputs: {
        positive: ["positive_text", 0],
        negative: ["negative_text", 0],
        frame_rate: fps,
      },
    },
    empty_video: {
      class_type: "EmptyLTXVLatentVideo",
      inputs: { width, height, length, batch_size: 1 },
    },
    guide: {
      class_type: "LTXVAddGuide",
      inputs: {
        positive: ["conditioning", 0],
        negative: ["conditioning", 1],
        vae: ["checkpoint", 2],
        latent,
        image: control,
        frame_idx: 0,
        strength: options.strength,
        iclora_parameters: ["iclora_parameters", 0],
      },
    },
    empty_audio: {
      class_type: "LTXVEmptyLatentAudio",
      inputs: {
        frames_number: length,
        frame_rate: fps,
        batch_size: 1,
        audio_vae: ["audio_vae", 0],
      },
    },
    av_latent: {
      class_type: "LTXVConcatAVLatent",
      inputs: { video_latent: ["guide", 2], audio_latent: ["empty_audio", 0] },
    },
    // The template's distilled settings: 8 steps, no CFG.
    sample: {
      class_type: "KSampler",
      inputs: {
        model: ["union_control", 0],
        seed: options.seed,
        steps: 8,
        cfg: 1,
        sampler_name: "euler_ancestral",
        scheduler: "linear_quadratic",
        positive: ["guide", 0],
        negative: ["guide", 1],
        latent_image: ["av_latent", 0],
        denoise: 1,
      },
    },
    separate: {
      class_type: "LTXVSeparateAVLatent",
      inputs: { av_latent: ["sample", 0] },
    },
    crop_guides: {
      class_type: "LTXVCropGuides",
      inputs: {
        positive: ["guide", 0],
        negative: ["guide", 1],
        latent: ["separate", 0],
      },
    },
    decode: {
      class_type: "VAEDecodeTiled",
      inputs: {
        samples: ["crop_guides", 2],
        vae: ["checkpoint", 2],
        tile_size: 512,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 8,
      },
    },
    result_video: {
      class_type: "CreateVideo",
      inputs: { images: ["decode", 0], fps, audio },
    },
    save_result: {
      class_type: "SaveVideo",
      inputs: {
        video: ["result_video", 0],
        filename_prefix: "open_cinema/performance",
        format: "mp4",
        "format.codec": "h264",
      },
      _meta: { title: "Performance" },
    },
    // The control clip is kept so a creator can see what motion was read.
    control_video: {
      class_type: "CreateVideo",
      inputs: { images: control, fps },
    },
    save_control: {
      class_type: "SaveVideo",
      inputs: {
        video: ["control_video", 0],
        filename_prefix: "open_cinema/performance_control",
        format: "mp4",
        "format.codec": "h264",
      },
      _meta: { title: "Control" },
    },
  };

  if (options.keyframeStrength !== null) {
    graph.keyframe = { class_type: "LoadImage", inputs: { image: "" } };
    graph.keyframe_fit = {
      class_type: "ImageScale",
      inputs: {
        image: ["keyframe", 0],
        upscale_method: "lanczos",
        width,
        height,
        crop: "center",
      },
    };
    graph.keyframe_condition = {
      class_type: "LTXVImgToVideoInplace",
      inputs: {
        vae: ["checkpoint", 2],
        image: ["keyframe_fit", 0],
        latent: ["empty_video", 0],
        strength: options.keyframeStrength,
        bypass: false,
      },
    };
  }
  return graph;
}

/** Whole-person views, best first: a keyframe needs the body, not just a face. */
const KEYFRAME_VIEWS: readonly ReferenceView[] = [
  "full-body",
  "front",
  "three-quarter",
];

/**
 * A Character reference was not composed for this shot (framing, setting and
 * pose differ from the source's first frame), so it only leans on frame 0
 * instead of fixing it. A composed `firstFrame` is held exactly.
 */
export const REFERENCE_KEYFRAME_STRENGTH = 0.6;

/** The Character reference that opens the shot when no keyframe was given. */
export function characterKeyframe(
  character: ResolvedMention | undefined,
): AssetRef | null {
  if (!character) return null;
  const rank = (view: ReferenceView | null) => {
    const i = view ? KEYFRAME_VIEWS.indexOf(view) : -1;
    return i === -1 ? KEYFRAME_VIEWS.length : i;
  };
  // A sheet's body panels are headless on purpose and would open on a headless figure.
  const usable = character.references.filter((r) => r.view !== "sheet");
  const best = [...usable].sort((a, b) => rank(a.view) - rank(b.view))[0];
  return best?.asset ?? null;
}

function describe(mention: ResolvedMention) {
  const state = mention.stateName ? ` (${mention.stateName})` : "";
  const details = [mention.description, mention.stateDescription]
    .filter(Boolean)
    .join(" ")
    .trim()
    .replace(/[.\s]+$/, "");
  return `${mention.name}${state}${details ? `: ${details}` : ""}.`;
}

/**
 * Edges carry no identity, so who and where must be in the text: the
 * creator's prompt with mentions expanded, then each Element's description.
 */
export function performancePrompt(
  prompt: string,
  mentions: readonly ResolvedMention[],
  character: ResolvedMention | undefined,
  location: ResolvedMention | undefined,
): string {
  const text = expandMentions(prompt, mentions)
    .trim()
    .replace(/[.\s]*$/, ".");
  const parts = [text];
  if (character) parts.push(describe(character));
  if (location) parts.push(describe(location));
  parts.push("Photorealistic, natural motion, consistent identity throughout.");
  return parts.join(" ").slice(0, 2000);
}
