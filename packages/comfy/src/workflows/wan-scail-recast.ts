import type {
  CharacterReplaceInputs,
  ReferenceView,
  ResolvedMention,
} from "@open-cinema/contracts";
import {
  characterReferences,
  describeTarget,
  referenceGuide,
} from "./character-replace";
import { mediaFilename, seedFrom } from "./ltx-alpha-background";
import { keyframeNodes } from "./ltx-edit";
import type { Graph, Link } from "./ltx-graph";
import { castTarget } from "./minimax-h3-recast";
import { expandMentions } from "./results";
import type {
  BuildContext,
  CloudMediaInput,
  CloudWorkflowRequest,
} from "./types";
import { castTrackNodes, type CastTarget } from "./wan3-cast";

/**
 * `video.character-replace` on Wan: SCAIL-2 (Wan 2.1 14B) in replacement
 * mode, the third switchable recast beside Kling 3.0 Omni and MiniMax H3. One
 * Comfy Cloud graph, reconciled from Comfy's "SCAIL-2 Int8: Character
 * Replacement" template:
 *
 * 1. The take is loaded on a 24 fps grid, so its frame count, and with it the
 *    run's 81-frame segments, are known when the graph is built.
 * 2. SAM 3.1 tracks the person the creator clicked (the tracker of
 *    ./wan3-cast.ts) and, from that track's first frame, again at the size
 *    SCAIL-2 reads. The template tracks every "human", which would replace
 *    everyone in a shot with several people.
 * 3. FLUX 3 Klein redraws the clicked frame with the Character in that
 *    person's place, so SCAIL-2's reference has the Character's face, outfit
 *    and build in the take's own light and scale. SAM 3.1 masks them there.
 * 4. SCAIL-2 replaces the masked person segment by segment (81 frames, five
 *    of overlap, each later one colour-matched to the one before), and the
 *    take's sound is laid under the result. The conform stage then puts it on
 *    the take's own frame rate.
 *
 * Model weights: SCAIL-2 (zai-org, on Wan 2.1 14B), its DPO and the lightx2v
 * step-distill LoRAs, SAM 3.1, FLUX 3 Klein; all in Comfy Cloud's library.
 */
export const WAN_SCAIL_RECAST_MODEL_ID = "comfy-cloud/wan-scail2-recast";
export const WAN_SCAIL_RECAST_JOB_MODEL = "SAM 3.1 + Wan SCAIL-2";

/** The files Comfy-Org's SCAIL-2 Int8 character replacement template loads. */
export const WAN_SCAIL_MODELS = {
  unet: "wan2.1_14B_SCAIL_2_int8_convrot.safetensors",
  dpoLora: "wan2.1_SCAIL_2_DPO_lora_bf16.safetensors",
  /** The template's turbo preset: six steps at cfg 1 instead of forty at 5. */
  distillLora: "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors",
  textEncoder: "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
  clipVision: "clip_vision_h.safetensors",
  vae: "Wan2_1_VAE_bf16.safetensors",
} as const;

export const WAN_SCAIL_RECAST_LIMITS = {
  fps: 24,
  minSeconds: 1,
  maxSeconds: 10,
  /** SCAIL-2's training length per segment, and the frames each one repeats. */
  segment: 81,
  overlap: 5,
  /** Generated size on the longer side, as the template's 896 × 512. */
  longSide: 896,
  /** Character views for the FLUX 3 Klein keyframe, after the frame itself. */
  maxReferences: 3,
} as const;

export const WAN_SCAIL_RECAST_MEDIA_INPUTS = {
  source: { node: "source", field: "video" },
  reference: (i: number) => ({ node: `reference_${i}`, field: "image" }),
} as const;

/** The recast first (the conform stage reads it), then the tracks and keyframe. */
export const WAN_SCAIL_RECAST_OUTPUT_NODES = [
  "save_result",
  "save_tracks",
  "save_keyframe",
] as const;

/** Frames read from a take of `seconds`, a frame short so the cap never overshoots. */
export function scailFrameCount(seconds: number) {
  const { fps, minSeconds, maxSeconds } = WAN_SCAIL_RECAST_LIMITS;
  const s = Math.min(maxSeconds, Math.max(minSeconds, seconds));
  return Math.max(5, Math.floor(s * fps) - 1);
}

