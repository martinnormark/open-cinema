/**
 * LTX 2.5 Alpha Gen background replacement, run as a ComfyUI graph on Comfy
 * Cloud. Router's LTX models are text-to-video only and take no LoRA, so the
 * Alpha Gen IC-LoRA has to run on the open LTX-2.5 22B weights.
 *
 * One graph does the whole replacement: the IC-LoRA reads the source clip (with
 * an empty prompt, as the model card requires) and generates a frame-aligned
 * grayscale matte; the matte is scaled back to the source size and the source
 * frames are composited over the new background:
 *
 *   out = source * alpha + background * (1 - alpha)
 *
 * The source pixels are never regenerated, so faces, wardrobe, props held by
 * the subject, timing and audio are exactly the take's. The background is a
 * still plate (a Location reference) or a clip, e.g. an LTX 2.5 generated plate.
 *
 * Adapted from Lightricks' LTX-2.5_V2V_ICLoRA_Single_Stage_Distilled workflow
 * (https://github.com/Lightricks/ComfyUI-LTXVideo/tree/master/example_workflows/2.5)
 * with the prompt enhancer, first-frame conditioning and source-audio tokens
 * removed. See https://docs.ltx.io/open-source-model/vfx-post-production/alpha-gen.
 */

export const LTX_ALPHA_MODELS = {
  transformer: "ltx-2.5-22b-distilled-transformer-bf16.safetensors",
  textEncoder: "gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
  videoVae: "ltx-2.5-video-vae-bf16.safetensors",
  audioVae: "ltx-2.5-audio-vae-bf16.safetensors",
  alphaGenLora: "ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors",
} as const;

/** The pipeline's id in job records; Comfy Cloud runs it, not Router. */
export const LTX_ALPHA_MODEL_ID = "comfy-cloud/ltx-2.5-alpha-gen";

export const LTX_ALPHA_LIMITS = {
  /**
   * The model card's reliable range is 121 frames (8n+1); longer takes are
   * trimmed to the first 121 frames rather than chunked.
   */
  maxFrames: 121,
  /**
   * The matte is generated at most this long on its longer side, then scaled to
   * the source size for the composite. A soft matte survives the upscale, and
   * 960 px keeps a 5 s run well inside one Cloud GPU's memory and budget.
   */
  maxSide: 960,
  /** Source bytes the Worker downloads and re-uploads to Cloud. */
  maxSourceBytes: 100 * 1024 * 1024,
} as const;

/** The distilled model's eight-step schedule from the Lightricks workflow. */
const DISTILLED_SIGMAS =
  "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0";

/** API-graph node ids whose file inputs are filled with uploaded media at submission. */
export const LTX_ALPHA_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
  backgroundImage: { node: "background_image", field: "image" },
  backgroundVideo: { node: "background_video", field: "file" },
} as const;

/** SaveVideo nodes, in the order outputs are presented: composite first. */
export const LTX_ALPHA_OUTPUT_NODES = ["save_composite", "save_matte"] as const;

export interface LtxAlphaGraphOptions {
  background: "image" | "video";
  seed: number;
}

type Link = [string, number];
type Graph = Record<
  string,
  {
    class_type: string;
    inputs: Record<string, unknown>;
    _meta?: { title: string };
  }
>;

/**
 * The API-format graph. File inputs are left empty; the Cloud client sets them
 * to uploaded assets named by LTX_ALPHA_MEDIA_INPUTS.
 */
