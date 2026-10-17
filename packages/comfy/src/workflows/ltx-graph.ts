/**
 * Shared pieces of the open-weights LTX graphs that run on Comfy Cloud:
 * camera moves (./ltx-camera.ts) and the keyframe edits behind Object Swap and Restyle (./ltx-edit.ts).
 *
 * Every graph reads its media through named loader nodes and saves its result
 * through named SaveVideo / SaveImage nodes, so the same graph runs through the
 * Cloud job client (assets set on the loaders) and through ComfyUI's own
 * upload-and-prompt routes (file names set on the loaders).
 */

export type Link = [string, number];
export interface GraphNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
}
export type Graph = Record<string, GraphNode>;

/** Open weights in the Comfy Cloud model library, checked 2026-10-17. */
export const LTX2_MODELS = {
  /** LTX-2 19B, the base the Lightricks camera-control LoRAs were trained on. */
  checkpoint: "ltx-2-19b-distilled-fp8.safetensors",
  textEncoder: "gemma_3_12B_it_fp4_mixed.safetensors",
} as const;
export const LTX23_MODELS = {
  checkpoint: "ltx-2.3-22b-distilled-fp8.safetensors",
  textEncoder: "gemma_3_12B_it_fp4_mixed.safetensors",
  /** Lightricks' union IC-LoRA: depth, pose or edges, references at half size. */
  unionControl: "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors",
} as const;
export const FLUX2_KLEIN_MODELS = {
  unet: "flux-2-klein-9b.safetensors",
  textEncoder: "qwen_3_8b_fp8mixed.safetensors",
  vae: "flux2-vae.safetensors",
} as const;

/** The distilled models' eight-step schedule from Lightricks' workflows. */
export const LTX_DISTILLED_SIGMAS =
  "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0";

/** Ends with the lens mask a camera-hardware prompt once drew (see LTX_FRAME_ARTEFACT). */
export const LTX_NEGATIVE =
  "blurry, out of focus, overexposed, underexposed, low contrast, washed out colors, excessive noise, flickering, distorted proportions, deformed facial features, extra limbs, disfigured hands, watermark, logo, subtitles, text overlay, vignette, dark corners, circular frame, keyhole mask, fisheye";

export interface GraphLimits {
  /** Longest generated clip in frames (8n+1). */
  maxFrames: number;
  /** Generated size on the longer side; both sides become multiples of 32. */
  maxSide: number;
}

/** LTX takes 8n+1 frames: the longest such run within `max`. */
export function ltxFrameCount(frames: number, max: number) {
  const capped = Math.max(1, Math.min(frames, max));
  return Math.floor((capped - 1) / 8) * 8 + 1;
}

/** A width and height within `maxSide` that keep the aspect, multiples of 32. */
export function ltxSize(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const round = (n: number) => Math.max(64, Math.round((n * scale) / 32) * 32);
  return { width: round(width), height: round(height) };
}

/**
 * Loads the source clip and derives the generation grid from it: the clip
 * trimmed to 8n+1 frames, scaled to fit `maxSide`, with its frame rate and
 * audio. Node ids are prefixed `source_`.
 */
