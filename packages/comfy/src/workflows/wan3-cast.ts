/**
 * Copy the moves with tagged people, as one Comfy Cloud graph. The studio
 * sends only where each person was clicked; the graph does the rest:
 *
 * 1. SAM 3.1 segments each tagged person from their click on the frame they
 *    were tagged on (`SAM3_Detect` with a point prompt).
 * 2. SAM 3.1's video tracker follows each of them through the whole clip,
 *    forwards from that frame and backwards to the start, so every person
 *    keeps one track (object locking) even where they cross or leave frame.
 * 3. The tracks become a "who is who" video: the clip with each tracked
 *    person filled in their own flat colour. That colour is the stable
 *    identifier the prompt uses: "the person filled in red in Video 2 becomes
 *    Cal". It replaces the single-frame cut-outs the Router path sends.
 * 4. Wan 3.0's own partner node runs inside the same graph with the clip as
 *    Video 1, the tracks as Video 2 and the Characters' references as images.
 *    Cloud uploads the media, polls Wan and keeps the run, so nothing waits
 *    on a single long Router request.
 * 5. The clip's own sound is laid under the result in the same graph.
 *
 * Model weights: SAM 3.1 (Meta, SAM licence) from Comfy Cloud's library; Wan
 * 3.0 is a hosted model billed through the Comfy API key.
 */

import type { Graph, Link } from "./ltx-graph";

/** The pipeline's id in job records. */
export const WAN3_CAST_MODEL_ID = "comfy-cloud/sam3-wan3-cast";
/** Every model the run uses, as the job records it (contracts/model-cards.ts). */
export const WAN3_CAST_JOB_MODEL = "SAM 3.1 + Wan 3.0";

/** SAM 3.1's multiplex checkpoint, as Comfy's `utility_video_segment_sam3` template loads it. */
export const SAM3_MODEL = "sam3.1_multiplex_fp16.safetensors";

export const WAN3_CAST_MEDIA_INPUTS = {
  source: { node: "source", field: "file" },
  /** Character (then Location) references, in prompt order. */
  reference: (i: number) => ({ node: `reference_${i}`, field: "image" }),
} as const;

/** SaveVideo nodes, in the order outputs are listed: the result, then the tracks. */
export const WAN3_CAST_OUTPUT_NODES = ["save_result", "save_tracks"] as const;

export const WAN3_CAST_LIMITS = {
  /**
   * Wan 3.0's partner node refuses more than 15 s of reference video in all,
   * so the tracks video takes what the clip leaves. A swap held only while
   * the tracks lasted: on 2026-10-23 a ball became the Storm Lantern for the
   * 5 s the tracks covered, then a ball again.
   */
  referenceSeconds: 15,
  /** Room left for the clip's measured length to round up. */
  slackSeconds: 0.25,
  /** Tracking runs on frames scaled to about this many megapixels. */
  workMegapixels: 0.4,
} as const;

/** Each tagged person's colour in the tracks video, by order of the swaps. */
export const TRACK_COLOURS = [
  { name: "red", rgb: 0xff1a1a },
  { name: "blue", rgb: 0x1a4dff },
  { name: "yellow", rgb: 0xffe01a },
  { name: "magenta", rgb: 0xff1aff },
] as const;

export interface CastTarget {
  /** Where they were clicked: 0–1 across and down the frame. */
  x: number;
  y: number;
  /** When, in seconds into the clip that is sent. */
  seconds: number;
  /**
   * The person's box on that frame, 0–1, when the studio's pose model found
   * them. A click alone can segment only what is under it (a shirt number);
   * the box makes SAM 3 take the whole person.
   */
  box?: { x: number; y: number; w: number; h: number } | undefined;
}

export interface Wan3CastOptions {
  targets: readonly CastTarget[];
  /** The stretch of the tracks video Wan sees, in seconds into the clip. */
  tracks: { start: number; seconds: number };
  /** Null builds the tracking part alone (the tracks video and nothing else). */
  wan: {
    prompt: string;
    /** Wan's spelling: "480P", "720P" or "1080P". */
    resolution: string;
    /** Whole seconds, or "auto". */
    duration: string;
    seed: number;
    /** Reference images loaded from WAN3_CAST_MEDIA_INPUTS.reference. */
    images: number;
    /** Lay the clip's sound under the result. */
    sound: boolean;
  } | null;
}

