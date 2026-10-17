import { LTX_ALPHA_MODELS } from "./ltx-alpha-background";
import { keyframeNodes, SAM3_CHECKPOINT } from "./ltx-edit";
import {
  LTX23_MODELS,
  LTX_DISTILLED_SIGMAS,
  LTX_NEGATIVE,
  saveVideoNodes,
  sourceClipNodes,
  type Graph,
  type GraphLimits,
  type Link,
} from "./ltx-graph";

/**
 * Character recast on open weights, an experiment beside the shipped Kling 3.0
 * Omni path (./character-replace.ts). Every adapter is Lightricks' own; no
 * community LoRA is used. See docs/recast-ltx.md for the measured result.
 *
 * 1. FLUX.2 Klein recasts the take's first frame: the marked person becomes
 *    the Character from their references, in the same place and pose.
 * 2. LTX 2.5 carries that keyframe through the take. Lightricks' Union Control
 *    IC-LoRA (trained on 2.3; Lightricks' own 2.5 example loads it on the 2.5
 *    transformer) reads the source's Canny edges (ComfyUI core nodes, no
 *    detector weights), so the performance and timing are the take's. With `sheet`, Lightricks' Ingredients IC-LoRA also
 *    reads the Character's reference sheet, to hold the face and outfit after
 *    the first frame.
 * 3. SAM 3 follows the marked person in the take and the Character in the
 *    result from a frame-0 box, and only the union of those masks comes from
 *    the generation. Everyone else, the background and the audio keep the
 *    take's exact pixels and samples.
 */
export const LTX_RECAST_MODELS = {
  transformer: LTX_ALPHA_MODELS.transformer,
  textEncoder: LTX_ALPHA_MODELS.textEncoder,
  videoVae: LTX_ALPHA_MODELS.videoVae,
  audioVae: LTX_ALPHA_MODELS.audioVae,
  unionControl: LTX23_MODELS.unionControl,
  /** Lightricks' reference-sheet adapter; its 2.5 example also loads the 2.3 file. */
  ingredients: "ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors",
} as const;

export const LTX_RECAST_MODEL_ID = "comfy-cloud/ltx-2.5-recast";

export const LTX_RECAST_LIMITS: GraphLimits & { maxReferences: number } = {
  /** About four seconds at 24 or 25 fps; longer takes keep their first 97 frames. */
  maxFrames: 97,
  maxSide: 768,
  /** FLUX.2 Klein reads up to four images; the first is the frame itself. */
  maxReferences: 3,
};

/** Loader nodes the Cloud client fills. */
export const LTX_RECAST_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
  reference: (i: number) => ({ node: `reference_${i}`, field: "image" }),
  sheet: { node: "sheet", field: "image" },
} as const;

/** The composited recast, then the raw generation and the keyframe it started from. */
export const LTX_RECAST_OUTPUT_NODES = [
  "save_result",
  "save_generated",
  "save_keyframe",
] as const;

/** A box around the marked person on the first frame, as fractions of the frame. */
export interface TargetBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LtxRecastGraphOptions {
  /** The FLUX.2 Klein instruction for the first frame. */
  keyframePrompt: string;
  /** What LTX should see across the clip. */
  videoPrompt: string;
  /** Character references for the keyframe, after the frame itself. */
  references: number;
  /** Also condition on the Character's reference sheet (Ingredients IC-LoRA). */
  sheet: boolean;
  target: TargetBox;
  /** How strongly the clip follows the source's edges (its motion), 0.3–1. */
  poseStrength: number;
  seed: number;
}

/**
 * SAM 3 segments whatever fills the box on the first frame, then tracks that
 * one object through the clip. The box comes from the composer's pre-flight
 * person detection, so no coordinates are guessed from text.
 */
