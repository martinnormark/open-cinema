import type {
  CharacterReplaceInputs,
  ReferenceView,
  ResolvedMention,
  TargetSelection,
} from "@open-cinema/contracts";
import {
  characterReferences,
  describeTarget,
  referenceGuide,
} from "./character-replace";
import { mediaFilename, seedFrom } from "./ltx-alpha-background";
import type { Graph, Link } from "./ltx-graph";
import { expandMentions } from "./results";
import type {
  BuildContext,
  CloudMediaInput,
  CloudWorkflowRequest,
} from "./types";
import { castTrackNodes, type CastTarget } from "./wan3-cast";

/**
 * `video.character-replace` on MiniMax H3's open weights, the switchable
 * alternative to the Kling 3.0 Omni edit (./character-replace.ts). One Comfy
 * Cloud graph, reconciled from Comfy's "MiniMax H3 Reference to Video"
 * template (ComfyUI#15224):
 *
 * 1. The take is loaded on H3's 24 fps grid, which its reference videos are
 *    read on. Size and length follow the take; the template's fixed 16:9 and
 *    5 seconds would crop a portrait take and cut a long one.
 * 2. SAM 3.1 segments the person the creator clicked and tracks them through
 *    the take (the tracker of ./wan3-cast.ts), filling them in red.
 * 3. MiniMax H3 ref2va regenerates the shot with the take as Video 1 (with its
 *    sound, for lip timing), the red tracks as Video 2 (who to replace) and the
 *    Character's references as pictures.
 * 4. The result is trimmed to the take's length and saved with the take's own
 *    sound; the conform stage then puts it on the take's frame rate.
 *
 * H3 has no edit mode: every pixel is generated, so other people and the
 * background are redrawn rather than kept (docs/recast-minimax-h3.md).
 */
export const MINIMAX_H3_RECAST_MODEL_ID = "comfy-cloud/minimax-h3-recast";
export const MINIMAX_H3_RECAST_JOB_MODEL = "SAM 3.1 + MiniMax H3";

/** The files Comfy-Org/MiniMax-H3's ref2va template loads. */
export const MINIMAX_H3_MODELS = {
  transformer: "minimax_h3_ref2va_pruned_int8_convrot.safetensors",
  textEncoder: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
  /**
   * Missing from Cloud's object_info list on 2026-10-30, yet the template ran
   * with it on Cloud that day (job 91dfbd38); only the fp16 file is listed.
   */
  videoVae: "minimax_h3_video_vae_int8_convrot.safetensors",
  audioVae: "minimax_h3_audio_vae_fp32.safetensors",
} as const;

export const MINIMAX_H3_RECAST_LIMITS = {
  /** H3 reads reference videos at 24 fps and generates at 24 fps. */
  fps: 24,
  /** Each reference video may run 2–15 s; 360 frames is 15 s. */
  minSeconds: 2,
  maxSeconds: 15,
  maxFrames: 360,
  /** Trained range starts here (~5 s); shorter takes are trimmed afterwards. */
  minGeneratedFrames: 124,
  /** H3's "official 768p" area (1344 × 768); smaller takes are not upscaled. */
  pixels: 1344 * 768,
  /** Character views, out of H3's nine picture slots. */
  maxReferences: 4,
} as const;

/** Loader nodes the Cloud client fills. */
export const MINIMAX_H3_RECAST_MEDIA_INPUTS = {
  source: { node: "source", field: "video" },
  reference: (i: number) => ({ node: `reference_${i}`, field: "image" }),
} as const;

/** The recast first (the conform stage reads it), then SAM 3.1's tracks. */
export const MINIMAX_H3_RECAST_OUTPUT_NODES = [
  "save_result",
  "save_tracks",
] as const;

