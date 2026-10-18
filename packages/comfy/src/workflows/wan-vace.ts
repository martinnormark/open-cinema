import {
  saveVideoNodes,
  sourceClipNodes,
  type Graph,
  type GraphLimits,
  type Link,
} from "./ltx-graph";

/**
 * Wan 2.1 VACE inpainting for "Fix an area" when the creator asks for
 * something new there: LTX's In-Outpainting IC-LoRA clears an area cleanly
 * but ignores what it is asked to add, and VACE draws it.
 *
 * Follows Comfy-Org's video_wan_vace_inpainting template with a brushed mask
 * in place of SAM3 and without the template's CausVid speed LoRA, whose
 * licence is non-commercial: 20 steps at CFG 6. The brushed area is filled
 * grey in the control video, the mask is held over every frame, and a
 * Thing's lead view, when given, is VACE's reference image. As with the LTX
 * fill, the take's own pixels are put back outside a soft-edged mask.
 */
export const WAN_VACE_MODEL_ID = "comfy-cloud/wan-2.1-vace";

export const WAN_VACE_MODELS = {
  unet: "wan2.1_vace_14B_fp16.safetensors",
  textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  vae: "wan_2.1_vae.safetensors",
} as const;

/** Wan 2.1 was trained on 81 frames at 832 × 480. */
export const WAN_VACE_LIMITS: GraphLimits = { maxFrames: 81, maxSide: 832 };

export const WAN_VACE_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
  mask: { node: "mask", field: "image" },
  reference: { node: "reference", field: "image" },
} as const;
export const WAN_VACE_OUTPUT_NODES = ["save_result"] as const;

/** The template's negative prompt, which Wan was tuned with. */
const WAN_NEGATIVE =
  "过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

export interface WanAreaGraphOptions {
  prompt: string;
  seed: number;
  /** Whether a reference image is uploaded to the `reference` node. */
  reference: boolean;
  /** Fewer frames for a cheap check run; never set by the app. */
  limits?: GraphLimits;
}

