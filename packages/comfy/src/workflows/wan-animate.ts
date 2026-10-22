/**
 * "Copy the moves" on open weights: Wan Animate 2, run as a ComfyUI graph on
 * Comfy Cloud. A clip (a dance, a gesture, a stunt) supplies only motion; the
 * creator's Character performs it.
 *
 * 1. The chosen stretch of the clip is cut out (`Video Slice`) and resampled
 *    to a fixed frame grid, so the graph knows its length when it is built.
 * 2. FLUX 3 Klein redraws the stretch's first frame with the Character in the
 *    performer's place, at the same pose, position and size, in the same place
 *    or a new one. A plain full-body reference made Wan frame the Character
 *    close and cropped (docs/moving-scenes.md); a keyframe composed like the
 *    shot fixes that.
 * 3. Wan Animate 2 animates that keyframe with the clip's motion, window by
 *    window (81 frames each, one frame of overlap), as in Comfy-Org's
 *    `video_wan_animate2` template with the loop unrolled.
 * 4. The result keeps the clip's own sound, since the timing is the clip's.
 *
 * Model weights: Wan Animate 2 (Apache 2.0), the lightx2v step-distill LoRA
 * (Apache 2.0), FLUX 3 Klein; all in Comfy Cloud's model library.
 */

import { FLUX3_KLEIN_MODELS, type Graph, type Link } from "./ltx-graph";
import { keyframeNodes } from "./ltx-edit";

/** The pipeline's id in job records; Comfy Cloud runs it, not Router. */
export const WAN_ANIMATE_MODEL_ID = "comfy-cloud/wan-animate-2";

export const WAN_ANIMATE_MODELS = {
  unet: "wan_animate_2_int8_convrot.safetensors",
  /** Six LCM steps at cfg 1 instead of the base model's thirty. */
  distillLora: "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors",
  textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  clipVision: "clip_vision_h.safetensors",
  vae: "Wan2_1_VAE_bf16.safetensors",
  keyframe: FLUX3_KLEIN_MODELS,
} as const;

export const WAN_ANIMATE_LIMITS = {
  /** Longest stretch of a clip one run copies. */
  maxSeconds: 10,
  minSeconds: 1,
  /** Frames per window: Wan's training length, 5 s at 16 fps. */
  window: 81,
  /** Each later window repeats the previous one's last frame. */
  overlap: 1,
} as const;

/** Output size on the longer side; sides are multiples of 16. */
export const WAN_ANIMATE_SIZES = { draft: 640, standard: 960 } as const;
export type WanAnimateSize = keyof typeof WAN_ANIMATE_SIZES;

/** Wan's own negative prompt, from the template. */
const NEGATIVE_PROMPT =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

export const WAN_ANIMATE_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
  /** A ready keyframe, used instead of the FLUX 3 Klein step. */
  keyframe: { node: "keyframe_given", field: "image" },
  /** Character (then Location) references for the keyframe, in order. */
  reference: (i: number) => ({ node: `reference_${i}`, field: "image" }),
} as const;

/** SaveVideo / SaveImage nodes, in the order outputs are listed. */
export const WAN_ANIMATE_OUTPUT_NODES = [
  "save_result",
  "save_keyframe",
] as const;

/**
 * The windows that cover `frames`: the first is as short as it can be (a
 * 4n+1 length) so every later one is a full 81-frame window, as in the
 * template's loop. WanAnimate2ToVideo refuses a window that starts past the
 * end of the motion clip, so the windows never overshoot by a whole window.
 */
export function wanWindows(frames: number): number[] {
  const { window, overlap } = WAN_ANIMATE_LIMITS;
  const step = window - overlap;
  const later = Math.max(0, Math.ceil((frames - window) / step));
  const rest = frames - later * step;
  const first = Math.max(5, Math.ceil((rest - 1) / 4) * 4 + 1);
  return [first, ...Array.from({ length: later }, () => window)];
}

/** Frames the run renders for a stretch of `seconds` at `fps`. */
export function wanFrameCount(seconds: number, fps: number) {
  const { minSeconds, maxSeconds } = WAN_ANIMATE_LIMITS;
  const s = Math.min(maxSeconds, Math.max(minSeconds, seconds));
  return Math.max(5, Math.round(s * fps));
}