export function sourceClipNodes(limits: GraphLimits) {
  const frames: Link = ["source_frames", 0];
  const width: Link = ["source_size", 0];
  const height: Link = ["source_size", 1];
  const nodes: Graph = {
    source: { class_type: "LoadVideo", inputs: { file: "" } },
    source_frames: {
      class_type: "GetVideoComponents",
      inputs: { video: ["source", 0] },
    },
    source_size: { class_type: "GetImageSize", inputs: { image: frames } },
    source_length: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: `max(1, ((min(a, ${limits.maxFrames}) - 1) // 8) * 8 + 1)`,
        "values.a": ["source_size", 2],
      },
    },
    source_gen_width: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: `max(64, round(a * min(1, ${limits.maxSide} / max(a, b)) / 32) * 32)`,
        "values.a": width,
        "values.b": height,
      },
    },
    source_gen_height: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: `max(64, round(b * min(1, ${limits.maxSide} / max(a, b)) / 32) * 32)`,
        "values.a": width,
        "values.b": height,
      },
    },
    source_clip: {
      class_type: "ImageFromBatch",
      inputs: { image: frames, batch_index: 0, length: ["source_length", 1] },
    },
    source_small: {
      class_type: "ImageScale",
      inputs: {
        image: ["source_clip", 0],
        upscale_method: "bilinear",
        width: ["source_gen_width", 1],
        height: ["source_gen_height", 1],
        crop: "disabled",
      },
    },
    source_first: {
      class_type: "ImageFromBatch",
      inputs: { image: ["source_clip", 0], batch_index: 0, length: 1 },
    },
  };
  return {
    nodes,
    clip: ["source_clip", 0] as Link,
    small: ["source_small", 0] as Link,
    first: ["source_first", 0] as Link,
    audio: ["source_frames", 1] as Link,
    fps: ["source_frames", 2] as Link,
    width,
    height,
    length: ["source_length", 1] as Link,
    genWidth: ["source_gen_width", 1] as Link,
    genHeight: ["source_gen_height", 1] as Link,
  };
}

export interface LtxSamplerOptions {
  /** Node id prefix. */
  id: string;
  checkpoint: string;
  textEncoder: string;
  /** LoRAs applied in order; an IC-LoRA's parameters feed `guide`. */
  loras: readonly { name: string; strength: number }[];
  prompt: string;
  negative?: string;
  width: Link | number;
  height: Link | number;
  length: Link | number;
  fps: Link | number;
  seed: number;
  /** Conditions the first frame on this image (image-to-video). */
  firstFrame?: { image: Link; strength: number } | undefined;
  /** An IC-LoRA guide clip, aligned with the output from frame 0. */
  guide?: { image: Link; strength: number } | undefined;
}

/**
 * One distilled LTX pass: checkpoint, LoRAs, prompt, optional first frame and
 * IC-LoRA guide, eight steps, decoded video frames and audio. Returns the
 * links to the frames and the generated audio.
 */