/**
 * The segments that cover `frames`: each 81 frames (4n + 1) starting 76 after
 * the last, the final one cut to the frames left. Up to three frames at the
 * end may go unmade; the conform stage holds the last one.
 */
export function scailSegments(frames: number) {
  const { segment, overlap } = WAN_SCAIL_RECAST_LIMITS;
  const fit = (n: number) => Math.floor((n - 1) / 4) * 4 + 1;
  const segments = [{ start: 0, length: fit(Math.min(segment, frames)) }];
  for (;;) {
    const last = segments.at(-1)!;
    const start = last.start + last.length - overlap;
    const length = fit(Math.min(segment, frames - start));
    if (length <= overlap) break;
    segments.push({ start, length });
  }
  return segments;
}

export interface WanScailRecastOptions {
  /** SCAIL-2's description of the result. */
  prompt: string;
  /** FLUX 3 Klein's instruction for the clicked frame. */
  keyframePrompt: string;
  target: CastTarget;
  /** Frames of the take on the 24 fps grid (scailFrameCount). */
  frames: number;
  references: number;
  sound: boolean;
  seed: number;
}

const math = (expression: string, values: Record<string, Link>) => ({
  class_type: "ComfyMathExpression",
  inputs: {
    expression,
    ...Object.fromEntries(
      Object.entries(values).map(([name, link]) => [`values.${name}`, link]),
    ),
  },
});
const int = (node: string): Link => [node, 1];
const fixed = (n: number) => Number(n.toFixed(4)).toString();

/**
 * The API-format graph. File inputs are left empty; the Cloud client sets them
 * to uploaded assets named by WAN_SCAIL_RECAST_MEDIA_INPUTS.
 */