export function ltxAlphaBackgroundGraph(options: LtxAlphaGraphOptions): Graph {
  const frames: Link = ["source_frames", 0];
  const audio: Link = ["source_frames", 1];
  const fps: Link = ["source_frames", 2];
  const width: Link = ["source_size", 0];
  const height: Link = ["source_size", 1];
  const length: Link = ["frame_count", 1];
  const plate: Link =
    options.background === "image"
      ? ["background_repeat", 0]
      : ["background_trim", 0];

  const graph: Graph = {
    source: { class_type: "LoadVideo", inputs: { file: "" } },
    source_frames: {
      class_type: "GetVideoComponents",
      inputs: { video: ["source", 0] },
    },
    source_size: { class_type: "GetImageSize", inputs: { image: frames } },
    // Alpha Gen needs 8n+1 frames; take the longest such run within the limit.
    frame_count: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: `max(1, ((min(a, ${LTX_ALPHA_LIMITS.maxFrames}) - 1) // 8) * 8 + 1)`,
        "values.a": ["source_size", 2],
      },
    },
    // Matte size: the source scaled to fit maxSide, both sides multiples of 32.
    matte_width: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: `max(64, round(a * min(1, ${LTX_ALPHA_LIMITS.maxSide} / max(a, b)) / 32) * 32)`,
        "values.a": width,
        "values.b": height,
      },
    },
    matte_height: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: `max(64, round(b * min(1, ${LTX_ALPHA_LIMITS.maxSide} / max(a, b)) / 32) * 32)`,
        "values.a": width,
        "values.b": height,
      },
    },
    clip: {
      class_type: "ImageFromBatch",
      inputs: { image: frames, batch_index: 0, length },
    },

    unet: {
      class_type: "UNETLoader",
      inputs: {
        unet_name: LTX_ALPHA_MODELS.transformer,
        weight_dtype: "default",
      },
    },
    alpha_gen: {
      class_type: "LTXICLoRALoaderModelOnly",
      inputs: {
        model: ["unet", 0],
        lora_name: LTX_ALPHA_MODELS.alphaGenLora,
        strength_model: 1,
      },
    },
    text_encoder: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: LTX_ALPHA_MODELS.textEncoder,
        type: "ltxv",
        device: "default",
      },
    },
    video_vae: {
      class_type: "VAELoader",
      inputs: { vae_name: LTX_ALPHA_MODELS.videoVae },
    },
    audio_vae: {
      class_type: "VAELoader",
      inputs: { vae_name: LTX_ALPHA_MODELS.audioVae },
    },
    // The adapter was trained with an empty prompt; text does not steer it.
    positive_text: {
      class_type: "CLIPTextEncode",
      inputs: { text: "", clip: ["text_encoder", 0] },
    },
    negative_text: {
      class_type: "CLIPTextEncode",
      inputs: { text: "", clip: ["text_encoder", 0] },
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
      inputs: {
        width: ["matte_width", 1],
        height: ["matte_height", 1],
        length,
        batch_size: 1,
      },
    },
    guide: {
      class_type: "LTXAddVideoICLoRAGuide",
      inputs: {
        positive: ["conditioning", 0],
        negative: ["conditioning", 1],
        vae: ["video_vae", 0],
        latent: ["empty_video", 0],
        image: ["clip", 0],
        frame_idx: 0,
        strength: 1,
        latent_downscale_factor: ["alpha_gen", 1],
        crop: "disabled",
        use_tiled_encode: false,
        tile_size: 256,
        tile_overlap: 64,
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
    noise: {
      class_type: "RandomNoise",
      inputs: { noise_seed: options.seed },
    },
    guider: {
      class_type: "CFGGuider",
      inputs: {
        model: ["alpha_gen", 0],
        positive: ["guide", 0],
        negative: ["guide", 1],
        cfg: 1,
      },
    },
    sampler: {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler_ancestral" },
    },
    sigmas: {
      class_type: "ManualSigmas",
      inputs: { sigmas: DISTILLED_SIGMAS },
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
        positive: ["guide", 0],
        negative: ["guide", 1],
        latent: ["separate", 0],
      },
    },
    decode: {
      class_type: "VAEDecodeTiled",
      inputs: {
        samples: ["crop_guides", 2],
        vae: ["video_vae", 0],
        tile_size: 512,
        overlap: 64,
        temporal_size: 64,
        temporal_overlap: 8,
      },
    },
    matte: {
      class_type: "ImageScale",
      inputs: {
        image: ["decode", 0],
        upscale_method: "bilinear",
        width,
        height,
        crop: "disabled",
      },
    },
    mask: {
      class_type: "ImageToMask",
      inputs: { image: ["matte", 0], channel: "red" },
    },
    composite: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: plate,
        source: ["clip", 0],
        x: 0,
        y: 0,
        resize_source: false,
        mask: ["mask", 0],
      },
    },
    composite_video: {
      class_type: "CreateVideo",
      inputs: { images: ["composite", 0], fps, audio },
    },
    save_composite: {
      class_type: "SaveVideo",
      inputs: {
        video: ["composite_video", 0],
        filename_prefix: "open_cinema/alpha_composite",
        format: "mp4",
        "format.codec": "h264",
      },
      _meta: { title: "Composite" },
    },
    matte_video: {
      class_type: "CreateVideo",
      inputs: { images: ["matte", 0], fps },
    },
    save_matte: {
      class_type: "SaveVideo",
      inputs: {
        video: ["matte_video", 0],
        filename_prefix: "open_cinema/alpha_matte",
        format: "mp4",
        "format.codec": "h264",
      },
      _meta: { title: "Matte" },
    },
  };

  if (options.background === "image") {
    graph.background_image = {
      class_type: "LoadImage",
      inputs: { image: "" },
    };
    graph.background_fit = {
      class_type: "ImageScale",
      inputs: {
        image: ["background_image", 0],
        upscale_method: "lanczos",
        width,
        height,
        crop: "center",
      },
    };
    graph.background_repeat = {
      class_type: "RepeatImageBatch",
      inputs: { image: ["background_fit", 0], amount: length },
    };
  } else {
    graph.background_video = { class_type: "LoadVideo", inputs: { file: "" } };
    graph.background_frames = {
      class_type: "GetVideoComponents",
      inputs: { video: ["background_video", 0] },
    };
    graph.background_fit = {
      class_type: "ImageScale",
      inputs: {
        image: ["background_frames", 0],
        upscale_method: "lanczos",
        width,
        height,
        crop: "center",
      },
    };
    graph.background_size = {
      class_type: "GetImageSize",
      inputs: { image: ["background_fit", 0] },
    };
    // A plate shorter than the take loops rather than freezing on its last frame.
    graph.background_loops = {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: "ceil(a / b)",
        "values.a": length,
        "values.b": ["background_size", 2],
      },
    };
    graph.background_repeat = {
      class_type: "RepeatImageBatch",
      inputs: { image: ["background_fit", 0], amount: ["background_loops", 1] },
    };
    graph.background_trim = {
      class_type: "ImageFromBatch",
      inputs: { image: ["background_repeat", 0], batch_index: 0, length },
    };
  }
  return graph;
}

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Upload name for a loader input; LoadVideo and LoadImage read the format from it. */
export function mediaFilename(role: string, mediaType: string): string {
  return `${role}.${EXTENSIONS[mediaType] ?? "bin"}`;
}

/** A stable seed per job, so a rebuilt request after a lost receipt is identical. */
export function seedFrom(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
