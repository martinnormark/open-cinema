import {
  LTX23_MODELS,
  ltxSamplerNodes,
  saveVideoNodes,
  sourceClipNodes,
  type Graph,
  type GraphLimits,
  type Link,
} from "./ltx-graph";
import { LTX_VFX_MODELS } from "./ltx-vfx";

/**
 * Fill graphs: LTX 2.3 with one of Lightricks' fill IC-LoRAs regenerates only
 * part of a take, and the take's own pixels are put back everywhere else.
 *
 *   area     a brushed region, regenerated from the creator's words
 *   moment   a stretch of time, regenerated so it joins the take at both ends
 *   reframe  the take on a new aspect, the new edges drawn in (outpainting)
 *
 * Area and moment use the In-Outpainting IC-LoRA the re-stage fill uses:
 * the region to redo is painted green (`LTXVInpaintPreprocess`) and the rest
 * of the take guides the fill. Reframe follows Comfy-Org's
 * template_ltx2_3_lora_video_outpainting: the dedicated outpaint IC-LoRA on
 * the dev model with the distilled LoRA at half strength, the take padded
 * with black, and the guide and result passed through a gamma of 2 and 0.5.
 */
export const LTX_FILL_MODEL_ID = "comfy-cloud/ltx-2.3-fill";

export const LTX_FILL_MODELS = {
  fill: "ltx-2.3-22b-ic-lora-in-outpainting-0.9.safetensors",
  outpaint: "ltx-2.3-22b-ic-lora-outpaint.safetensors",
} as const;

export type FillMode = "area" | "moment" | "reframe" | "extend";

export const LTX_FILL_LIMITS: Record<FillMode, GraphLimits> = {
  // 81 frames, as Wan VACE makes when the area gets something new.
  area: { maxFrames: 81, maxSide: 768 },
  // The window around the moment; the rest of the take is spliced back.
  moment: { maxFrames: 97, maxSide: 768 },
  // The outpaint IC-LoRA was trained around 960 × 544.
  reframe: { maxFrames: 97, maxSide: 960 },
  // The take's last 17 frames lead into 80 new ones.
  extend: { maxFrames: 97, maxSide: 768 },
};

/** Frames of the take's ending that the continuation starts from. */
const EXTEND_LEAD = 17;

export const LTX_FILL_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
  mask: { node: "mask", field: "image" },
} as const;
export const LTX_FILL_OUTPUT_NODES = ["save_result"] as const;

/** Frames of untouched take kept on each side of a moment, as context. */
const MOMENT_CONTEXT = 8;

export interface LtxFillGraphOptions {
  mode: FillMode;
  /** What the region, moment or new edges should show. */
  prompt: string;
  seed: number;
  /** Moment: the stretch to redo, in seconds from the start of the take. */
  range?: { start: number; end: number } | undefined;
  /** Reframe: the new aspect as width over height, such as 9 / 16. */
  aspect?: number | undefined;
  /**
   * Reframe: `whole` keeps every pixel of the take and draws all the new
   * picture; `halfway` crops the take halfway to the new aspect first, so
   * half the change is a crop and half is new picture.
   */
  fit?: "whole" | "halfway" | undefined;
  /** Fewer frames for a cheap check run; never set by the app. */
  limits?: GraphLimits;
}

const math = (expression: string, values: Record<string, Link | number>) => ({
  class_type: "ComfyMathExpression",
  inputs: {
    expression,
    ...Object.fromEntries(
      Object.entries(values).map(([name, v]) => [`values.${name}`, v]),
    ),
  },
});

const gamma = (image: Link, value: number) => ({
  class_type: "Float32ColorCorrect",
  inputs: {
    image,
    exposure: 0,
    contrast: 1,
    brightness: 0,
    saturation: 1,
    gamma: value,
  },
});

const OUTPAINT_NEGATIVE =
  "pc game, console game, video game, ugly, 3d render, still, static, slow, black bars, letterbox, border, frame, split screen";