/**
 * The stretch of the clip the tracks video covers: as much as the reference
 * budget leaves, centred on the moments people were tagged.
 */
export function trackWindow(
  clipSeconds: number,
  tagged: readonly number[],
): { start: number; seconds: number } {
  const { referenceSeconds, slackSeconds } = WAN3_CAST_LIMITS;
  const seconds = Math.max(
    1,
    Math.min(
      clipSeconds,
      Math.floor((referenceSeconds - clipSeconds - slackSeconds) * 10) / 10,
    ),
  );
  const centre = tagged.length
    ? (Math.min(...tagged) + Math.max(...tagged)) / 2
    : clipSeconds / 2;
  const start = Math.max(
    0,
    Math.min(clipSeconds - seconds, centre - seconds / 2),
  );
  return { start: Math.round(start * 100) / 100, seconds };
}

/** ComfyMathExpression; its values must be named a, b, … in order. */
const math = (expression: string, values: Record<string, Link>) => ({
  class_type: "ComfyMathExpression",
  inputs: {
    expression,
    ...Object.fromEntries(
      Object.entries(values).map(([name, link]) => [`values.${name}`, link]),
    ),
  },
});
/** ComfyMathExpression's INT output. */
const int = (node: string): Link => [node, 1];
const fixed = (n: number) => Number(n.toFixed(4)).toString();

/**
 * The API-format graph. File inputs are left empty; the Cloud client sets them
 * to uploaded assets named by WAN3_CAST_MEDIA_INPUTS.
 */
export function wan3CastGraph(o: Wan3CastOptions): Graph {
  const graph: Graph = {
    source: { class_type: "LoadVideo", inputs: { file: "" } },
    source_parts: {
      class_type: "GetVideoComponents",
      inputs: { video: ["source", 0] },
    },
  };
  castTrackNodes(graph, {
    frames: ["source_parts", 0],
    fps: ["source_parts", 2],
    targets: o.targets,
    tracks: o.tracks,
  });
  if (!o.wan) return graph;

  for (let i = 0; i < o.wan.images; i++)
    graph[`reference_${i}`] = {
      class_type: "LoadImage",
      inputs: { image: "" },
    };
  graph.wan = {
    class_type: "Wan3ReferenceToVideoApi",
    inputs: {
      model: "wan3.0-video",
      "model.prompt": o.wan.prompt,
      "model.resolution": o.wan.resolution,
      "model.ratio": "adaptive",
      "model.duration": o.wan.duration,
      // The clip's own sound goes under the result below.
      "model.audio": false,
      // The words are ours on purpose; Wan's rewriting drifted from the clip.
      "model.prompt_extend": false,
      ...Object.fromEntries(
        Array.from({ length: o.wan.images }, (_, i) => [
          `model.reference_images.image${i + 1}`,
          [`reference_${i}`, 0],
        ]),
      ),
      "model.reference_videos.video1": ["source", 0],
      "model.reference_videos.video2": ["tracks_video", 0],
      seed: o.wan.seed,
      watermark: false,
    },
  };
  let result: Link = ["wan", 0];
  if (o.wan.sound) {
    graph.result_parts = {
      class_type: "GetVideoComponents",
      inputs: { video: result },
    };
    graph.result_video = {
      class_type: "CreateVideo",
      inputs: {
        images: ["result_parts", 0],
        fps: ["result_parts", 2],
        audio: ["source_parts", 1],
      },
    };
    result = ["result_video", 0];
  }
  graph.save_result = {
    class_type: "SaveVideo",
    inputs: {
      video: result,
      filename_prefix: "open_cinema/cast",
      format: "mp4",
      "format.codec": "h264",
      "format.codec.encoding": "re-encode",
      "format.codec.encoding.crf": 16,
    },
  };
  return graph;
}

export interface CastTrackOptions {
  /** The clip's frames and frame rate, as the graph has loaded them. */
  frames: Link;
  fps: Link;
  targets: readonly CastTarget[];
  /** The stretch the tracks video covers; null for the whole clip. */
  tracks: { start: number; seconds: number } | null;
}

