import {
  CAMERA_MOVES,
  RESTAGE_ANGLES,
  type CameraMove,
  type RestageAngle,
} from "@open-cinema/contracts";
import {
  LTX_ALPHA_MEDIA_INPUTS,
  LTX_ALPHA_MODEL_ID,
  LTX_ALPHA_OUTPUT_NODES,
  ltxAlphaBackgroundGraph,
} from "./ltx-alpha-background";
import {
  LTX_CAMERA_MEDIA_INPUTS,
  LTX_CAMERA_MODEL_ID,
  LTX_CAMERA_OUTPUT_NODES,
  ltxCameraGraph,
} from "./ltx-camera";
import {
  LTX_EDIT_MEDIA_INPUTS,
  LTX_EDIT_MODEL_IDS,
  LTX_EDIT_OUTPUT_NODES,
  ltxEditGraph,
  ltxEditPrompts,
  type LtxEditMode,
} from "./ltx-edit";
import {
  LTX_PERFORMANCE_MEDIA_INPUTS,
  LTX_PERFORMANCE_MODEL_ID,
  LTX_PERFORMANCE_OUTPUT_NODES,
  REFERENCE_KEYFRAME_STRENGTH,
  ltxPerformanceGraph,
  type PerformanceControl,
} from "./ltx-performance-transfer";
import {
  LTX_RECAST_MEDIA_INPUTS,
  LTX_RECAST_OUTPUT_NODES,
  ltxRecastGraph,
  ltxRecastPrompts,
} from "./ltx-recast";
import {
  LTX_RESTAGE_MEDIA_INPUTS,
  LTX_RESTAGE_MODEL_ID,
  LTX_RESTAGE_OUTPUT_NODES,
  ltxRestageGraph,
} from "./ltx-restage";
import {
  MEDIA_GRAPH_INPUTS,
  MEDIA_GRAPH_OUTPUT,
  MEDIA_GRAPH_PARTS,
  mediaGraph,
} from "./media-graphs";
import type { MediaOperation } from "./types";

/**
 * Every ComfyUI graph the app runs on Comfy Cloud, built by the same functions
 * the Worker calls, as API-format workflow files under the repository's
 * `workflows/cloud/` (scripts/export-workflows.ts writes them; a jobs test
 * fails when they drift). Loader inputs carry placeholder file names
 * (`source.mp4`, `reference-0.png`) where the Worker sets uploaded assets, and
 * prompts and seeds are fixed examples.
 */

type ApiGraph = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;

export interface WorkflowExport {
  /** Path under `workflows/cloud/`, e.g. `background/ltx-alpha-gen-image.api.json`. */
  file: string;
  title: string;
  /** The workflow kind (and stage) that runs this graph, or null when the Worker does not. */
  usedBy: string | null;
  /** Loader node, its file field, and the placeholder file it reads. */
  inputs: { node: string; field: string; file: string }[];
  /** SaveVideo or SaveImage nodes, in the order the app lists their outputs. */
  outputs: readonly string[];
  graph: ApiGraph;
}

const SEED = 20261030;

interface Slot {
  node: string;
  field: string;
}

function withFiles(
  graph: ApiGraph,
  slots: [Slot, string][],
): Pick<WorkflowExport, "graph" | "inputs"> {
  const copy = structuredClone(graph);
  const inputs = slots.map(([slot, file]) => {
    const node = copy[slot.node];
    if (!node) throw new Error(`The graph has no ${slot.node} loader`);
    node.inputs[slot.field] = file;
    return { ...slot, file };
  });
  return { graph: copy, inputs };
}

function media(operation: MediaOperation): WorkflowExport {
  const files = {
    source: "source.mp4",
    edit: "edit.mp4",
    matte: "matte.webm",
  } as const;
  const parts = MEDIA_GRAPH_PARTS[operation];
  const graph = mediaGraph({
    operation,
    files: Object.fromEntries(parts.map((p) => [p, files[p]])),
    // `square` only exists for clips with non-square pixels.
    pixelAspect: operation === "square" ? 4 / 3 : 1,
  });
  return {
    file: `media/${operation}.api.json`,
    title: {
      lock: "Lock the performers: source foreground over the edit",
      conform: "Conform an edit to the source's frame grid",
      square: "Square a clip's pixels",
    }[operation],
    usedBy: {
      lock: "video.background-replace, as-shot variant (lock stage)",
      conform:
        "video.background-replace and video.character-replace (conform stage)",
      square: "uploads whose pixels the browser could not square",
    }[operation],
    ...withFiles(
      graph,
      parts.map((p) => [MEDIA_GRAPH_INPUTS[p], files[p]]),
    ),
    outputs: [MEDIA_GRAPH_OUTPUT],
  };
}

