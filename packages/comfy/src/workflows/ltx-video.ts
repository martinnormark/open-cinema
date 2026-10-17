import type { LtxVideoInputs } from "@open-cinema/contracts";
import type { ImageSource, RouterRequest } from "./router-request";

export const LTX_MODELS = {
  fast: "ltx/ltx-2-5-fast",
  pro: "ltx/ltx-2-5-pro",
} as const;
/**
 * Router's LTX models are text-to-video only (their schema has no image field),
 * so a first frame is animated with FLUX 3 Video's image-to-video mode instead.
 */
export const IMAGE_TO_VIDEO_MODEL = "bfl/flux-3-video";

type VideoOptions = Pick<
  LtxVideoInputs,
  | "prompt"
  | "durationSeconds"
  | "resolution"
  | "fps"
  | "generateAudio"
  | "quality"
>;

/** FLUX 3 Video accepts whole seconds from 5 to 20. */
export function requestedDuration(
  inputs: Pick<LtxVideoInputs, "durationSeconds">,
  firstFrame?: ImageSource,
) {
  return firstFrame
    ? Math.min(20, Math.max(5, inputs.durationSeconds))
    : inputs.durationSeconds;
}

/** `video.ltx`: text-to-video on LTX 2.5, or image-to-video from a first frame. */
export function ltxVideoRequest(
  inputs: VideoOptions,
  firstFrame?: ImageSource,
): RouterRequest {
  const prompt = inputs.prompt.trim();
  if (!prompt) throw new Error("A prompt is required");
  if (firstFrame) {
    const [width, height] = inputs.resolution.split("x").map(Number);
    return {
      model: IMAGE_TO_VIDEO_MODEL,
      input: {
        mode: "i2v",
        prompt,
        keyframes: [{ ...firstFrame }],
        duration: requestedDuration(inputs, firstFrame),
        aspect_ratio: width! >= height! ? "16:9" : "9:16",
        resolution: Math.min(width!, height!) >= 1080 ? "fhd" : "hd",
        generate_audio: inputs.generateAudio,
      },
    };
  }
  return {
    model: LTX_MODELS[inputs.quality],
    input: {
      prompt,
      duration: inputs.durationSeconds,
      resolution: inputs.resolution,
      fps: inputs.fps,
      generate_audio: inputs.generateAudio,
    },
  };
}