/** Regenerates a brushed region of the first four seconds. */
function areaGraph(o: LtxFillGraphOptions, limits: GraphLimits): Graph {
  const source = sourceClipNodes(limits);
  const graph: Graph = {
    ...source.nodes,
    mask: { class_type: "LoadImage", inputs: { image: "" } },
    mask_small: {
      class_type: "ImageScale",
      inputs: {
        image: ["mask", 0],
        upscale_method: "area",
        width: source.genWidth,
        height: source.genHeight,
        crop: "disabled",
      },
    },
    mask_small_channel: {
      class_type: "ImageToMask",
      inputs: { image: ["mask_small", 0], channel: "red" },
    },
    // A little room past the brush, so the fill reaches past its edge.
    mask_grown: {
      class_type: "LTXVDilateVideoMask",
      inputs: {
        mask: ["mask_small_channel", 0],
        spatial_radius: 8,
        temporal_radius: 0,
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
        expand: 12,
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
    fill_reference: {
      class_type: "LTXVInpaintPreprocess",
      inputs: { images: source.small, mask: ["mask_grown", 0] },
    },
  };
  const ltx = ltxSamplerNodes({
    id: "ltx",
    checkpoint: LTX23_MODELS.checkpoint,
    textEncoder: LTX23_MODELS.textEncoder,
    loras: [{ name: LTX_FILL_MODELS.fill, strength: 1 }],
    prompt: o.prompt.trim(),
    width: source.genWidth,
    height: source.genHeight,
    length: source.length,
    fps: source.fps,
    seed: o.seed,
    guide: { image: ["fill_reference", 0], strength: 1 },
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
    // The generation shows through the brushed region and its soft edge
    // only; every other pixel is the take's own.
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
      "fill_area",
    ),
  } satisfies Graph);
  return graph;
}

/**
 * Regenerates a stretch of time anywhere in the take. A window of up to 97
 * frames around the moment is generated with the moment painted out, so the
 * frames either side guide it in and out; the window is then spliced back
 * into the whole take at full size, with the take's sound.
 */
function momentGraph(o: LtxFillGraphOptions, limits: GraphLimits): Graph {
  if (!o.range) throw new Error("Choose the moment to redo");
  const max = limits.maxFrames;
  const frames: Link = ["source_frames", 0];
  const fps: Link = ["source_frames", 2];
  const graph: Graph = {
    source: { class_type: "LoadVideo", inputs: { file: "" } },
    source_frames: {
      class_type: "GetVideoComponents",
      inputs: { video: ["source", 0] },
    },
    source_size: { class_type: "GetImageSize", inputs: { image: frames } },
    // The window: 8n+1 frames, no longer than the take.
    window_length: math(`max(9, ((min(a, ${max}) - 1) // 8) * 8 + 1)`, {
      a: ["source_size", 2],
    }),
    // The moment, kept one frame inside the take so both ends join it.
    moment_start: math("min(max(1, round(a * b)), c - 2)", {
      a: o.range.start,
      b: fps,
      c: ["source_size", 2],
    }),
    moment_end: math(
      `min(max(d + 1, round(a * b)), c - 1, d + e - ${2 * MOMENT_CONTEXT})`,
      {
        a: o.range.end,
        b: fps,
        c: ["source_size", 2],
        d: ["moment_start", 1],
        e: ["window_length", 1],
      },
    ),
    moment_length: math("b - a", {
      a: ["moment_start", 1],
      b: ["moment_end", 1],
    }),
    // Centred on the moment, inside the take.
    window_start: math("max(0, min(c - e, (a + b) // 2 - e // 2))", {
      a: ["moment_start", 1],
      b: ["moment_end", 1],
      c: ["source_size", 2],
      e: ["window_length", 1],
    }),
    moment_offset: math("a - b", {
      a: ["moment_start", 1],
      b: ["window_start", 1],
    }),
    gen_width: math(
      `max(64, round(a * min(1, ${limits.maxSide} / max(a, b)) / 32) * 32)`,
      { a: ["source_size", 0], b: ["source_size", 1] },
    ),
    gen_height: math(
      `max(64, round(b * min(1, ${limits.maxSide} / max(a, b)) / 32) * 32)`,
      { a: ["source_size", 0], b: ["source_size", 1] },
    ),
    window: {
      class_type: "ImageFromBatch",
      inputs: {
        image: frames,
        batch_index: ["window_start", 1],
        length: ["window_length", 1],
      },
    },
    window_small: {
      class_type: "ImageScale",
      inputs: {
        image: ["window", 0],
        upscale_method: "bilinear",
        width: ["gen_width", 1],
        height: ["gen_height", 1],
        crop: "disabled",
      },
    },
    // Three frames either side change hands where the fill still matches
    // the take, so the cut in and out does not show.
    switch_start: math("max(0, a - 3)", { a: ["moment_offset", 1] }),
    switch_length: math("min(c, a + b + 3) - max(0, a - 3)", {
      a: ["moment_offset", 1],
      b: ["moment_length", 1],
      c: ["window_length", 1],
    }),
    switch_at: math("a + b", {
      a: ["window_start", 1],
      b: ["switch_start", 1],
    }),
  };
  // Keyframes: the two frames either side of the moment, pinned in place.
  const keys: [string, Link][] = [
    ["key_before_far", ["key_before_far_at", 1]],
    ["key_before", ["key_before_at", 1]],
    ["key_after", ["key_after_at", 1]],
    ["key_after_far", ["key_after_far_at", 1]],
  ];
  Object.assign(graph, {
    key_before_far_at: math("max(0, a - 4)", { a: ["moment_offset", 1] }),
    key_before_at: math("a - 1", { a: ["moment_offset", 1] }),
    key_after_at: math("a + b", {
      a: ["moment_offset", 1],
      b: ["moment_length", 1],
    }),
    key_after_far_at: math("min(c - 1, a + b + 3)", {
      a: ["moment_offset", 1],
      b: ["moment_length", 1],
      c: ["window_length", 1],
    }),
  } satisfies Graph);
  for (const [id, at] of keys)
    graph[id] = {
      class_type: "ImageFromBatch",
      inputs: { image: ["window_small", 0], batch_index: at, length: 1 },
    };
  const ltx = ltxSamplerNodes({
    id: "ltx",
    checkpoint: LTX23_MODELS.checkpoint,
    textEncoder: LTX23_MODELS.textEncoder,
    loras: [],
    prompt: o.prompt.trim(),
    width: ["gen_width", 1],
    height: ["gen_height", 1],
    length: ["window_length", 1],
    fps,
    seed: o.seed,
    keyframes: keys.map(([id, at]) => ({
      image: [id, 0],
      frame: at,
      strength: 1,
    })),
  });
  Object.assign(graph, ltx.nodes, {
    generated_full: {
      class_type: "ImageScale",
      inputs: {
        image: ltx.frames,
        upscale_method: "lanczos",
        width: ["source_size", 0],
        height: ["source_size", 1],
        crop: "disabled",
      },
    },
    redone: {
      class_type: "ImageFromBatch",
      inputs: {
        image: ["generated_full", 0],
        batch_index: ["switch_start", 1],
        length: ["switch_length", 1],
      },
    },
    kept: {
      class_type: "ImageFromBatch",
      inputs: {
        image: frames,
        batch_index: ["switch_at", 1],
        length: ["switch_length", 1],
      },
    },
    // A three-frame dissolve at each end, over frames where the fill still
    // matches the take.
    fade_1: {
      class_type: "EmptyImage",
      inputs: {
        width: ["source_size", 0],
        height: ["source_size", 1],
        batch_size: 1,
        color: 0x404040,
      },
    },
    fade_2: {
      class_type: "EmptyImage",
      inputs: {
        width: ["source_size", 0],
        height: ["source_size", 1],
        batch_size: 1,
        color: 0x808080,
      },
    },
    fade_3: {
      class_type: "EmptyImage",
      inputs: {
        width: ["source_size", 0],
        height: ["source_size", 1],
        batch_size: 1,
        color: 0xc0c0c0,
      },
    },
    fade_full_length: math("max(1, a - 6)", { a: ["switch_length", 1] }),
    fade_full: {
      class_type: "EmptyImage",
      inputs: {
        width: ["source_size", 0],
        height: ["source_size", 1],
        batch_size: ["fade_full_length", 1],
        color: 0xffffff,
      },
    },
    fade_in_12: {
      class_type: "ImageBatch",
      inputs: { image1: ["fade_1", 0], image2: ["fade_2", 0] },
    },
    fade_in: {
      class_type: "ImageBatch",
      inputs: { image1: ["fade_in_12", 0], image2: ["fade_3", 0] },
    },
    fade_out_32: {
      class_type: "ImageBatch",
      inputs: { image1: ["fade_3", 0], image2: ["fade_2", 0] },
    },
    fade_out: {
      class_type: "ImageBatch",
      inputs: { image1: ["fade_out_32", 0], image2: ["fade_1", 0] },
    },
    fade_head: {
      class_type: "ImageBatch",
      inputs: { image1: ["fade_in", 0], image2: ["fade_full", 0] },
    },
    fade_all: {
      class_type: "ImageBatch",
      inputs: { image1: ["fade_head", 0], image2: ["fade_out", 0] },
    },
    fade_frames: {
      class_type: "ImageFromBatch",
      inputs: {
        image: ["fade_all", 0],
        batch_index: 0,
        length: ["switch_length", 1],
      },
    },
    fade: {
      class_type: "ImageToMask",
      inputs: { image: ["fade_frames", 0], channel: "red" },
    },
    dissolved: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: ["kept", 0],
        source: ["redone", 0],
        x: 0,
        y: 0,
        resize_source: false,
        mask: ["fade", 0],
      },
    },
    result: {
      class_type: "ReplaceImagesInBatch",
      inputs: {
        start_index: ["switch_at", 1],
        original_images: frames,
        replacement_images: ["dissolved", 0],
      },
    },
    ...saveVideoNodes(
      "save_result",
      ["result", 0],
      fps,
      ["source_frames", 1],
      "fill_moment",
    ),
  } satisfies Graph);
  return graph;
}