function alphaBackground(background: "image" | "video"): WorkflowExport {
  const plate =
    background === "image"
      ? LTX_ALPHA_MEDIA_INPUTS.backgroundImage
      : LTX_ALPHA_MEDIA_INPUTS.backgroundVideo;
  const graph = ltxAlphaBackgroundGraph({ background, seed: SEED });
  return {
    file: `background/ltx-alpha-gen-${background}.api.json`,
    title: `Background replacement with LTX 2.5 Alpha Gen, ${background} plate`,
    usedBy: `video.background-replace, LTX path (${LTX_ALPHA_MODEL_ID})`,
    ...withFiles(graph, [
      [LTX_ALPHA_MEDIA_INPUTS.source, "source.mp4"],
      [plate, background === "image" ? "background.jpg" : "background.mp4"],
    ]),
    outputs: LTX_ALPHA_OUTPUT_NODES,
  };
}

function camera(move: CameraMove, firstFrame: boolean): WorkflowExport {
  const graph = ltxCameraGraph({
    move,
    prompt:
      "A lighthouse keeper in a yellow oilskin coat walks along a wet stone pier at dusk, waves breaking behind him.",
    durationSeconds: 5,
    fps: 24,
    resolution: "1280x720",
    seed: SEED,
    firstFrame,
  });
  return {
    file: `camera/${move}${firstFrame ? "" : "-text"}.api.json`,
    title: `Camera move: ${CAMERA_MOVES[move].label}, ${firstFrame ? "from a first frame" : "text to video"}`,
    usedBy: `video.ltx with a camera move (${LTX_CAMERA_MODEL_ID})`,
    ...withFiles(
      graph,
      firstFrame
        ? [[LTX_CAMERA_MEDIA_INPUTS.firstFrame, "first-frame.png"]]
        : [],
    ),
    outputs: LTX_CAMERA_OUTPUT_NODES,
  };
}

function edit(mode: LtxEditMode): WorkflowExport {
  const references = 2;
  const prompts = ltxEditPrompts({
    mode,
    references,
    direction: "",
    style:
      mode === "restyle"
        ? "Hand-painted watercolour, soft paper texture, muted harbour blues."
        : "",
    original: mode === "swap" ? "the red mug (on the right of the frame)" : "",
    replacement:
      mode === "swap" ? "Brass Lantern, a dented ship's lantern" : "",
    name: "Brass Lantern",
  });
  const graph = ltxEditGraph({
    mode,
    ...prompts,
    references,
    seed: SEED,
    swap:
      mode === "swap"
        ? { original: "the red mug", replacement: "Brass Lantern" }
        : undefined,
  });
  return {
    file: `revision/${mode === "swap" ? "object-swap" : "restyle"}.api.json`,
    title:
      mode === "swap"
        ? "Object Swap: replace one object with a Thing"
        : "Restyle: the same take in a new look",
    usedBy: `video.${mode === "swap" ? "object-swap" : "restyle"} (${LTX_EDIT_MODEL_IDS[mode]})`,
    ...withFiles(graph, [
      [LTX_EDIT_MEDIA_INPUTS.source, "source.mp4"],
      ...Array.from(
        { length: references },
        (_, i) =>
          [LTX_EDIT_MEDIA_INPUTS.reference(i), `reference-${i}.png`] as [
            Slot,
            string,
          ],
      ),
    ]),
    outputs: LTX_EDIT_OUTPUT_NODES,
  };
}

