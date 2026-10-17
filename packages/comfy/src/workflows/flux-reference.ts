import type { FluxReferenceInputs } from "@open-cinema/contracts";
import { fluxImageInput, FLUX_IMAGE_MODEL } from "./flux-image";
import type { ImageSource, RouterRequest } from "./router-request";

export const MAX_REFERENCE_IMAGES = 10;

/**
 * `image.flux-reference`: multi-reference generation for Element consistency on
 * FLUX 3 Image. `references` are the resolved images (mention sheets and
 * explicit references), most important first. Verified live: a character kept
 * face, beard and raincoat in a new scene. With `auto` aspect ratio the output
 * follows the first reference.
 */
export function fluxReferenceRequest(
  inputs: Pick<FluxReferenceInputs, "prompt" | "aspectRatio" | "resolution">,
  references: readonly ImageSource[],
): RouterRequest {
  if (references.length < 1)
    throw new Error("Add at least one reference image or Element");
  return {
    model: FLUX_IMAGE_MODEL,
    input: {
      ...fluxImageInput(inputs),
      // Router allows ten; extra mention sheets beyond that are dropped, least important last.
      images: references
        .slice(0, MAX_REFERENCE_IMAGES)
        .map((source) => ({ ...source })),
    },
  };
}