export function wanAreaGraph(o: WanAreaGraphOptions): Graph {
  const source = sourceClipNodes(o.limits ?? WAN_VACE_LIMITS);
  const size = { width: source.genWidth, height: source.genHeight };
  const mask: Link = ["mask_held", 0];
  const graph: Graph = {
    ...source.nodes,
    mask: { class_type: "LoadImage", inputs: { image: "" } },
    mask_small: {
      class_type: "ImageScale",
      inputs: {
        image: ["mask", 0],
        upscale_method: "area",
        ...size,
        crop: "disabled",
      },
    },
    // A single-frame mask covers only the first frame; hold it for all.
    mask_frames: {
      class_type: "RepeatImageBatch",
      inputs: { image: ["mask_small", 0], amount: source.length },
    },
    mask_channel: {
      class_type: "ImageToMask",
      inputs: { image: ["mask_frames", 0], channel: "red" },
    },
    mask_held: {
      class_type: "GrowMask",
      inputs: { mask: ["mask_channel", 0], expand: 20, tapered_corners: true },
    },
    grey: {
      class_type: "EmptyImage",
      inputs: { ...size, batch_size: 1, color: 0x7f7f7f },
    },
    control: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: source.small,
        source: ["grey", 0],
        x: 0,
        y: 0,
        resize_source: true,
        mask,
      },
    },
    wan_unet: {
      class_type: "UNETLoader",
      inputs: {
        unet_name: WAN_VACE_MODELS.unet,
        weight_dtype: "fp8_e4m3fn_fast",
      },
    },
    wan_model: {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["wan_unet", 0], shift: 5 },
    },
    wan_clip: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: WAN_VACE_MODELS.textEncoder,
        type: "wan",
        device: "default",
      },
    },
    wan_vae: {
      class_type: "VAELoader",
      inputs: { vae_name: WAN_VACE_MODELS.vae },
    },
    wan_positive: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["wan_clip", 0], text: o.prompt.trim() },
    },
    wan_negative: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["wan_clip", 0], text: WAN_NEGATIVE },
    },
    ...(o.reference
      ? {
          reference: { class_type: "LoadImage", inputs: { image: "" } },
          // Fitted onto a white frame, so a tall Thing is not cropped.
          reference_white: {
            class_type: "EmptyImage",
            inputs: { ...size, batch_size: 1, color: 0xffffff },
          },
          reference_fit: {
            class_type: "ImageScale",
            inputs: {
              image: ["reference", 0],
              upscale_method: "area",
              width: source.genHeight,
              height: source.genHeight,
              crop: "center",
            },
          },
          reference_x: {
            class_type: "ComfyMathExpression",
            inputs: {
              expression: "max(0, (a - b) // 2)",
              "values.a": source.genWidth,
              "values.b": source.genHeight,
            },
          },
          reference_frame: {
            class_type: "ImageCompositeMasked",
            inputs: {
              destination: ["reference_white", 0],
              source: ["reference_fit", 0],
              x: ["reference_x", 1],
              y: 0,
              resize_source: false,
            },
          },
        }
      : {}),
    wan_vace: {
      class_type: "WanVaceToVideo",
      inputs: {
        positive: ["wan_positive", 0],
        negative: ["wan_negative", 0],
        vae: ["wan_vae", 0],
        ...size,
        length: source.length,
        batch_size: 1,
        strength: 1,
        control_video: ["control", 0],
        control_masks: mask,
        ...(o.reference ? { reference_image: ["reference_frame", 0] } : {}),
      },
    },
    wan_sampler: {
      class_type: "KSampler",
      inputs: {
        model: ["wan_model", 0],
        positive: ["wan_vace", 0],
        negative: ["wan_vace", 1],
        latent_image: ["wan_vace", 2],
        seed: o.seed,
        steps: 20,
        cfg: 6,
        sampler_name: "uni_pc",
        scheduler: "simple",
        denoise: 1,
      },
    },
    // The reference image's latent frame leads the batch; drop it.
    wan_trim: {
      class_type: "TrimVideoLatent",
      inputs: { samples: ["wan_sampler", 0], trim_amount: ["wan_vace", 3] },
    },
    wan_frames: {
      class_type: "VAEDecode",
      inputs: { samples: ["wan_trim", 0], vae: ["wan_vae", 0] },
    },
    generated_full: {
      class_type: "ImageScale",
      inputs: {
        image: ["wan_frames", 0],
        upscale_method: "lanczos",
        width: source.width,
        height: source.height,
        crop: "disabled",
      },
    },
    mask_full: {
      class_type: "ImageScale",
      inputs: {
        image: ["mask", 0],
        upscale_method: "bilinear",
        width: source.width,
        height: source.height,
        crop: "disabled",
      },
    },
    mask_full_channel: {
      class_type: "ImageToMask",
      inputs: { image: ["mask_full", 0], channel: "red" },
    },
    mask_full_grown: {
      class_type: "GrowMask",
      inputs: {
        mask: ["mask_full_channel", 0],
        expand: 16,
        tapered_corners: true,
      },
    },
    mask_full_image: {
      class_type: "MaskToImage",
      inputs: { mask: ["mask_full_grown", 0] },
    },
    mask_full_soft: {
      class_type: "ImageBlur",
      inputs: { image: ["mask_full_image", 0], blur_radius: 12, sigma: 6 },
    },
    mask_blend: {
      class_type: "ImageToMask",
      inputs: { image: ["mask_full_soft", 0], channel: "red" },
    },
    result: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: source.clip,
        source: ["generated_full", 0],
        x: 0,
        y: 0,
        resize_source: false,
        mask: ["mask_blend", 0],
      },
    },
    ...saveVideoNodes(
      "save_result",
      ["result", 0],
      source.fps,
      source.audio,
      "fill_area_wan",
    ),
  };
  return graph;
}