export function wanScailRecastGraph(o: WanScailRecastOptions): Graph {
  const L = WAN_SCAIL_RECAST_LIMITS;
  if (o.references < 1)
    throw new Error("Approve at least one reference image for this Character");
  const frames: Link = ["source", 0];
  const audio: Link = ["source", 2];
  const fps: Link = ["source_fps", 0];
  const width: Link = ["source_size", 0];
  const height: Link = ["source_size", 1];
  const sam: Link = ["sam", 0];
  const vae: Link = ["vae", 0];
  const genWidth = int("gen_width");
  const genHeight = int("gen_height");

  const graph: Graph = {
    source: {
      class_type: "VHS_LoadVideoFFmpeg",
      inputs: {
        video: "",
        force_rate: L.fps,
        custom_width: 0,
        custom_height: 0,
        frame_load_cap: o.frames,
        start_time: 0,
        format: "None",
      },
    },
    source_fps: { class_type: "PrimitiveFloat", inputs: { value: L.fps } },
    source_size: { class_type: "GetImageSize", inputs: { image: frames } },
  };
  const [track] = castTrackNodes(graph, {
    frames,
    fps,
    targets: [o.target],
    tracks: null,
  });

  const side = (axis: "a" | "b") =>
    math(`max(32, round(${axis} * ${L.longSide} / max(a, b) / 32) * 32)`, {
      a: width,
      b: height,
    });
  // The clicked frame at full size, for the keyframe.
  // Values must be named a, b, … in order: a lone `b` silently blocks every
  // node downstream on Cloud (checked 2026-10-30).
  graph.click_index = math(
    `max(0, min(a - 1, round(${fixed(o.target.seconds)} * ${L.fps})))`,
    { a: ["source_size", 2] },
  );
  graph.click_frame = {
    class_type: "ImageFromBatch",
    inputs: { image: frames, batch_index: int("click_index"), length: 1 },
  };
  const keyframe = keyframeNodes(
    ["click_frame", 0],
    o.keyframePrompt,
    Math.min(o.references, L.maxReferences),
    o.seed,
  );
  Object.assign(graph, keyframe.nodes);

  // The Character on the keyframe, from the same click and box.
  const point = (name: string, value: number, size: Link) =>
    (graph[`key_${name}`] = math(`max(0, round(${fixed(value)} * a))`, {
      a: size,
    }));
  const keySize: [Link, Link] = [
    ["keyframe_size", 0],
    ["keyframe_size", 1],
  ];
  graph.keyframe_size = {
    class_type: "GetImageSize",
    inputs: { image: keyframe.image },
  };
  point("x", o.target.x, keySize[0]);
  point("y", o.target.y, keySize[1]);
  graph.key_point = {
    class_type: "StringFormat",
    inputs: {
      "values.a": int("key_x"),
      "values.b": int("key_y"),
      f_string: '[{{"x": {a}, "y": {b}}}]',
    },
  };
  graph.key_detect = {
    class_type: "SAM3_Detect",
    inputs: {
      model: sam,
      image: keyframe.image,
      threshold: 0.5,
      refine_iterations: 2,
      individual_masks: false,
      positive_coords: ["key_point", 0],
    },
  };
  if (o.target.box) {
    const { x, y, w, h } = o.target.box;
    point("box_x", x, keySize[0]);
    point("box_y", y, keySize[1]);
    graph.key_box_w = math(`max(1, round(${fixed(w)} * a))`, { a: keySize[0] });
    graph.key_box_h = math(`max(1, round(${fixed(h)} * a))`, { a: keySize[1] });
    graph.key_box = {
      class_type: "PrimitiveBoundingBox",
      inputs: {
        x: int("key_box_x"),
        y: int("key_box_y"),
        width: int("key_box_w"),
        height: int("key_box_h"),
      },
    };
    graph.key_detect.inputs.bboxes = ["key_box", 0];
  }

  Object.assign(graph, {
    gen_width: side("a"),
    gen_height: side("b"),
    pose: {
      class_type: "ImageScale",
      inputs: {
        image: frames,
        upscale_method: "bilinear",
        width: genWidth,
        height: genHeight,
        crop: "disabled",
      },
    },
    // The clicked person's first-frame mask, at SCAIL-2's size, seeds one
    // track there; SCAIL-2 reads SAM 3's track data, not a plain mask.
    seed_image: { class_type: "MaskToImage", inputs: { mask: track } },
    seed_first: {
      class_type: "ImageFromBatch",
      inputs: { image: ["seed_image", 0], batch_index: 0, length: 1 },
    },
    seed_fit: {
      class_type: "ImageScale",
      inputs: {
        image: ["seed_first", 0],
        upscale_method: "bilinear",
        width: genWidth,
        height: genHeight,
        crop: "disabled",
      },
    },
    seed_mask: {
      class_type: "ImageToMask",
      inputs: { image: ["seed_fit", 0], channel: "red" },
    },
    drive_track: {
      class_type: "SAM3_VideoTrack",
      inputs: {
        images: ["pose", 0],
        model: sam,
        initial_mask: ["seed_mask", 0],
        detection_threshold: 0.5,
        max_objects: 1,
        detect_interval: 1,
      },
    },
    colour_masks: {
      class_type: "SCAIL2ColoredMask",
      inputs: {
        driving_track_data: ["drive_track", 0],
        ref_track_data: ["key_detect", 0],
        object_indices: "",
        sort_by: "left_to_right",
        replacement_mode: true,
      },
    },
    unet: {
      class_type: "UNETLoader",
      inputs: { unet_name: WAN_SCAIL_MODELS.unet, weight_dtype: "default" },
    },
    dpo: {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["unet", 0],
        lora_name: WAN_SCAIL_MODELS.dpoLora,
        strength_model: 1,
      },
    },
    distill: {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: ["dpo", 0],
        lora_name: WAN_SCAIL_MODELS.distillLora,
        strength_model: 0.8,
      },
    },
    shift: {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["distill", 0], shift: 5 },
    },
    text_encoder: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: WAN_SCAIL_MODELS.textEncoder,
        type: "wan",
        device: "default",
      },
    },
    vae: {
      class_type: "VAELoader",
      inputs: { vae_name: WAN_SCAIL_MODELS.vae },
    },
    clip_vision: {
      class_type: "CLIPVisionLoader",
      inputs: { clip_name: WAN_SCAIL_MODELS.clipVision },
    },
    clip_vision_encode: {
      class_type: "CLIPVisionEncode",
      inputs: {
        clip_vision: ["clip_vision", 0],
        image: keyframe.image,
        crop: "none",
      },
    },
    positive: {
      class_type: "CLIPTextEncode",
      inputs: { text: o.prompt, clip: ["text_encoder", 0] },
    },
    negative: {
      class_type: "CLIPTextEncode",
      inputs: { text: "", clip: ["text_encoder", 0] },
    },
    sampler: {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    sigmas: {
      class_type: "BasicScheduler",
      inputs: {
        model: ["distill", 0],
        scheduler: "simple",
        steps: 6,
        denoise: 1,
      },
    },
  } satisfies Graph);

  let previous: Link | null = null;
  const outputs: Link[] = [];
  scailSegments(o.frames).forEach(({ start, length }, i) => {
    const s = `segment_${i}`;
    const slice = (image: Link): Graph[string] => ({
      class_type: "ImageFromBatch",
      inputs: { image, batch_index: start, length },
    });
    graph[`${s}_pose`] = slice(["pose", 0]);
    graph[`${s}_mask`] = slice(["colour_masks", 0]);
    graph[`${s}_condition`] = {
      class_type: "WanSCAILToVideo",
      inputs: {
        positive: ["positive", 0],
        negative: ["negative", 0],
        vae,
        width: genWidth,
        height: genHeight,
        length,
        batch_size: 1,
        pose_strength: 1,
        pose_start: 0,
        pose_end: 1,
        video_frame_offset: 0,
        previous_frame_count: L.overlap,
        replacement_mode: true,
        pose_video: [`${s}_pose`, 0],
        pose_video_mask: [`${s}_mask`, 0],
        reference_image: keyframe.image,
        reference_image_mask: ["colour_masks", 1],
        clip_vision_output: ["clip_vision_encode", 0],
        ...(previous ? { previous_frames: previous } : {}),
      },
    };
    graph[`${s}_sample`] = {
      class_type: "SamplerCustom",
      inputs: {
        model: ["shift", 0],
        add_noise: true,
        noise_seed: o.seed,
        cfg: 1,
        positive: [`${s}_condition`, 0],
        negative: [`${s}_condition`, 1],
        sampler: ["sampler", 0],
        sigmas: ["sigmas", 0],
        latent_image: [`${s}_condition`, 2],
      },
    };
    graph[`${s}_decode`] = {
      class_type: "VAEDecode",
      inputs: { samples: [`${s}_sample`, 1], vae },
    };
    if (!previous) {
      previous = [`${s}_decode`, 0];
    } else {
      // Later segments repeat the previous one's last five frames; those are
      // dropped and the rest matched to its colour, as the template does.
      graph[`${s}_new`] = {
        class_type: "ImageFromBatch",
        inputs: {
          image: [`${s}_decode`, 0],
          batch_index: L.overlap,
          length: 4096,
        },
      };
      graph[`${s}_anchor`] = {
        class_type: "ImageFromBatch",
        inputs: { image: previous, batch_index: -1, length: 1 },
      };
      graph[`${s}_matched`] = {
        class_type: "ColorTransfer",
        inputs: {
          image_target: [`${s}_new`, 0],
          image_ref: [`${s}_anchor`, 0],
          method: "reinhard_lab",
          source_stats: "per_frame",
          strength: 1,
        },
      };
      previous = [`${s}_matched`, 0];
    }
    outputs.push(previous);
  });

  let result = outputs[0]!;
  outputs.slice(1).forEach((link, i) => {
    graph[`joined_${i}`] = {
      class_type: "ImageBatch",
      inputs: { image1: result, image2: link },
    };
    result = [`joined_${i}`, 0];
  });
  Object.assign(graph, {
    result_video: {
      class_type: "CreateVideo",
      inputs: { images: result, fps, ...(o.sound ? { audio } : {}) },
    },
    save_result: {
      class_type: "SaveVideo",
      inputs: {
        video: ["result_video", 0],
        filename_prefix: "open_cinema/recast_scail",
        format: "mp4",
        "format.codec": "h264",
        "format.codec.encoding": "re-encode",
        "format.codec.encoding.crf": 16,
      },
    },
    save_keyframe: {
      class_type: "SaveImage",
      inputs: {
        images: keyframe.image,
        filename_prefix: "open_cinema/recast_scail_keyframe",
      },
    },
  } satisfies Graph);
  return graph;
}

