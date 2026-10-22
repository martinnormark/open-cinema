import type { MediaOperation } from "./types";

/**
 * The media steps no Router model offers, as ComfyUI graphs run on Comfy Cloud
 * (docs/background-job.md). They use core nodes plus VideoHelperSuite's ffmpeg
 * loader, which Cloud ships: it resamples a clip onto another frame rate and
 * reads a VP9 matte's alpha plane.
 *
 * Every output is on the source's exact frame rate and frame count, at its
 * display size with square pixels, and carries the source's audio:
 *
 *   lock     source, edit, matte -> the source foreground over the edit
 *   conform  source, edit        -> the edit on the source's frame grid
 *   square   source              -> the source with square pixels
 *   append   source, edit        -> the source, then the edit on its grid
 *   dub      source, edit        -> the edit as made, with the source's audio
 *
 * `append` is the one exception to the frame count: it is the source's frames
 * followed by every frame of the edit (a continuation of the take). `dub`
 * keeps the edit's own size and frame rate: a new shot that only borrows the
 * source's sound, such as a Character copying a dance to its music.
 */

/** API-graph loader node per part; the client fills in the uploaded file name. */
export const MEDIA_GRAPH_INPUTS = {
  source: { node: "source", field: "file" },
  edit: { node: "edit", field: "video" },
  matte: { node: "matte", field: "video" },
} as const;
export type MediaPartName = keyof typeof MEDIA_GRAPH_INPUTS;

/** The SaveVideo node holding each operation's output. */
export const MEDIA_GRAPH_OUTPUT = "save";

export const MEDIA_GRAPH_PARTS: Record<
  MediaOperation,
  readonly MediaPartName[]
> = {
  lock: ["source", "edit", "matte"],
  conform: ["source", "edit"],
  square: ["source"],
  append: ["source", "edit"],
  dub: ["source", "edit"],
};

export interface MediaGraphOptions {
  operation: MediaOperation;
  /** Uploaded file name of each part the operation reads. */
  files: Partial<Record<MediaPartName, string>>;
  /** The source's sample aspect (display width over stored width); 1 when unknown. */
  pixelAspect?: number | null | undefined;
}

type Link = [string, number];
type Graph = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;

const math = (expression: string, values: Record<string, Link>) => ({
  class_type: "ComfyMathExpression",
  inputs: {
    expression,
    ...Object.fromEntries(
      Object.entries(values).map(([name, link]) => [`values.${name}`, link]),
    ),
  },
});
const fit = (image: Link, width: Link, height: Link, method = "bicubic") => ({
  class_type: "ImageScale",
  inputs: { image, upscale_method: method, width, height, crop: "disabled" },
});
/** VideoHelperSuite's ffmpeg loader, resampled to `rate` (nearest frame in time). */
const loadOnGrid = (video: string, rate: Link | 0) => ({
  class_type: "VHS_LoadVideoFFmpeg",
  inputs: {
    video,
    force_rate: rate,
    custom_width: 0,
    custom_height: 0,
    frame_load_cap: 0,
    start_time: 0,
    // "None": no model-specific rounding of size or frame count.
    format: "None",
  },
});