/** The take on a new aspect, its new edges drawn in. */
function reframeGraph(o: LtxFillGraphOptions, limits: GraphLimits): Graph {
  const aspect = o.aspect ?? 9 / 16;
  if (!(aspect > 0)) throw new Error("Choose the new aspect");
  const source = sourceClipNodes(limits);
  const W = source.width;
  const H = source.height;
  const graph: Graph = { ...source.nodes };
  // Halfway: crop the take to the aspect between its own and the new one.
  if (o.fit === "halfway") {
    Object.assign(graph, {
      inner_aspect: math("sqrt(a / b * c)", { a: W, b: H, c: aspect }),
      crop_width: math("round(min(a, b * c) / 2) * 2", {
        a: W,
        b: H,
        c: ["inner_aspect", 0],
      }),
      crop_height: math("round(min(b, a / c) / 2) * 2", {
        a: W,
        b: H,
        c: ["inner_aspect", 0],
      }),
      crop: {
        class_type: "ImageCrop",
        inputs: {
          image: source.clip,
          width: ["crop_width", 1],
          height: ["crop_height", 1],
          x: ["crop_x", 1],
          y: ["crop_y", 1],
        },
      },
      crop_x: math("(a - b) // 2", { a: W, b: ["crop_width", 1] }),
      crop_y: math("(a - b) // 2", { a: H, b: ["crop_height", 1] }),
    } satisfies Graph);
  }
  const take: Link = o.fit === "halfway" ? ["crop", 0] : source.clip;
  const tw: Link = o.fit === "halfway" ? ["crop_width", 1] : W;
  const th: Link = o.fit === "halfway" ? ["crop_height", 1] : H;
  Object.assign(graph, {
    canvas_width: math("round(max(a, b * c) / 2) * 2", {
      a: tw,
      b: th,
      c: aspect,
    }),
    canvas_height: math("round(max(b, a / c) / 2) * 2", {
      a: tw,
      b: th,
      c: aspect,
    }),
    offset_x: math("(a - b) // 2", { a: ["canvas_width", 1], b: tw }),
    offset_y: math("(a - b) // 2", { a: ["canvas_height", 1], b: th }),
    gen_width: math(
      `max(64, round(a * min(1, ${limits.maxSide} / max(a, b)) / 32) * 32)`,
      { a: ["canvas_width", 1], b: ["canvas_height", 1] },
    ),
    gen_height: math(
      `max(64, round(b * min(1, ${limits.maxSide} / max(a, b)) / 32) * 32)`,
      { a: ["canvas_width", 1], b: ["canvas_height", 1] },
    ),
    // The result is as long on its long side as the take was.
    out_width: math("round(a * min(1, max(c, d) / max(a, b)) / 2) * 2", {
      a: ["canvas_width", 1],
      b: ["canvas_height", 1],
      c: W,
      d: H,
    }),
    out_height: math("round(b * min(1, max(c, d) / max(a, b)) / 2) * 2", {
      a: ["canvas_width", 1],
      b: ["canvas_height", 1],
      c: W,
      d: H,
    }),
    canvas: {
      class_type: "EmptyImage",
      inputs: {
        width: ["canvas_width", 1],
        height: ["canvas_height", 1],
        batch_size: source.length,
        color: 0,
      },
    },
    padded: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: ["canvas", 0],
        source: take,
        x: ["offset_x", 1],
        y: ["offset_y", 1],
        resize_source: false,
      },
    },
    padded_small: {
      class_type: "ImageScale",
      inputs: {
        image: ["padded", 0],
        upscale_method: "area",
        width: ["gen_width", 1],
        height: ["gen_height", 1],
        crop: "disabled",
      },
    },
    guide: gamma(["padded_small", 0], 2),
  } satisfies Graph);
  const ltx = ltxSamplerNodes({
    id: "ltx",
    checkpoint: LTX_VFX_MODELS.checkpoint,
    textEncoder: LTX23_MODELS.textEncoder,
    loras: [
      { name: LTX_VFX_MODELS.distilled, strength: 0.5 },
      { name: LTX_FILL_MODELS.outpaint, strength: 1 },
    ],
    prompt: o.prompt.trim(),
    negative: OUTPAINT_NEGATIVE,
    width: ["gen_width", 1],
    height: ["gen_height", 1],
    length: source.length,
    fps: source.fps,
    seed: o.seed,
    guide: { image: ["guide", 0], strength: 1 },
  });
  Object.assign(graph, ltx.nodes, {
    generated: gamma(ltx.frames, 0.5),
    generated_full: {
      class_type: "ImageScale",
      inputs: {
        image: ["generated", 0],
        upscale_method: "lanczos",
        width: ["canvas_width", 1],
        height: ["canvas_height", 1],
        crop: "disabled",
      },
    },
    // The take's own pixels go back in the middle, feathered where they
    // meet the new picture.
    keep: {
      class_type: "SolidMask",
      inputs: { value: 1, width: tw, height: th },
    },
    feather_x: math("min(24, a)", { a: ["offset_x", 1] }),
    feather_y: math("min(24, a)", { a: ["offset_y", 1] }),
    keep_feathered: {
      class_type: "FeatherMask",
      inputs: {
        mask: ["keep", 0],
        left: ["feather_x", 1],
        top: ["feather_y", 1],
        right: ["feather_x", 1],
        bottom: ["feather_y", 1],
      },
    },
    composite: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: ["generated_full", 0],
        source: take,
        x: ["offset_x", 1],
        y: ["offset_y", 1],
        resize_source: false,
        mask: ["keep_feathered", 0],
      },
    },
    result: {
      class_type: "ImageScale",
      inputs: {
        image: ["composite", 0],
        upscale_method: "lanczos",
        width: ["out_width", 1],
        height: ["out_height", 1],
        crop: "disabled",
      },
    },
    ...saveVideoNodes(
      "save_result",
      ["result", 0],
      source.fps,
      source.audio,
      "fill_reframe",
    ),
  } satisfies Graph);
  return graph;
}