export function ltxSamplerNodes(o: LtxSamplerOptions) {
  const n = (name: string) => `${o.id}_${name}`;
  const nodes: Graph = {
    [n("ckpt")]: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: o.checkpoint },
    },
    [n("text_encoder")]: {
      class_type: "LTXAVTextEncoderLoader",
      inputs: {
        text_encoder: o.textEncoder,
        ckpt_name: o.checkpoint,
        device: "default",
      },
    },
    [n("audio_vae")]: {
      class_type: "LTXVAudioVAELoader",
      inputs: { ckpt_name: o.checkpoint },
    },
  };
  let model: Link = [n("ckpt"), 0];
  o.loras.forEach((lora, i) => {
    nodes[n(`lora_${i}`)] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model, lora_name: lora.name, strength_model: lora.strength },
    };
    model = [n(`lora_${i}`), 0];
  });
  const vae: Link = [n("ckpt"), 2];
  Object.assign(nodes, {
    [n("positive")]: {
      class_type: "CLIPTextEncode",
      inputs: { text: o.prompt, clip: [n("text_encoder"), 0] },
    },
    [n("negative")]: {
      class_type: "CLIPTextEncode",
      inputs: {
        text: o.negative ?? LTX_NEGATIVE,
        clip: [n("text_encoder"), 0],
      },
    },
    [n("conditioning")]: {
      class_type: "LTXVConditioning",
      inputs: {
        positive: [n("positive"), 0],
        negative: [n("negative"), 0],
        frame_rate: o.fps,
      },
    },
    [n("empty")]: {
      class_type: "EmptyLTXVLatentVideo",
      inputs: {
        width: o.width,
        height: o.height,
        length: o.length,
        batch_size: 1,
      },
    },
  } satisfies Graph);
  let latent: Link = [n("empty"), 0];
  if (o.firstFrame) {
    nodes[n("first_prep")] = {
      class_type: "LTXVPreprocess",
      inputs: { image: o.firstFrame.image, img_compression: 33 },
    };
    nodes[n("first_frame")] = {
      class_type: "LTXVImgToVideoInplace",
      inputs: {
        vae,
        image: [n("first_prep"), 0],
        latent,
        strength: o.firstFrame.strength,
        bypass: false,
      },
    };
    latent = [n("first_frame"), 0];
  }
  let positive: Link = [n("conditioning"), 0];
  let negative: Link = [n("conditioning"), 1];
  if (o.guide) {
    nodes[n("ic_params")] = {
      class_type: "GetICLoRAParameters",
      inputs: { iclora_model: model },
    };
    nodes[n("guide")] = {
      class_type: "LTXVAddGuide",
      inputs: {
        positive,
        negative,
        vae,
        latent,
        image: o.guide.image,
        frame_idx: 0,
        strength: o.guide.strength,
        iclora_parameters: [n("ic_params"), 0],
      },
    };
    positive = [n("guide"), 0];
    negative = [n("guide"), 1];
    latent = [n("guide"), 2];
  }
  Object.assign(nodes, {
    [n("empty_audio")]: {
      class_type: "LTXVEmptyLatentAudio",
      inputs: {
        frames_number: o.length,
        frame_rate: o.fps,
        batch_size: 1,
        audio_vae: [n("audio_vae"), 0],
      },
    },
    [n("av")]: {
      class_type: "LTXVConcatAVLatent",
      inputs: { video_latent: latent, audio_latent: [n("empty_audio"), 0] },
    },
    [n("noise")]: { class_type: "RandomNoise", inputs: { noise_seed: o.seed } },
    [n("guider")]: {
      class_type: "CFGGuider",
      inputs: { model, positive, negative, cfg: 1 },
    },
    [n("sampler")]: {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler_ancestral" },
    },
    [n("sigmas")]: {
      class_type: "ManualSigmas",
      inputs: { sigmas: LTX_DISTILLED_SIGMAS },
    },
    [n("sample")]: {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: [n("noise"), 0],
        guider: [n("guider"), 0],
        sampler: [n("sampler"), 0],
        sigmas: [n("sigmas"), 0],
        latent_image: [n("av"), 0],
      },
    },
    [n("separate")]: {
      class_type: "LTXVSeparateAVLatent",
      inputs: { av_latent: [n("sample"), 0] },
    },
    [n("crop")]: {
      class_type: "LTXVCropGuides",
      inputs: { positive, negative, latent: [n("separate"), 0] },
    },
    [n("decode")]: {
      class_type: "VAEDecodeTiled",
      inputs: {
        samples: [n("crop"), 2],
        vae,
        tile_size: 512,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 8,
      },
    },
    [n("audio")]: {
      class_type: "LTXVAudioVAEDecode",
      inputs: { samples: [n("separate"), 1], audio_vae: [n("audio_vae"), 0] },
    },
  } satisfies Graph);
  return {
    nodes,
    frames: [n("decode"), 0] as Link,
    audio: [n("audio"), 0] as Link,
  };
}

/** Frames and audio into one H.264 MP4 saved by node `id`. */
export function saveVideoNodes(
  id: string,
  frames: Link,
  fps: Link | number,
  audio: Link | null,
  prefix: string,
): Graph {
  return {
    [`${id}_video`]: {
      class_type: "CreateVideo",
      inputs: { images: frames, fps, ...(audio ? { audio } : {}) },
    },
    [id]: {
      class_type: "SaveVideo",
      inputs: {
        video: [`${id}_video`, 0],
        filename_prefix: `open_cinema/${prefix}`,
        format: "mp4",
        "format.codec": "h264",
      },
    },
  };
}
