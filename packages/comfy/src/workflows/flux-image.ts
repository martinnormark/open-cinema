import type { FluxImageInputs } from "@open-cinema/contracts";
import type { ProviderRequest } from "./types";

/** Verified live 2026-10-16: ~34 s wall time for a 1k 16:9 image. */
export const FLUX_IMAGE_MODEL = "bfl/flux-3-image";

type ImageOptions = Pick<
  FluxImageInputs,
  "prompt" | "aspectRatio" | "resolution"
>;

export function fluxImageInput(inputs: ImageOptions) {
  const prompt = inputs.prompt.trim();
  if (!prompt) throw new Error("A prompt is required");
  // Grounding runs web research before generation; studio prompts are the user's intent.
  // FLUX 3 Image accepts no seed.
  return {
    prompt,
    aspect_ratio: inputs.aspectRatio,
    resolution: inputs.resolution,
    grounding: false,
  };
}

/** `image.flux`: text-to-image. */
export function fluxImageRequest(inputs: ImageOptions): ProviderRequest {
  return { model: FLUX_IMAGE_MODEL, input: fluxImageInput(inputs) };
}
