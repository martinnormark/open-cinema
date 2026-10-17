import {
  FLUX2_KLEIN_MODELS,
  LTX23_MODELS,
  ltxSamplerNodes,
  saveVideoNodes,
  sourceClipNodes,
  type Graph,
  type GraphLimits,
  type Link,
} from "./ltx-graph";

/**
 * Object Swap and Restyle as one open-weights graph on Comfy Cloud, FLUX then
 * LTX:
 *
 * 1. FLUX.2 Klein 9B edits the take's first frame with the reference images
 *    (a Thing's sheet for a swap; a Location or style reference for a
 *    restyle). This keyframe is the look the creator approves.
 * 2. LTX 2.3 carries the keyframe through the take with Lightricks' union
 *    IC-LoRA reading the source's depth, so the motion, framing and camera are
 *    the take's own (adapted from Comfy-Org's video_ltx2_3_ic_lora template).
 * 3. A swap then puts the source back everywhere except the object: SAM 3
 *    finds the original object in the take and the new one in the result, and
 *    only the union of those masks comes from the generation. People, the
 *    background and every other Thing keep the take's exact pixels.
 *
 * The source audio is kept as is. The keyframe is saved too, so a creator can
 * see what the run aimed for.
 */
export type LtxEditMode = "swap" | "restyle";

export const LTX_EDIT_MODEL_IDS: Record<LtxEditMode, string> = {
  swap: "comfy-cloud/ltx-2.3-object-swap",
  restyle: "comfy-cloud/ltx-2.3-restyle",
};

export const LTX_EDIT_LIMITS: GraphLimits & { maxReferences: number } = {
  /** About four seconds at 24 or 25 fps; longer takes keep their first 97 frames. */
  maxFrames: 97,
  maxSide: 768,
  /** FLUX.2 Klein reads up to four images; the first is the frame itself. */
  maxReferences: 3,
};

/** Loader nodes the Cloud client fills: the take, then each reference image. */
export const LTX_EDIT_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
  reference: (i: number) => ({ node: `reference_${i}`, field: "image" }),
} as const;

/** Result first, then the keyframe it was carried from. */
export const LTX_EDIT_OUTPUT_NODES = ["save_result", "save_keyframe"] as const;

export interface LtxEditGraphOptions {
  mode: LtxEditMode;
  /** The FLUX.2 Klein instruction for the first frame. */
  keyframePrompt: string;
  /** What LTX should see across the clip (style words, the new object). */
  videoPrompt: string;
  references: number;
  seed: number;
  /** Swap only: SAM 3 text prompts for the original and the new object. */
  swap?: { original: string; replacement: string } | undefined;
}

function keyframeNodes(
  first: Link,
  prompt: string,
  references: number,
  seed: number,
): { nodes: Graph; image: Link } {
  const nodes: Graph = {
    keyframe_unet: {
      class_type: "UNETLoader",
      inputs: { unet_name: FLUX2_KLEIN_MODELS.unet, weight_dtype: "default" },
    },
    keyframe_clip: {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: FLUX2_KLEIN_MODELS.textEncoder,
        type: "flux2",
        device: "default",
      },
    },
    keyframe_vae: {
      class_type: "VAELoader",
      inputs: { vae_name: FLUX2_KLEIN_MODELS.vae },
    },
    keyframe_text: {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["keyframe_clip", 0] },
    },
    keyframe_zero: {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["keyframe_text", 0] },
    },
    keyframe_frame: {
      class_type: "ImageScaleToTotalPixels",
      inputs: {
        image: first,
        upscale_method: "lanczos",
        megapixels: 1,
        resolution_steps: 16,
      },
    },
    keyframe_size: {
      class_type: "GetImageSize",
      inputs: { image: ["keyframe_frame", 0] },
    },
  };
  // The frame is reference 0, so the edit keeps its composition.
  const images: Link[] = [["keyframe_frame", 0]];
  for (let i = 0; i < references; i++) {
    nodes[`reference_${i}`] = {
      class_type: "LoadImage",
      inputs: { image: "" },
    };
    nodes[`reference_${i}_scaled`] = {
      class_type: "ImageScaleToTotalPixels",
      inputs: {
        image: [`reference_${i}`, 0],
        upscale_method: "lanczos",
        megapixels: 1,
        resolution_steps: 16,
      },
    };
    images.push([`reference_${i}_scaled`, 0]);
  }
  let positive: Link = ["keyframe_text", 0];
  let negative: Link = ["keyframe_zero", 0];
  images.forEach((image, i) => {
    nodes[`keyframe_latent_${i}`] = {
      class_type: "VAEEncode",
      inputs: { pixels: image, vae: ["keyframe_vae", 0] },
    };
    nodes[`keyframe_pos_${i}`] = {
      class_type: "ReferenceLatent",
      inputs: { conditioning: positive, latent: [`keyframe_latent_${i}`, 0] },
    };
    nodes[`keyframe_neg_${i}`] = {
      class_type: "ReferenceLatent",
      inputs: { conditioning: negative, latent: [`keyframe_latent_${i}`, 0] },
    };
    positive = [`keyframe_pos_${i}`, 0];
    negative = [`keyframe_neg_${i}`, 0];
  });
  Object.assign(nodes, {
    keyframe_empty: {
      class_type: "EmptyFlux2LatentImage",
      inputs: {
        width: ["keyframe_size", 0],
        height: ["keyframe_size", 1],
        batch_size: 1,
      },
    },
    keyframe_sigmas: {
      class_type: "Flux2Scheduler",
      inputs: {
        steps: 4,
        width: ["keyframe_size", 0],
        height: ["keyframe_size", 1],
      },
    },
    keyframe_noise: { class_type: "RandomNoise", inputs: { noise_seed: seed } },
    keyframe_sampler: {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    keyframe_guider: {
      class_type: "CFGGuider",
      inputs: { model: ["keyframe_unet", 0], positive, negative, cfg: 1 },
    },
    keyframe_sample: {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["keyframe_noise", 0],
        guider: ["keyframe_guider", 0],
        sampler: ["keyframe_sampler", 0],
        sigmas: ["keyframe_sigmas", 0],
        latent_image: ["keyframe_empty", 0],
      },
    },
    keyframe_decode: {
      class_type: "VAEDecode",
      inputs: { samples: ["keyframe_sample", 0], vae: ["keyframe_vae", 0] },
    },
  } satisfies Graph);
  return { nodes, image: ["keyframe_decode", 0] };
}