export function mediaGraph(options: MediaGraphOptions): Graph {
  const { operation, files } = options;
  for (const part of MEDIA_GRAPH_PARTS[operation])
    if (!files[part]) throw new Error(`The ${part} clip is missing`);
  const sar =
    options.pixelAspect && options.pixelAspect > 0 ? options.pixelAspect : 1;
  // Each IMAGE batch is a full float copy of the clip in Cloud's memory, so the
  // source is only resampled when its pixels are not square.
  const squarePixels = Math.abs(sar - 1) <= 0.001;
  const frames: Link = ["source_frames", 0];
  const fps: Link = ["source_frames", 2];
  const count: Link = ["source_size", 2];
  const width: Link = ["width", 1];
  const height: Link = ["height", 1];

  if (operation === "dub") return dubGraph(files.source!, files.edit!);

  const graph: Graph = {
    source: { class_type: "LoadVideo", inputs: { file: files.source } },
    source_frames: {
      class_type: "GetVideoComponents",
      inputs: { video: ["source", 0] },
    },
    source_size: { class_type: "GetImageSize", inputs: { image: frames } },
    // The display size (what a player shows), even-sized for H.264.
    width: math(`max(2, round(a * ${sar} / 2) * 2)`, {
      a: ["source_size", 0],
    }),
    height: math("max(2, round(a / 2) * 2)", { a: ["source_size", 1] }),
    source_fit: fit(frames, width, height),
    video: {
      class_type: "CreateVideo",
      inputs: { images: ["result", 0], fps, audio: ["source_frames", 1] },
    },
    [MEDIA_GRAPH_OUTPUT]: {
      class_type: "SaveVideo",
      inputs: {
        video: ["video", 0],
        filename_prefix: `open_cinema/${operation}`,
        format: "mp4",
        "format.codec": "h264",
        "format.codec.encoding": "re-encode",
        "format.codec.encoding.crf": 16,
      },
    },
  };
  if (operation === "square") {
    graph.result = graph.source_fit!;
    delete graph.source_fit;
    return graph;
  }
  if (squarePixels) delete graph.source_fit;

  // Generated video drifts from the take: Kling returns 24 fps and up to two
  // frames short. Each source frame takes the edit frame nearest in time, and
  // the last edit frame is held if the edit ends early.
  Object.assign(graph, {
    edit: loadOnGrid(files.edit!, fps),
    edit_fit: fit(["edit", 0], width, height),
    edit_size: {
      class_type: "GetImageSize",
      inputs: { image: ["edit_fit", 0] },
    },
    edit_last_index: math("max(0, a - 1)", { a: ["edit_size", 2] }),
    edit_hold_count: math("max(1, a - b)", { a: count, b: ["edit_size", 2] }),
    edit_last: {
      class_type: "ImageFromBatch",
      inputs: {
        image: ["edit_fit", 0],
        batch_index: ["edit_last_index", 1],
        length: 1,
      },
    },
    edit_hold: {
      class_type: "RepeatImageBatch",
      inputs: { image: ["edit_last", 0], amount: ["edit_hold_count", 1] },
    },
    edit_held: {
      class_type: "ImageBatch",
      inputs: { image1: ["edit_fit", 0], image2: ["edit_hold", 0] },
    },
    conformed: {
      class_type: "ImageFromBatch",
      inputs: { image: ["edit_held", 0], batch_index: 0, length: count },
    },
  });
  if (operation === "append") {
    // The continuation in full, after the take: nothing is held or trimmed.
    graph.result = {
      class_type: "ImageBatch",
      inputs: {
        image1: squarePixels ? frames : ["source_fit", 0],
        image2: ["edit_fit", 0],
      },
    };
    for (const id of [
      "edit_size",
      "edit_last_index",
      "edit_hold_count",
      "edit_last",
      "edit_hold",
      "edit_held",
      "conformed",
    ])
      delete graph[id];
    return graph;
  }
  if (operation === "conform") {
    graph.result = graph.conformed!;
    delete graph.conformed;
    delete graph.source_fit;
    return graph;
  }

  // The matte's alpha (Bria's transparent VP9) on the same grid. VHS reports
  // the mask inverted, as LoadImage does; the composite scales it to the frame.
  Object.assign(graph, {
    matte: loadOnGrid(files.matte!, fps),
    matte_alpha: { class_type: "InvertMask", inputs: { mask: ["matte", 1] } },
    result: {
      class_type: "ImageCompositeMasked",
      inputs: {
        destination: ["conformed", 0],
        source: squarePixels ? frames : ["source_fit", 0],
        x: 0,
        y: 0,
        resize_source: false,
        mask: ["matte_alpha", 0],
      },
    },
  });
  return graph;
}

/** The edit at its own size and frame rate, carrying the source's audio. */
function dubGraph(source: string, edit: string): Graph {
  return {
    source: { class_type: "LoadVideo", inputs: { file: source } },
    source_frames: {
      class_type: "GetVideoComponents",
      inputs: { video: ["source", 0] },
    },
    // force_rate 0 keeps the edit's own frame rate.
    edit: loadOnGrid(edit, 0),
    edit_info: {
      class_type: "VHS_VideoInfoLoaded",
      inputs: { video_info: ["edit", 3] },
    },
    video: {
      class_type: "CreateVideo",
      inputs: {
        images: ["edit", 0],
        fps: ["edit_info", 0],
        audio: ["source_frames", 1],
      },
    },
    [MEDIA_GRAPH_OUTPUT]: {
      class_type: "SaveVideo",
      inputs: {
        video: ["video", 0],
        filename_prefix: "open_cinema/dub",
        format: "mp4",
        "format.codec": "h264",
        "format.codec.encoding": "re-encode",
        "format.codec.encoding.crf": 16,
      },
    },
  };
}