function trackNodes(id: string, frames: Link, box: Link): Graph {
  return {
    [`${id}_first`]: {
      class_type: "ImageFromBatch",
      inputs: { image: frames, batch_index: 0, length: 1 },
    },
    [`${id}_seed`]: {
      class_type: "SAM3_Detect",
      inputs: {
        model: ["sam3", 0],
        image: [`${id}_first`, 0],
        bboxes: box,
        threshold: 0.5,
        refine_iterations: 2,
        individual_masks: false,
      },
    },
    [`${id}_track`]: {
      class_type: "SAM3_VideoTrack",
      inputs: {
        images: frames,
        model: ["sam3", 0],
        initial_mask: [`${id}_seed`, 0],
        detection_threshold: 0.5,
        max_objects: 1,
        detect_interval: 1,
      },
    },
    [`${id}_masks`]: {
      class_type: "SAM3_TrackToMask",
      inputs: { track_data: [`${id}_track`, 0], object_indices: "" },
    },
  };
}

export function ltxRecastGraph(o: LtxRecastGraphOptions): Graph {
  const source = sourceClipNodes(LTX_RECAST_LIMITS);
  const keyframe = keyframeNodes(
    source.first,
    o.keyframePrompt,
    Math.min(o.references, LTX_RECAST_LIMITS.maxReferences),
    o.seed,
  );
  const vae: Link = ["video_vae", 0];
  const pixels = (
    side: "width" | "height",
    fraction: number,
  ): Graph[string] => ({
    class_type: "ComfyMathExpression",
    inputs: {
      expression: `max(1, round(a * ${fraction}))`,
      "values.a": side === "width" ? source.width : source.height,
    },
  });

  const graph: Graph = {
    ...source.nodes,
    ...keyframe.nodes,
    keyframe_fit: {
      class_type: "ImageScale",
      inputs: {
        image: keyframe.image,
        upscale_method: "lanczos",
        width: source.genWidth,
        height: source.genHeight,
        crop: "center",
      },
    },
    keyframe_prep: {
      class_type: "LTXVPreprocess",
      inputs: { image: ["keyframe_fit", 0], img_compression: 33 },
    },
    // Edges of the take, traced with ComfyUI's own blur and Canny nodes: no
    // detector weights. A light blur first keeps grain and fabric texture out
    // of the edge map. The marked person's own outline comes through too, so
    // the Character keeps the performer's silhouette; the composite puts
    // everything outside the mask back from the take.
    edges_fit: {
      class_type: "ImageScale",
      inputs: {
        image: source.small,
        upscale_method: "bilinear",
        width: source.genWidth,
        height: source.genHeight,
        crop: "disabled",
      },
    },
    edges_blur: {
      class_type: "ImageBlur",
      inputs: { image: ["edges_fit", 0], blur_radius: 2, sigma: 1 },
    },
    edges: {
      class_type: "Canny",
      inputs: {
        image: ["edges_blur", 0],
        low_threshold: 0.4,
        high_threshold: 0.8,
      },
    },

    unet: {
      class_type: "UNETLoader",
      inputs: {
        unet_name: LTX_RECAST_MODELS.transformer,
        weight_dtype: "default",
      },
    },
    union_control: {
      class_type: "LTXICLoRALoaderModelOnly",
      inputs: {
        model: ["unet", 0],
        lora_name: LTX_RECAST_MODELS.unionControl,
        strength_model: 1,
      },
    },
    text_encoder: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: LTX_RECAST_MODELS.textEncoder,
        type: "ltxv",
        device: "default",
      },
    },
    video_vae: {
      class_type: "VAELoader",
      inputs: { vae_name: LTX_RECAST_MODELS.videoVae },
    },
    audio_vae: {
      class_type: "VAELoader",
      inputs: { vae_name: LTX_RECAST_MODELS.audioVae },
    },
    positive_text: {
      class_type: "CLIPTextEncode",
      inputs: { text: o.videoPrompt, clip: ["text_encoder", 0] },
    },
    negative_text: {
      class_type: "CLIPTextEncode",
      inputs: { text: LTX_NEGATIVE, clip: ["text_encoder", 0] },
    },
    conditioning: {
      class_type: "LTXVConditioning",
      inputs: {
        positive: ["positive_text", 0],
        negative: ["negative_text", 0],
        frame_rate: source.fps,
      },
    },
    empty_video: {
      class_type: "EmptyLTXVLatentVideo",
      inputs: {
        width: source.genWidth,
        height: source.genHeight,
        length: source.length,
        batch_size: 1,
      },
    },
    first_frame: {
      class_type: "LTXVImgToVideoInplace",
      inputs: {
        vae,
        image: ["keyframe_prep", 0],
        latent: ["empty_video", 0],
        strength: 1,
        bypass: false,
      },
    },
    // The ref0.5 adapter reads its guide at half size; the loader reports the factor.
    motion_guide: {
      class_type: "LTXAddVideoICLoRAGuide",
      inputs: {
        positive: ["conditioning", 0],
        negative: ["conditioning", 1],
        vae,
        latent: ["first_frame", 0],
        image: ["edges", 0],
        frame_idx: 0,
        strength: o.poseStrength,
        latent_downscale_factor: ["union_control", 1],
        crop: "disabled",
        use_tiled_encode: false,
        tile_size: 256,
        tile_overlap: 64,
      },
    },
  };

  let model: Link = ["union_control", 0];
  let guided = "motion_guide";
  if (o.sheet) {
    Object.assign(graph, {
      ingredients: {
        class_type: "LTXICLoRALoaderModelOnly",
        inputs: {
          model,
          lora_name: LTX_RECAST_MODELS.ingredients,
          strength_model: 1,
        },
      },
      sheet: { class_type: "LoadImage", inputs: { image: "" } },
      sheet_scaled: {
        class_type: "ImageScaleToTotalPixels",
        inputs: {
          image: ["sheet", 0],
          upscale_method: "lanczos",
          megapixels: 0.5,
          resolution_steps: 32,
        },
      },
      // -1 keeps the still sheet outside the clip's frame range, attended to
      // but never shown, so it does not compete with the edge guide at 0.
      sheet_guide: {
        class_type: "LTXAddVideoICLoRAGuide",
        inputs: {
          positive: ["motion_guide", 0],
          negative: ["motion_guide", 1],
          vae,
          latent: ["motion_guide", 2],
          image: ["sheet_scaled", 0],
          frame_idx: -1,
          strength: 1,
          latent_downscale_factor: ["ingredients", 1],
          crop: "disabled",
          use_tiled_encode: false,
          tile_size: 256,
          tile_overlap: 64,
        },
      },
    } satisfies Graph);
    model = ["ingredients", 0];
    guided = "sheet_guide";
  }

  Object.assign(graph, {
    empty_audio: {
      class_type: "LTXVEmptyLatentAudio",
      inputs: {
        frames_number: source.length,
        frame_rate: source.fps,
        batch_size: 1,
        audio_vae: ["audio_vae", 0],
      },
    },
    av_latent: {
      class_type: "LTXVConcatAVLatent",
      inputs: {
        video_latent: [guided, 2],
        audio_latent: ["empty_audio", 0],
      },
    },
    noise: { class_type: "RandomNoise", inputs: { noise_seed: o.seed } },
    guider: {
      class_type: "CFGGuider",
      inputs: { model, positive: [guided, 0], negative: [guided, 1], cfg: 1 },
    },
    sampler: {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler_ancestral" },
    },
    sigmas: {
      class_type: "ManualSigmas",
      inputs: { sigmas: LTX_DISTILLED_SIGMAS },
    },
    sample: {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["noise", 0],
        guider: ["guider", 0],
        sampler: ["sampler", 0],
        sigmas: ["sigmas", 0],
        latent_image: ["av_latent", 0],
      },
    },
    separate: {
      class_type: "LTXVSeparateAVLatent",
      inputs: { av_latent: ["sample", 0] },
    },
    crop_guides: {
      class_type: "LTXVCropGuides",
      inputs: {
        positive: [guided, 0],
        negative: [guided, 1],
        latent: ["separate", 0],
      },
    },
    decode: {
      class_type: "VAEDecodeTiled",
      inputs: {
        samples: ["crop_guides", 2],
        vae,
        tile_size: 512,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 8,
      },
    },
    generated_full: {
      class_type: "ImageScale",
      inputs: {
        image: ["decode", 0],
        upscale_method: "lanczos",
        width: source.width,
        height: source.height,
        crop: "disabled",
      },
    },

    sam3: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: SAM3_CHECKPOINT },
    },
    target_x: pixels("width", o.target.x),
    target_y: pixels("height", o.target.y),
    target_w: pixels("width", o.target.width),
    target_h: pixels("height", o.target.height),
    target_box: {
      class_type: "PrimitiveBoundingBox",
      inputs: {
        x: ["target_x", 1],
        y: ["target_y", 1],
        width: ["target_w", 1],
        height: ["target_h", 1],
      },
    },
    ...trackNodes("mask_source", source.clip, ["target_box", 0]),
    ...trackNodes("mask_result", ["generated_full", 0], ["target_box", 0]),
    mask_union: {
      class_type: "MaskComposite",
      inputs: {
        destination: ["mask_source_masks", 0],
        source: ["mask_result_masks", 0],
        x: 0,
        y: 0,
        operation: "or",
      },
    },
    mask: {
      class_type: "GrowMask",
      inputs: { mask: ["mask_union", 0], expand: 12, tapered_corners: true },
    },
    composite: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: source.clip,
        source: ["generated_full", 0],
        x: 0,
        y: 0,
        resize_source: false,
        mask: ["mask", 0],
      },
    },
    ...saveVideoNodes(
      "save_result",
      ["composite", 0],
      source.fps,
      source.audio,
      "recast",
    ),
    ...saveVideoNodes(
      "save_generated",
      ["generated_full", 0],
      source.fps,
      null,
      "recast_generated",
    ),
    save_keyframe: {
      class_type: "SaveImage",
      inputs: {
        images: keyframe.image,
        filename_prefix: "open_cinema/recast_keyframe",
      },
    },
  } satisfies Graph);
  return graph;
}