/**
 * Adds SAM 3.1's tracking to a graph that has loaded the clip: each target is
 * segmented from its click, tracked forwards and backwards from that frame,
 * and filled in its own colour over the clip. Writes `tracks_video` (a VIDEO)
 * and saves it as `save_tracks`; `tracks_frames` holds its frames. Returns
 * each target's mask over the whole clip, at the tracking size.
 */
export function castTrackNodes(graph: Graph, o: CastTrackOptions): Link[] {
  if (!o.targets.length) throw new Error("Tag someone to replace first");
  if (o.targets.length > TRACK_COLOURS.length)
    throw new Error(`Up to ${TRACK_COLOURS.length} people per run`);
  const { frames, fps } = o;
  const work: Link = ["work", 0];
  const width: Link = ["work_size", 0];
  const height: Link = ["work_size", 1];
  const count: Link = ["work_size", 2];
  const sam: Link = ["sam", 0];

  Object.assign(graph, {
    // SAM 3 reads every frame at 1008 px square; smaller frames keep a 10 s
    // clip and its reversed copies well inside memory.
    work: {
      class_type: "ImageScaleToTotalPixels",
      inputs: {
        image: frames,
        upscale_method: "bilinear",
        megapixels: WAN3_CAST_LIMITS.workMegapixels,
        resolution_steps: 2,
      },
    },
    work_size: { class_type: "GetImageSize", inputs: { image: work } },
    sam: {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: SAM3_MODEL },
    },
  } satisfies Graph);

  // People tagged on the same frame share one tracking pass each way.
  const groups = new Map<number, number[]>();
  o.targets.forEach((t, i) => {
    const key = Math.round(t.seconds * 100);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });

  const tracks: Link[] = [];
  for (const [key, members] of groups) {
    const g = `g${key}`;
    // The tagged frame, kept off the first and last frame so both passes
    // have at least two frames.
    graph[`${g}_index`] = math(
      `max(1, min(a - 2, round(${fixed(key / 100)} * b)))`,
      { a: count, b: fps },
    );
    const index = int(`${g}_index`);
    graph[`${g}_frame`] = {
      class_type: "ImageFromBatch",
      inputs: { image: work, batch_index: index, length: 1 },
    };
    const masks: Link[] = members.map((i) => {
      const p = `p${i}`;
      const t = o.targets[i]!;
      graph[`${p}_x`] = math(`round(${fixed(t.x)} * a)`, { a: width });
      graph[`${p}_y`] = math(`round(${fixed(t.y)} * a)`, { a: height });
      graph[`${p}_point`] = {
        class_type: "StringFormat",
        inputs: {
          "values.a": int(`${p}_x`),
          "values.b": int(`${p}_y`),
          f_string: '[{{"x": {a}, "y": {b}}}]',
        },
      };
      graph[`${p}_detect`] = {
        class_type: "SAM3_Detect",
        inputs: {
          model: sam,
          image: [`${g}_frame`, 0],
          threshold: 0.5,
          refine_iterations: 2,
          // The click's mask and the box's, as one.
          individual_masks: false,
          positive_coords: [`${p}_point`, 0],
        },
      };
      if (t.box) {
        const side = (name: string, expression: string, size: Link) =>
          (graph[`${p}_box_${name}`] = math(expression, { a: size }));
        const { x, y, w, h } = t.box;
        side("x", `max(0, round(${fixed(x)} * a))`, width);
        side("y", `max(0, round(${fixed(y)} * a))`, height);
        side("w", `max(1, round(${fixed(w)} * a))`, width);
        side("h", `max(1, round(${fixed(h)} * a))`, height);
        graph[`${p}_box`] = {
          class_type: "PrimitiveBoundingBox",
          inputs: {
            x: int(`${p}_box_x`),
            y: int(`${p}_box_y`),
            width: int(`${p}_box_w`),
            height: int(`${p}_box_h`),
          },
        };
        graph[`${p}_detect`]!.inputs.bboxes = [`${p}_box`, 0];
      }
      return [`${p}_detect`, 0];
    });
    graph[`${g}_masks`] = {
      class_type: "BatchMasksNode",
      inputs: Object.fromEntries(
        masks.map((link, i) => [`masks.mask${i}`, link]),
      ),
    };
    const track = (images: Link) => ({
      class_type: "SAM3_VideoTrack",
      inputs: {
        images,
        model: sam,
        initial_mask: [`${g}_masks`, 0],
        detection_threshold: 0.5,
        max_objects: members.length,
        detect_interval: 1,
      },
    });
    // Forwards: the tagged frame to the end.
    graph[`${g}_ahead`] = {
      class_type: "ImageFromBatch",
      inputs: { image: work, batch_index: index, length: 4096 },
    };
    graph[`${g}_forward`] = track([`${g}_ahead`, 0]);
    // Backwards: the tagged frame back to the start.
    graph[`${g}_before_length`] = math("a + 1", { a: index });
    graph[`${g}_before`] = {
      class_type: "ImageFromBatch",
      inputs: {
        image: work,
        batch_index: 0,
        length: int(`${g}_before_length`),
      },
    };
    graph[`${g}_behind`] = {
      class_type: "ReverseImageBatch",
      inputs: { images: [`${g}_before`, 0] },
    };
    graph[`${g}_backward`] = track([`${g}_behind`, 0]);

    members.forEach((i, slot) => {
      const p = `p${i}`;
      const pick = (pass: string) => ({
        class_type: "SAM3_TrackToMask",
        inputs: { track_data: [`${g}_${pass}`, 0], object_indices: `${slot}` },
      });
      graph[`${p}_forward`] = pick("forward");
      graph[`${p}_backward`] = pick("backward");
      graph[`${p}_forward_image`] = {
        class_type: "MaskToImage",
        inputs: { mask: [`${p}_forward`, 0] },
      };
      graph[`${p}_backward_image`] = {
        class_type: "MaskToImage",
        inputs: { mask: [`${p}_backward`, 0] },
      };
      graph[`${p}_backward_ordered`] = {
        class_type: "ReverseImageBatch",
        inputs: { images: [`${p}_backward_image`, 0] },
      };
      // The backward pass ends on the tagged frame, which the forward pass starts on.
      graph[`${p}_earlier`] = {
        class_type: "ImageFromBatch",
        inputs: {
          image: [`${p}_backward_ordered`, 0],
          batch_index: 0,
          length: index,
        },
      };
      graph[`${p}_whole`] = {
        class_type: "ImageBatch",
        inputs: {
          image1: [`${p}_earlier`, 0],
          image2: [`${p}_forward_image`, 0],
        },
      };
      graph[`${p}_track`] = {
        class_type: "ImageToMask",
        inputs: { image: [`${p}_whole`, 0], channel: "red" },
      };
      tracks[i] = [`${p}_track`, 0];
    });
  }

  // Each person filled in their own colour, everyone and everything else as filmed.
  let guide: Link = work;
  o.targets.forEach((_, i) => {
    graph[`colour_${i}`] = {
      class_type: "EmptyImage",
      inputs: {
        width,
        height,
        batch_size: 1,
        color: TRACK_COLOURS[i]!.rgb,
      },
    };
    graph[`fill_${i}`] = {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: guide,
        source: [`colour_${i}`, 0],
        x: 0,
        y: 0,
        resize_source: false,
        mask: tracks[i]!,
      },
    };
    guide = [`fill_${i}`, 0];
  });
  if (o.tracks) {
    graph.tracks_start = math(`round(${fixed(o.tracks.start)} * a)`, {
      a: fps,
    });
    graph.tracks_length = math(
      `max(1, round(${fixed(o.tracks.seconds)} * a))`,
      { a: fps },
    );
    graph.tracks_frames = {
      class_type: "ImageFromBatch",
      inputs: {
        image: guide,
        batch_index: int("tracks_start"),
        length: int("tracks_length"),
      },
    };
  } else {
    // The whole clip: the batch passes through unchanged.
    graph.tracks_frames = {
      class_type: "ImageFromBatch",
      inputs: { image: guide, batch_index: 0, length: count },
    };
  }
  graph.tracks_video = {
    class_type: "CreateVideo",
    inputs: { images: ["tracks_frames", 0], fps },
  };
  graph.save_tracks = {
    class_type: "SaveVideo",
    inputs: {
      video: ["tracks_video", 0],
      filename_prefix: "open_cinema/cast_tracks",
      format: "mp4",
      "format.codec": "h264",
      "format.codec.encoding": "re-encode",
      "format.codec.encoding.crf": 20,
    },
  };
  return tracks;
}