function restage(angle: RestageAngle): WorkflowExport {
  const graph = ltxRestageGraph({
    angle,
    description:
      "Two people talk across a kitchen table in warm morning light, a window behind them.",
    seed: SEED,
  });
  return {
    file: `restage/${angle}.api.json`,
    title: `Re-stage: ${RESTAGE_ANGLES[angle].label}`,
    usedBy: `video.restage (${LTX_RESTAGE_MODEL_ID})`,
    ...withFiles(graph, [[LTX_RESTAGE_MEDIA_INPUTS.source, "source.mp4"]]),
    outputs: LTX_RESTAGE_OUTPUT_NODES,
  };
}

function performance(control: PerformanceControl): WorkflowExport {
  const graph = ltxPerformanceGraph({
    prompt:
      "Theo, a weathered lighthouse keeper with a grey beard and a navy wool sweater, performs the same movement in a stone cottage kitchen.",
    control,
    strength: 0.8,
    keyframeStrength: REFERENCE_KEYFRAME_STRENGTH,
    seed: SEED,
  });
  return {
    file: `performance/${control}.api.json`,
    title: `Performance transfer, ${control === "edges" ? "soft" : "detailed"} edge control`,
    usedBy: `video.performance-transfer (${LTX_PERFORMANCE_MODEL_ID})`,
    ...withFiles(graph, [
      [LTX_PERFORMANCE_MEDIA_INPUTS.source, "source.mp4"],
      [LTX_PERFORMANCE_MEDIA_INPUTS.keyframe, "keyframe.png"],
    ]),
    outputs: LTX_PERFORMANCE_OUTPUT_NODES,
  };
}

function recast(): WorkflowExport {
  const references = 2;
  const prompts = ltxRecastPrompts({
    target: "the man on the left of the frame",
    name: "Theo",
    identity: "a weathered man in his sixties with a grey beard",
    wardrobe: "a navy wool sweater",
    action: "a person sits at a table and talks",
    references,
    sheet: true,
  });
  const graph = ltxRecastGraph({
    ...prompts,
    references,
    sheet: true,
    target: { x: 0.1, y: 0.15, width: 0.35, height: 0.8 },
    poseStrength: 0.8,
    seed: SEED,
  });
  return {
    file: "experiments/ltx-recast.api.json",
    title: "Recast on LTX 2.5 (experiment, not in the Worker)",
    usedBy: null,
    ...withFiles(graph, [
      [LTX_RECAST_MEDIA_INPUTS.source, "source.mp4"],
      [LTX_RECAST_MEDIA_INPUTS.reference(0), "reference-0.png"],
      [LTX_RECAST_MEDIA_INPUTS.reference(1), "reference-1.png"],
      [LTX_RECAST_MEDIA_INPUTS.sheet, "sheet.png"],
    ]),
    outputs: LTX_RECAST_OUTPUT_NODES,
  };
}

export function workflowExports(): WorkflowExport[] {
  return [
    media("lock"),
    media("conform"),
    media("square"),
    alphaBackground("image"),
    alphaBackground("video"),
    ...(Object.keys(CAMERA_MOVES) as CameraMove[]).map((m) => camera(m, true)),
    camera("dolly-in", false),
    edit("swap"),
    edit("restyle"),
    ...(Object.keys(RESTAGE_ANGLES) as RestageAngle[]).map(restage),
    performance("edges"),
    performance("edges-detailed"),
    recast(),
  ];
}

/** Model files a graph loads, by loader input name (LoRAs, checkpoints, encoders). */
export function graphModels(graph: ApiGraph): string[] {
  const names = new Set<string>();
  for (const node of Object.values(graph))
    for (const value of Object.values(node.inputs))
      if (
        typeof value === "string" &&
        /\.(safetensors|pt|pth|ckpt|onnx)$/.test(value)
      )
        names.add(value);
  return [...names].sort();
}

/** The file written for each export: the graph, keys in the order built. */
export function workflowFileContents(entry: WorkflowExport): string {
  return `${JSON.stringify(entry.graph, null, 2)}\n`;
}

/** `workflows/cloud/manifest.json`: what each file is, reads, saves and loads. */
export function workflowManifest(): string {
  const entries = workflowExports().map((e) => ({
    file: e.file,
    title: e.title,
    usedBy: e.usedBy,
    inputs: e.inputs,
    outputs: e.outputs,
    models: graphModels(e.graph),
  }));
  return `${JSON.stringify(entries, null, 2)}\n`;
}