export interface MinimaxH3RecastOptions {
  prompt: string;
  target: CastTarget;
  /** Character references loaded from MINIMAX_H3_RECAST_MEDIA_INPUTS.reference. */
  references: number;
  /** Pass the take's sound to H3 and lay it under the result. */
  sound: boolean;
  seed: number;
  /** Template defaults: res_multistep, simple, 20 steps. */
  steps?: number;
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

/**
 * The API-format graph. File inputs are left empty; the Cloud client sets them
 * to uploaded assets named by MINIMAX_H3_RECAST_MEDIA_INPUTS.
 */
export function minimaxH3RecastGraph(o: MinimaxH3RecastOptions): Graph {
  const L = MINIMAX_H3_RECAST_LIMITS;
  if (o.references < 1)
    throw new Error("Approve at least one reference image for this Character");
  const frames: Link = ["source", 0];
  const audio: Link = ["source", 2];
  const fps: Link = ["source_fps", 0];
  const width: Link = ["source_size", 0];
  const height: Link = ["source_size", 1];
  const count: Link = ["source_size", 2];
  const vae: Link = ["video_vae", 0];

  const graph: Graph = {
    // ffmpeg resamples the take onto H3's grid (nearest frame in time).
    source: {
      class_type: "VHS_LoadVideoFFmpeg",
      inputs: {
        video: "",
        force_rate: L.fps,
        custom_width: 0,
        custom_height: 0,
        frame_load_cap: L.maxFrames,
        start_time: 0,
        format: "None",
      },
    },
    source_fps: { class_type: "PrimitiveFloat", inputs: { value: L.fps } },
    source_size: { class_type: "GetImageSize", inputs: { image: frames } },
  };
  castTrackNodes(graph, { frames, fps, targets: [o.target], tracks: null });

  for (let i = 0; i < o.references; i++)
    graph[`reference_${i}`] = {
      class_type: "LoadImage",
      inputs: { image: "" },
    };

  // The take's shape at about 768p, multiples of 32; never above its own size.
  const side = (axis: "a" | "b") =>
    math(
      `max(32, round(${axis} * min(1, sqrt(${L.pixels} / (a * b))) / 32) * 32)`,
      { a: width, b: height },
    );
  Object.assign(graph, {
    gen_width: side("a"),
    gen_height: side("b"),
    // H3 makes 17k + 5 frames: the take's count rounded up, at least ~5 s.
    gen_length: math(`max(${L.minGeneratedFrames}, a + (5 - a % 17) % 17)`, {
      a: count,
    }),
    unet: {
      class_type: "UNETLoader",
      inputs: {
        unet_name: MINIMAX_H3_MODELS.transformer,
        weight_dtype: "default",
      },
    },
    text_encoder: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: MINIMAX_H3_MODELS.textEncoder,
        type: "minimax",
        device: "default",
      },
    },
    video_vae: {
      class_type: "VAELoader",
      inputs: { vae_name: MINIMAX_H3_MODELS.videoVae },
    },
    audio_vae: {
      class_type: "VAELoader",
      inputs: { vae_name: MINIMAX_H3_MODELS.audioVae },
    },
    condition: {
      class_type: "MiniMaxH3ReferenceToVideo",
      inputs: {
        clip: ["text_encoder", 0],
        vae,
        audio_vae: ["audio_vae", 0],
        prompt: o.prompt,
        width: ["gen_width", 1],
        height: ["gen_height", 1],
        length: ["gen_length", 1],
        ref_image_size: "match",
        ...Object.fromEntries(
          Array.from({ length: o.references }, (_, i) => [
            `ref_images.ref_image_${i}`,
            [`reference_${i}`, 0],
          ]),
        ),
        "ref_videos.ref_video_0": frames,
        "ref_videos.ref_video_1": ["tracks_frames", 0],
        ...(o.sound ? { "ref_video_audios.ref_video_audio_0": audio } : {}),
      },
    },
    noise: { class_type: "RandomNoise", inputs: { noise_seed: o.seed } },
    guider: {
      class_type: "BasicGuider",
      inputs: { model: ["unet", 0], conditioning: ["condition", 0] },
    },
    sampler: {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "res_multistep" },
    },
    sigmas: {
      class_type: "BasicScheduler",
      inputs: {
        model: ["unet", 0],
        scheduler: "simple",
        steps: o.steps ?? 20,
        denoise: 1,
      },
    },
    sample: {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["noise", 0],
        guider: ["guider", 0],
        sampler: ["sampler", 0],
        sigmas: ["sigmas", 0],
        latent_image: ["condition", 1],
      },
    },
    // VAEDecode takes the video half of the joint latent; H3's own audio is
    // not decoded, because the take's sound goes under the result.
    decode: {
      class_type: "VAEDecode",
      inputs: { samples: ["sample", 0], vae },
    },
    result_frames: {
      class_type: "ImageFromBatch",
      inputs: { image: ["decode", 0], batch_index: 0, length: count },
    },
    result_video: {
      class_type: "CreateVideo",
      inputs: {
        images: ["result_frames", 0],
        fps,
        ...(o.sound ? { audio } : {}),
      },
    },
    save_result: {
      class_type: "SaveVideo",
      inputs: {
        video: ["result_video", 0],
        filename_prefix: "open_cinema/recast_h3",
        format: "mp4",
        "format.codec": "h264",
        "format.codec.encoding": "re-encode",
        "format.codec.encoding.crf": 16,
      },
    },
  } satisfies Graph);
  return graph;
}