/** SAM 3.1, the checkpoint that both tracks objects and encodes its prompts. */
export const SAM3_CHECKPOINT = "sam3.1_multiplex_fp16.safetensors";

/**
 * SAM 3 finds the object by a short noun phrase on each frame and tracks it
 * through the clip; the mask grows by a few pixels so edges blend.
 */
function segmentNodes(id: string, frames: Link, prompt: string): Graph {
  return {
    [`${id}_text`]: {
      class_type: "CLIPTextEncode",
      inputs: { clip: ["sam3", 1], text: prompt },
    },
    [`${id}_track`]: {
      class_type: "SAM3_VideoTrack",
      inputs: {
        images: frames,
        model: ["sam3", 0],
        detection_threshold: 0.4,
        max_objects: 2,
        detect_interval: 1,
        conditioning: [`${id}_text`, 0],
      },
    },
    [`${id}_masks`]: {
      class_type: "SAM3_TrackToMask",
      inputs: { track_data: [`${id}_track`, 0], object_indices: "" },
    },
    [id]: {
      class_type: "GrowMask",
      inputs: { mask: [`${id}_masks`, 0], expand: 12, tapered_corners: true },
    },
  };
}

export function ltxEditGraph(o: LtxEditGraphOptions): Graph {
  const source = sourceClipNodes(LTX_EDIT_LIMITS);
  const keyframe = keyframeNodes(
    source.first,
    o.keyframePrompt,
    Math.min(o.references, LTX_EDIT_LIMITS.maxReferences),
    o.seed,
  );
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
    depth: {
      class_type: "DepthAnythingV2Preprocessor",
      inputs: {
        image: source.small,
        ckpt_name: "depth_anything_v2_vitl.pth",
        resolution: 512,
      },
    },
    depth_fit: {
      class_type: "ImageScale",
      inputs: {
        image: ["depth", 0],
        upscale_method: "bilinear",
        width: source.genWidth,
        height: source.genHeight,
        crop: "disabled",
      },
    },
  };
  const ltx = ltxSamplerNodes({
    id: "ltx",
    checkpoint: LTX23_MODELS.checkpoint,
    textEncoder: LTX23_MODELS.textEncoder,
    loras: [{ name: LTX23_MODELS.unionControl, strength: 1 }],
    prompt: o.videoPrompt,
    width: source.genWidth,
    height: source.genHeight,
    length: source.length,
    fps: source.fps,
    seed: o.seed,
    firstFrame: { image: ["keyframe_fit", 0], strength: 1 },
    guide: { image: ["depth_fit", 0], strength: 1 },
  });
  Object.assign(graph, ltx.nodes, {
    generated_full: {
      class_type: "ImageScale",
      inputs: {
        image: ltx.frames,
        upscale_method: "lanczos",
        width: source.width,
        height: source.height,
        crop: "disabled",
      },
    },
  } satisfies Graph);

  let result: Link = ["generated_full", 0];
  if (o.mode === "swap" && o.swap) {
    Object.assign(
      graph,
      {
        sam3: {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: SAM3_CHECKPOINT },
        },
      } satisfies Graph,
      segmentNodes("mask_original", source.clip, o.swap.original),
      segmentNodes(
        "mask_replacement",
        ["generated_full", 0],
        o.swap.replacement,
      ),
      {
        mask_union: {
          class_type: "MaskComposite",
          inputs: {
            destination: ["mask_original", 0],
            source: ["mask_replacement", 0],
            x: 0,
            y: 0,
            operation: "or",
          },
        },
        composite: {
          class_type: "ImageCompositeMasked",
          inputs: {
            destination: source.clip,
            source: ["generated_full", 0],
            x: 0,
            y: 0,
            resize_source: false,
            mask: ["mask_union", 0],
          },
        },
      } satisfies Graph,
    );
    result = ["composite", 0];
  }
  Object.assign(
    graph,
    saveVideoNodes("save_result", result, source.fps, source.audio, o.mode),
    {
      save_keyframe: {
        class_type: "SaveImage",
        inputs: {
          images: ["keyframe_decode", 0],
          filename_prefix: `open_cinema/${o.mode}_keyframe`,
        },
      },
    } satisfies Graph,
  );
  return graph;
}