export interface WanScailRecastPromptOptions {
  target: string;
  character: Pick<
    ResolvedMention,
    "name" | "description" | "stateName" | "stateDescription"
  >;
  keepSourceWardrobe: boolean;
  /** What each reference shows, after the frame itself. */
  views: readonly (ReferenceView | null)[];
  direction?: string | undefined;
}

/** FLUX 3 Klein's keyframe instruction and SCAIL-2's description of the result. */
export function wanScailRecastPrompts(o: WanScailRecastPromptOptions) {
  const ordinals = ["second", "third", "fourth"];
  const tags = o.views.map(
    (_, i) => `the ${ordinals[i] ?? `${i + 2}th`} image`,
  );
  const who = o.character.stateName
    ? `${o.character.name} (${o.character.stateName})`
    : o.character.name;
  const identity = [o.character.description, o.character.stateDescription]
    .map((text) => text?.trim().replace(/[.\s]+$/, "") ?? "")
    .filter(Boolean)
    .join(". ");
  const wardrobe = o.keepSourceWardrobe
    ? "Keep the clothing the person wears in the first image; change only the person (face, hair, skin, build)."
    : `Dress them in their outfit from ${tags.join(", ")}.`;
  const keyframePrompt = [
    `In the first image, replace ${o.target} with ${who}, the person shown in ${tags.join(", ")}${identity ? `: ${identity}` : ""}.`,
    // The guide starts sentences with a tag, here "the second image".
    referenceGuide(o.views.map((view, i) => ({ tag: tags[i]!, view }))).replace(
      /(^|\. )the /g,
      "$1The ",
    ),
    wardrobe,
    "Keep their exact position, scale, pose, body angle, head direction, gesture, gaze and expression from the first image, lit by the scene's own light. Change nothing else: every other person, every object, the background and the framing stay exactly as they are.",
  ]
    .filter(Boolean)
    .join(" ");
  const prompt = [
    `${who}${identity ? `, ${identity},` : ""} takes the place of ${o.target}, with the same movement, gestures, expression and timing.`,
    "Everyone else, the background, the framing, the lighting and the camera movement stay as in the video. Photorealistic, natural skin, same film look.",
    o.direction?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return { keyframePrompt, prompt };
}

/** Builds the Cloud graph and media for a recast on SCAIL-2. */
export async function wanScailRecastRequest(
  inputs: CharacterReplaceInputs,
  context: BuildContext,
): Promise<CloudWorkflowRequest> {
  const mention = context.mentions.find(
    (m) => m.elementId === inputs.character.elementId,
  );
  if (!mention) throw new Error("The Character to recast was not resolved");
  if (mention.type !== "character")
    throw new Error("Recasting needs a Character Element");
  const target = castTarget(inputs.target);
  if (!inputs.seconds)
    throw new Error("The take's length is needed to recast it on Wan");
  const source = await context.asset(inputs.source);
  if (!source.mediaType.startsWith("video/"))
    throw new Error("Recasting needs a source video");

  const keepSourceWardrobe = inputs.preservation.preserve.includes("wardrobe");
  const refs = [
    ...inputs.references.map((asset) => ({ asset, view: null })),
    ...characterReferences(mention, { faceOnly: keepSourceWardrobe }),
  ].slice(0, WAN_SCAIL_RECAST_LIMITS.maxReferences);
  if (!refs.length)
    throw new Error("Approve at least one reference image for this Character");
  const references = await Promise.all(refs.map((r) => context.asset(r.asset)));

  const media: CloudMediaInput[] = [
    {
      ...WAN_SCAIL_RECAST_MEDIA_INPUTS.source,
      url: await source.fetchableUrl(),
      filename: mediaFilename("source", source.mediaType),
      contentType: source.mediaType,
    },
  ];
  for (const [i, reference] of references.entries())
    media.push({
      ...WAN_SCAIL_RECAST_MEDIA_INPUTS.reference(i),
      url: await reference.fetchableUrl(),
      filename: mediaFilename(`reference_${i}`, reference.mediaType),
      contentType: reference.mediaType,
    });

  const prompts = wanScailRecastPrompts({
    target: describeTarget(inputs.target),
    character: mention,
    keepSourceWardrobe,
    views: refs.map((r) => r.view),
    direction: inputs.prompt
      ? expandMentions(inputs.prompt, context.mentions)
      : undefined,
  });
  return {
    model: WAN_SCAIL_RECAST_MODEL_ID,
    input: {
      graph: wanScailRecastGraph({
        ...prompts,
        target,
        frames: scailFrameCount(inputs.seconds),
        references: refs.length,
        sound: inputs.preservation.preserve.includes("audio"),
        seed: seedFrom(
          JSON.stringify([inputs.source, inputs.target, inputs.character]),
        ),
      }),
      media,
    },
  };
}