/** The clicked person, as the tracker takes it: a point, plus a box when known. */
export function castTarget(target: TargetSelection): CastTarget {
  if (target.type !== "person")
    throw new Error("Select the person to recast in the source video");
  const { point, box } = target;
  if (!point && !box)
    throw new Error("Click the person to recast on the frame");
  return {
    x: point?.x ?? box!.x + box!.width / 2,
    y: point?.y ?? box!.y + box!.height / 2,
    seconds: (point?.timeMs ?? box!.timeMs) / 1000,
    ...(box
      ? { box: { x: box.x, y: box.y, w: box.width, h: box.height } }
      : {}),
  };
}

export interface MinimaxH3RecastPromptOptions {
  /** The creator's words for who is replaced, plus the side of the frame. */
  target: string;
  character: Pick<
    ResolvedMention,
    "name" | "description" | "stateName" | "stateDescription"
  >;
  keepSourceWardrobe: boolean;
  /** What each picture shows, in the order they are connected. */
  views: readonly (ReferenceView | null)[];
  direction?: string | undefined;
}

/**
 * The ref2va instruction. H3 reads tags in connection order (`<Picture 1>`,
 * `<Video 1>`) and is sensitive to which reference drives which part of the
 * shot, so each one's role is said once.
 */
export function minimaxH3RecastPrompt(o: MinimaxH3RecastPromptOptions) {
  const tags = o.views.map((_, i) => `<Picture ${i + 1}>`);
  const who = o.character.stateName
    ? `${o.character.name} (${o.character.stateName})`
    : o.character.name;
  const identity = [o.character.description, o.character.stateDescription]
    .map((text) => text?.trim().replace(/[.\s]+$/, "") ?? "")
    .filter(Boolean)
    .join(". ");
  const wardrobe = o.keepSourceWardrobe
    ? "Keep the replaced person's clothing exactly as in <Video 1>; change only the person (face, hair, skin, build)."
    : `Dress them in their reference outfit from ${tags.join(", ")}.`;
  return [
    `Replace ${o.target}, the person filled in red in <Video 2>, in <Video 1> with ${who}, the person shown in ${tags.join(", ")}${identity ? `: ${identity}` : ""}.`,
    referenceGuide(o.views.map((view, i) => ({ tag: tags[i]!, view }))),
    wardrobe,
    "Keep the replaced person's exact performance from <Video 1>: body movement, pose, gestures, facial expression, gaze, head turns, lip movement and timing. Keep every other person, the background, all objects, the framing, the lighting, the camera movement and the audio exactly as in <Video 1>. <Video 2> only marks who is replaced; no red fill appears in the result. Photorealistic, natural skin, same film look.",
    o.direction?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Builds the Cloud graph and media for a recast on MiniMax H3. */
export async function minimaxH3RecastRequest(
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
  const source = await context.asset(inputs.source);
  if (!source.mediaType.startsWith("video/"))
    throw new Error("Recasting needs a source video");

  const keepSourceWardrobe = inputs.preservation.preserve.includes("wardrobe");
  const refs = [
    ...inputs.references.map((asset) => ({ asset, view: null })),
    ...characterReferences(mention, { faceOnly: keepSourceWardrobe }),
  ].slice(0, MINIMAX_H3_RECAST_LIMITS.maxReferences);
  if (!refs.length)
    throw new Error("Approve at least one reference image for this Character");
  const references = await Promise.all(refs.map((r) => context.asset(r.asset)));

  const media: CloudMediaInput[] = [
    {
      ...MINIMAX_H3_RECAST_MEDIA_INPUTS.source,
      url: await source.fetchableUrl(),
      filename: mediaFilename("source", source.mediaType),
      contentType: source.mediaType,
    },
  ];
  for (const [i, reference] of references.entries())
    media.push({
      ...MINIMAX_H3_RECAST_MEDIA_INPUTS.reference(i),
      url: await reference.fetchableUrl(),
      filename: mediaFilename(`reference_${i}`, reference.mediaType),
      contentType: reference.mediaType,
    });

  return {
    model: MINIMAX_H3_RECAST_MODEL_ID,
    input: {
      graph: minimaxH3RecastGraph({
        prompt: minimaxH3RecastPrompt({
          target: describeTarget(inputs.target),
          character: mention,
          keepSourceWardrobe,
          views: refs.map((r) => r.view),
          direction: inputs.prompt
            ? expandMentions(inputs.prompt, context.mentions)
            : undefined,
        }),
        target,
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
