import { CAMERA_MOVES, type CameraMove } from "@open-cinema/contracts";
import {
  LTX2_MODELS,
  ltxFrameCount,
  ltxSamplerNodes,
  saveVideoNodes,
  type Graph,
} from "./ltx-graph";

/**
 * Camera moves with real camera control, on open LTX weights in Comfy Cloud.
 *
 * Generation: LTX-2 19B with one of Lightricks' seven camera-control LoRAs
 * (dolly in/out/left/right, jib up/down, static). The LoRA moves the camera;
 * the prompt only describes the scene. With a first frame it animates that
 * image (image-to-video), otherwise it is text-to-video.
 *
 * Re-staging a take from a new angle is off: the only model that did it was a
 * community IC-LoRA, and the app uses no LoRA made by someone else
 * (docs/third-party-ip.md).
 */
export const LTX_CAMERA_MODEL_ID = "comfy-cloud/ltx-2-camera-lora";

export const LTX_CAMERA_MEDIA_INPUTS = {
  firstFrame: { node: "first_frame", field: "image" },
} as const;
export const LTX_CAMERA_OUTPUT_NODES = ["save_result"] as const;

/** Generation size per requested resolution; LTX wants multiples of 32. */
const CAMERA_SIZES: Record<string, { width: number; height: number }> = {
  "1280x720": { width: 1280, height: 704 },
  "720x1280": { width: 704, height: 1280 },
  "1920x1080": { width: 1280, height: 704 },
  "1080x1920": { width: 704, height: 1280 },
};
export const LTX_CAMERA_LIMITS = { maxFrames: 241 } as const;

export interface LtxCameraGraphOptions {
  move: CameraMove;
  prompt: string;
  durationSeconds: number;
  fps: number;
  resolution: string;
  seed: number;
  firstFrame: boolean;
  /** Smaller frames for a cheap check run; never set by the app. */
  previewSide?: number;
}

export function ltxCameraGraph(o: LtxCameraGraphOptions): Graph {
  const move = CAMERA_MOVES[o.move];
  let { width, height } =
    CAMERA_SIZES[o.resolution] ?? CAMERA_SIZES["1280x720"]!;
  if (o.previewSide) {
    const scale = o.previewSide / Math.max(width, height);
    width = Math.round((width * scale) / 32) * 32;
    height = Math.round((height * scale) / 32) * 32;
  }
  const length = ltxFrameCount(
    Math.round(o.durationSeconds * o.fps) + 1,
    LTX_CAMERA_LIMITS.maxFrames,
  );
  const graph: Graph = {};
  if (o.firstFrame) {
    graph.first_frame = { class_type: "LoadImage", inputs: { image: "" } };
    graph.first_frame_fit = {
      class_type: "ImageScale",
      inputs: {
        image: ["first_frame", 0],
        upscale_method: "lanczos",
        width,
        height,
        crop: "center",
      },
    };
  }
  const ltx = ltxSamplerNodes({
    id: "ltx",
    checkpoint: LTX2_MODELS.checkpoint,
    textEncoder: LTX2_MODELS.textEncoder,
    loras: [{ name: move.lora, strength: 1 }],
    prompt: `${o.prompt.trim()} ${move.prompt}`.trim(),
    width,
    height,
    length,
    fps: o.fps,
    seed: o.seed,
    firstFrame: o.firstFrame
      ? { image: ["first_frame_fit", 0], strength: 1 }
      : undefined,
  });
  return {
    ...graph,
    ...ltx.nodes,
    ...saveVideoNodes("save_result", ltx.frames, o.fps, ltx.audio, "camera"),
  };
}