export interface WanAnimateGraphOptions {
  /** The stretch of the clip to copy, in seconds. */
  startSeconds: number;
  seconds: number;
  fps: number;
  size: WanAnimateSize;
  /** FLUX 3 Klein's instruction for the first frame, or null when one is given. */
  keyframePrompt: string | null;
  /** Reference images the keyframe step reads after the frame itself. */
  references: number;
  /** Who and where, for Wan. */
  prompt: string;
  /** What the motion is, for Wan's pose branch; empty is the template's own. */
  motionPrompt: string;
  /** How closely the Character follows the reference, 0.5–1.5. */
  likeness: number;
  seed: number;
}

/** Longer side scaled to `long`, rounded to multiples of 16. */
function sideExpression(side: "a" | "b", long: number) {
  return `max(16, round(${side} * ${long} / max(a, b) / 16) * 16)`;
}

/**
 * The API-format graph. File inputs are left empty; the Cloud client sets them
 * to uploaded assets named by WAN_ANIMATE_MEDIA_INPUTS.
 */
export function wanAnimateGraph(o: WanAnimateGraphOptions): Graph {
  const frames = wanFrameCount(o.seconds, o.fps);
  const windows = wanWindows(frames);
  const long = WAN_ANIMATE_SIZES[o.size];
  const drive: Link = ["drive", 0];
  const width: Link = ["out_width", 1];
  const height: Link = ["out_height", 1];

  const graph: Graph = {
    source: { class_type: "LoadVideo", inputs: { file: "" } },
    stretch: {
      class_type: "Video Slice",
      inputs: {
        video: ["source", 0],
        start_time: o.startSeconds,
        duration: o.seconds,
        strict_duration: false,
      },
    },
    // A fixed frame count on the output's own clock, whatever the clip's rate.
    resampled: {
      class_type: "VideoFrameSample",
      inputs: {
        video: ["stretch", 0],
        num_frames: frames,
        strategy: "uniform",
        seed: 0,
      },
    },
    stretch_parts: {
      class_type: "GetVideoComponents",
      inputs: { video: ["stretch", 0] },
    },
    parts: {
      class_type: "GetVideoComponents",
      inputs: { video: ["resampled", 0] },
    },
    source_size: {
      class_type: "GetImageSize",
      inputs: { image: ["parts", 0] },
    },
    out_width: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: sideExpression("a", long),
        "values.a": ["source_size", 0],
        "values.b": ["source_size", 1],
      },
    },
    out_height: {
      class_type: "ComfyMathExpression",
      inputs: {
        expression: sideExpression("b", long),
        "values.a": ["source_size", 0],
        "values.b": ["source_size", 1],
      },
    },
    drive: {
      class_type: "ResizeImageMaskNode",
      inputs: {
        input: ["parts", 0],
        resize_type: "scale dimensions",
        "resize_type.width": width,
        "resize_type.height": height,
        "resize_type.crop": "center",
        scale_method: "area",
      },
    },
    first: {
      class_type: "ImageFromBatch",
      inputs: { image: drive, batch_index: 0, length: 1 },
    },

    unet: {
      class_type: "UNETLoader",
      inputs: { unet_name: WAN_ANIMATE_MODELS.unet, weight_dtype: "default" },
    },
    lora: {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["unet", 0],
        lora_name: WAN_ANIMATE_MODELS.distillLora,
        strength_model: 1,
      },
    },
    cache: {
      class_type: "WanAnimate2Cache",
      inputs: { model: ["lora", 0], device: "gpu", dtype: "int8" },
    },
    msd3: {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["cache", 0], shift: 5 },
    },
    sched: {
      class_type: "BasicScheduler",
      inputs: {
        model: ["cache", 0],
        scheduler: "simple",
        steps: 6,
        denoise: 1,
      },
    },
    sampler: { class_type: "KSamplerSelect", inputs: { sampler_name: "lcm" } },
    clip: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: WAN_ANIMATE_MODELS.textEncoder,
        type: "wan",
        device: "default",
      },
    },
    clip_vision: {
      class_type: "CLIPVisionLoader",
      inputs: { clip_name: WAN_ANIMATE_MODELS.clipVision },
    },
    vae: {
      class_type: "VAELoader",
      inputs: { vae_name: WAN_ANIMATE_MODELS.vae },
    },
    positive: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["clip", 0], text: o.prompt },
    },
    negative: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["clip", 0], text: NEGATIVE_PROMPT },
    },
    positive_pose: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["clip", 0], text: o.motionPrompt },
    },
  };

  // The keyframe: FLUX 3 Klein from the clip's first frame, or a given image.
  let keyframe: Link;
  if (o.keyframePrompt === null) {
    graph.keyframe_given = { class_type: "LoadImage", inputs: { image: "" } };
    keyframe = ["keyframe_given", 0];
  } else {
    const step = keyframeNodes(
      ["first", 0],
      o.keyframePrompt,
      o.references,
      o.seed,
    );
    Object.assign(graph, step.nodes);
    keyframe = step.image;
  }
  Object.assign(graph, {
    reference: {
      class_type: "ResizeImageMaskNode",
      inputs: {
        input: keyframe,
        resize_type: "scale dimensions",
        "resize_type.width": width,
        "resize_type.height": height,
        "resize_type.crop": "center",
        scale_method: "area",
      },
    },
    vision_reference: {
      class_type: "CLIPVisionEncode",
      inputs: {
        clip_vision: ["clip_vision", 0],
        image: ["reference", 0],
        crop: "none",
      },
    },
    vision_pose: {
      class_type: "CLIPVisionEncode",
      inputs: {
        clip_vision: ["clip_vision", 0],
        image: ["first", 0],
        crop: "none",
      },
    },
  } satisfies Graph);

  // One window per 80 new frames; each continues from the last frame before it.
  const decoded: Link[] = [];
  windows.forEach((length, i) => {
    const animate = `animate_${i}`;
    graph[animate] = {
      class_type: "WanAnimate2ToVideo",
      inputs: {
        positive: ["positive", 0],
        negative: ["negative", 0],
        vae: ["vae", 0],
        width,
        height,
        length,
        batch_size: 1,
        video_frame_offset: i === 0 ? 0 : [`animate_${i - 1}`, 5],
        pose_strength: 1,
        pose_start_percent: 0,
        pose_end_percent: 1,
        reference_image_strength: o.likeness,
        reference_image: ["reference", 0],
        pose_video: drive,
        clip_vision_output: ["vision_reference", 0],
        positive_pose: ["positive_pose", 0],
        clip_vision_output_pose: ["vision_pose", 0],
        ...(i === 0 ? {} : { continue_motion: [`decode_${i - 1}`, 0] }),
      },
    };
    graph[`sample_${i}`] = {
      class_type: "SamplerCustom",
      inputs: {
        model: ["msd3", 0],
        add_noise: true,
        noise_seed: o.seed + i,
        cfg: 1,
        positive: [animate, 0],
        negative: [animate, 1],
        sampler: ["sampler", 0],
        sigmas: ["sched", 0],
        latent_image: [animate, 2],
      },
    };
    graph[`trim_${i}`] = {
      class_type: "TrimVideoLatent",
      inputs: { samples: [`sample_${i}`, 0], trim_amount: [animate, 3] },
    };
    graph[`decode_${i}`] = {
      class_type: "VAEDecode",
      inputs: { samples: [`trim_${i}`, 0], vae: ["vae", 0] },
    };
    if (i === 0) decoded.push([`decode_${i}`, 0]);
    else {
      // Drop the frame this window repeated from the one before.
      graph[`tail_${i}`] = {
        class_type: "ImageFromBatch",
        inputs: {
          image: [`decode_${i}`, 0],
          batch_index: WAN_ANIMATE_LIMITS.overlap,
          length: 4096,
        },
      };
      decoded.push([`tail_${i}`, 0]);
    }
  });
  let all = decoded[0]!;
  decoded.slice(1).forEach((part, i) => {
    graph[`joined_${i}`] = {
      class_type: "ImageBatch",
      inputs: { image1: all, image2: part },
    };
    all = [`joined_${i}`, 0];
  });

  Object.assign(graph, {
    result_frames: {
      class_type: "ImageFromBatch",
      inputs: { image: all, batch_index: 0, length: frames },
    },
    save_result_video: {
      class_type: "CreateVideo",
      inputs: {
        images: ["result_frames", 0],
        fps: o.fps,
        audio: ["stretch_parts", 1],
      },
    },
    save_result: {
      class_type: "SaveVideo",
      inputs: {
        video: ["save_result_video", 0],
        filename_prefix: "open_cinema/moves",
        format: "mp4",
        "format.codec": "h264",
      },
    },
    save_keyframe: {
      class_type: "SaveImage",
      inputs: {
        images: ["reference", 0],
        filename_prefix: "open_cinema/moves_keyframe",
      },
    },
  } satisfies Graph);
  return graph;
}