export interface LtxRecastPromptOptions {
  /** The creator's words for who is replaced, plus the side of the frame. */
  target: string;
  name: string;
  /** The Character's look: face, hair, build. */
  identity: string;
  /** What they wear (the reference outfit). */
  wardrobe: string;
  /** What happens in the take, in neutral words. */
  action: string;
  /** Character references for the keyframe, after the frame itself. */
  references: number;
  sheet: boolean;
}

const clean = (text: string) => text.trim().replace(/[.\s]+$/, "");

/**
 * The keyframe instruction (FLUX.2 Klein; the frame is the first image) and
 * the clip prompt (LTX 2.5). With a sheet the clip prompt opens with the
 * Ingredients adapter's own two-part layout.
 */
export function ltxRecastPrompts(o: LtxRecastPromptOptions) {
  const refs = ["second", "third", "fourth"]
    .slice(0, Math.max(1, Math.min(o.references, 3)))
    .map((n) => `the ${n} image`);
  const images =
    refs.length === 1
      ? refs[0]!
      : `${refs.slice(0, -1).join(", ")} and ${refs.at(-1)!}`;
  const person = `${clean(o.identity)}, wearing ${clean(o.wardrobe)}`;
  const keyframePrompt = [
    `In the first image, replace ${clean(o.target)} with ${o.name}, the person shown in ${images}: ${person}.`,
    `Keep their exact position, scale, pose, body angle, head direction, gesture, gaze and expression from the first image, lit by the scene's own light.`,
    "Change nothing else: every other person, every object, the background and the framing stay exactly as they are.",
  ].join(" ");
  const shot = [
    `The same shot as the first frame. ${o.name}, ${person}, ${clean(o.action)}.`,
    `${o.name}'s face, hair and clothing stay the same in every frame. Everyone else and the camera move exactly as before. Photorealistic, natural motion.`,
  ].join(" ");
  const videoPrompt = o.sheet
    ? [
        "### Reference Sheet Description",
        `**Character:** ${o.name}, ${person}, shown from the front, three-quarter and side, with close-ups of the face.`,
        "### Target Description",
        shot,
      ].join("\n")
    : shot;
  return { keyframePrompt, videoPrompt };
}