/**
 * Continues a take past its last frame: its final 17 frames are pinned at the
 * start of a new clip and LTX 2.3 plays on from them. The new frames follow
 * the whole take at its size, with its sound for as long as it lasts.
 */
function extendGraph(o: LtxFillGraphOptions, limits: GraphLimits): Graph {
  const frames: Link = ["source_frames", 0];
  const fps: Link = ["source_frames", 2];
  const graph: Graph = {
    source: { class_type: "LoadVideo", inputs: { file: "" } },
    source_frames: {
      class_type: "GetVideoComponents",
      inputs: { video: ["source", 0] },
    },
    source_size: { class_type: "GetImageSize", inputs: { image: frames } },
    gen_width: math(
      `max(64, round(a * min(1, ${limits.maxSide} / max(a, b)) / 32) * 32)`,
      { a: ["source_size", 0], b: ["source_size", 1] },
    ),
    gen_height: math(
      `max(64, round(b * min(1, ${limits.maxSide} / max(a, b)) / 32) * 32)`,
      { a: ["source_size", 0], b: ["source_size", 1] },
    ),
    lead: {
      class_type: "ImageFromBatch",
      inputs: { image: frames, batch_index: -EXTEND_LEAD, length: EXTEND_LEAD },
    },
    lead_small: {
      class_type: "ImageScale",
      inputs: {
        image: ["lead", 0],
        upscale_method: "bilinear",
        width: ["gen_width", 1],
        height: ["gen_height", 1],
        crop: "disabled",
      },
    },
  };
  const ltx = ltxSamplerNodes({
    id: "ltx",
    checkpoint: LTX23_MODELS.checkpoint,
    textEncoder: LTX23_MODELS.textEncoder,
    loras: [],
    prompt: o.prompt.trim(),
    width: ["gen_width", 1],
    height: ["gen_height", 1],
    length: limits.maxFrames,
    fps,
    seed: o.seed,
    keyframes: [{ image: ["lead_small", 0], frame: 0, strength: 1 }],
  });
  Object.assign(graph, ltx.nodes, {
    added: {
      class_type: "ImageFromBatch",
      inputs: {
        image: ltx.frames,
        batch_index: EXTEND_LEAD,
        length: limits.maxFrames - EXTEND_LEAD,
      },
    },
    added_full: {
      class_type: "ImageScale",
      inputs: {
        image: ["added", 0],
        upscale_method: "lanczos",
        width: ["source_size", 0],
        height: ["source_size", 1],
        crop: "disabled",
      },
    },
    result: {
      class_type: "ImageBatch",
      inputs: { image1: frames, image2: ["added_full", 0] },
    },
    ...saveVideoNodes(
      "save_result",
      ["result", 0],
      fps,
      ["source_frames", 1],
      "fill_extend",
    ),
  } satisfies Graph);
  return graph;
}

export function ltxFillGraph(o: LtxFillGraphOptions): Graph {
  const limits = o.limits ?? LTX_FILL_LIMITS[o.mode];
  switch (o.mode) {
    case "area":
      return areaGraph(o, limits);
    case "moment":
      return momentGraph(o, limits);
    case "reframe":
      return reframeGraph(o, limits);
    case "extend":
      return extendGraph(o, limits);
  }
}