export interface LtxEditPromptOptions {
  mode: LtxEditMode;
  /** Reference images after the frame itself. */
  references: number;
  /** The creator's own words for this revision. */
  direction: string;
  /** Restyle: the style in words, e.g. a Location's description. */
  style: string;
  /** Swap: what is replaced, and what replaces it. */
  original: string;
  replacement: string;
  /** Swap: the Thing's name. */
  name: string;
}

const ORDINALS = ["second", "third", "fourth", "fifth"];
const sentence = (text: string) => {
  const t = text.trim().replace(/[.\s]+$/, "");
  return t ? `${t[0]!.toUpperCase()}${t.slice(1)}.` : "";
};

/** Which images hold the references, in words FLUX.2 Klein follows. */
function referenceImages(count: number) {
  const names = ORDINALS.slice(0, Math.max(1, count)).map(
    (o) => `the ${o} image`,
  );
  return names.length === 1
    ? names[0]!
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}

/**
 * The keyframe instruction (FLUX.2 Klein, the frame is the first image) and
 * the clip prompt (LTX 2.3). Both keep the shot and change only what the mode
 * changes.
 */
export function ltxEditPrompts(o: LtxEditPromptOptions) {
  const refs = referenceImages(o.references);
  if (o.mode === "swap") {
    const original = o.original.trim().replace(/[.\s]+$/, "") || "the object";
    const thing = o.name.trim() || "object";
    const replacement = o.replacement.trim().replace(/[.\s]+$/, "") || thing;
    return {
      keyframePrompt: [
        `In the first image, replace ${original} with the ${thing} shown in ${refs}: ${replacement}.`,
        `Keep the ${thing}'s exact design, shape, colours and materials from the reference.`,
        `Place it where ${original} was, at a natural scale and the same perspective, with the scene's lighting, reflections and contact shadows.`,
        "Change nothing else: every person, their face, hands and clothing, the background and all other objects stay exactly as they are.",
        sentence(o.direction),
      ]
        .filter(Boolean)
        .join(" "),
      videoPrompt: [
        `The same shot as the first frame, with ${replacement} in place of ${original}.`,
        "The people, their movement and the camera move exactly as before; the object keeps its look in every frame, with natural lighting and shadows.",
        sentence(o.direction),
      ]
        .filter(Boolean)
        .join(" "),
      swap: { original, replacement: o.name.trim() || replacement },
    };
  }
  const style = o.style.trim().replace(/[.\s]+$/, "");
  return {
    keyframePrompt: [
      o.references
        ? `Restyle the first image in the visual style of ${refs}${style ? `: ${style}` : ""}.`
        : `Restyle the first image in this visual style: ${style}.`,
      "Keep the exact composition, framing and camera angle, every person's pose, expression and position, and the place of every object.",
      "Change only the look: palette, light, materials, texture and rendering.",
      sentence(o.direction),
    ]
      .filter(Boolean)
      .join(" "),
    videoPrompt: [
      sentence(style) || "The look of the first frame.",
      "The same shot and action as the first frame, held in this style in every frame, with the original movement and camera.",
      sentence(o.direction),
    ]
      .filter(Boolean)
      .join(" "),
    swap: undefined,
  };
}
