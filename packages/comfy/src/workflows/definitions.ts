import type { AssetRef } from "@open-cinema/contracts";
import { fluxImageInput, FLUX_IMAGE_MODEL } from "./flux-image";
import { MAX_REFERENCE_IMAGES } from "./flux-reference";
import { ltxVideoRequest, LTX_MODELS } from "./ltx-video";
import {
  expandMentions,
  httpsUrl,
  mediaTypeFromUrl,
  resultField,
} from "./results";
import type { BuildContext, ProviderOutput, WorkflowDefinition } from "./types";

/** Reads one URL field of a Router result as a single output. */
function singleOutput(field: string, id: string, fallback: string) {
  return (data: unknown): ProviderOutput[] => {
    const url = httpsUrl(resultField(data, field));
    return url
      ? [
          {
            providerAssetId: id,
            url,
            mediaType: mediaTypeFromUrl(url, fallback),
          },
        ]
      : [];
  };
}

/** BFL image models return one image at `result.sample`. */
export const fluxSampleOutputs = singleOutput("sample", "sample", "image/*");
/**
 * Callers that build a client without a workflow kind (pre-v5 checkpoints and
 * direct uses) read either BFL's `sample` or LTX's `video_url` as "sample".
 */
export function routerSampleOutputs(data: unknown): ProviderOutput[] {
  const image = fluxSampleOutputs(data);
  if (image.length) return image;
  return singleOutput("video_url", "sample", "video/mp4")(data);
}
/** LTX returns one clip at `result.video_url`. */
export const ltxVideoOutputs = singleOutput("video_url", "video", "video/mp4");

/** Explicit references first, then each mention's approved sheet, deduplicated. */
function referenceRefs(explicit: readonly AssetRef[], context: BuildContext) {
  const seen = new Set<string>();
  const refs: AssetRef[] = [];
  for (const ref of [
    ...explicit,
    ...context.mentions.flatMap((m) => m.references.map((r) => r.asset)),
  ]) {
    const key = JSON.stringify(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs.slice(0, MAX_REFERENCE_IMAGES);
}

export const fluxImageWorkflow: WorkflowDefinition<"image.flux"> = {
  kind: "image.flux",
  displayModel: "FLUX 3 Image",
  deadlineMs: 30 * 60_000,
  model: () => FLUX_IMAGE_MODEL,
  async build(inputs, context) {
    return {
      model: FLUX_IMAGE_MODEL,
      input: fluxImageInput({
        ...inputs,
        prompt: expandMentions(inputs.prompt, context.mentions),
      }),
    };
  },
  outputs: fluxSampleOutputs,
};

export const fluxReferenceWorkflow: WorkflowDefinition<"image.flux-reference"> =
  {
    kind: "image.flux-reference",
    displayModel: "FLUX 3 Image",
    deadlineMs: 30 * 60_000,
    model: () => FLUX_IMAGE_MODEL,
    async build(inputs, context) {
      const refs = referenceRefs(inputs.references, context);
      if (!refs.length)
        throw new Error("Add at least one reference image or Element");
      const images = await Promise.all(
        refs.map(async (ref) => (await context.asset(ref)).base64()),
      );
      return {
        model: FLUX_IMAGE_MODEL,
        input: {
          ...fluxImageInput({
            ...inputs,
            prompt: expandMentions(inputs.prompt, context.mentions),
          }),
          images,
        },
      };
    },
    outputs: fluxSampleOutputs,
  };

export const ltxVideoWorkflow: WorkflowDefinition<"video.ltx"> = {
  kind: "video.ltx",
  displayModel: "LTX 2.5",
  deadlineMs: 45 * 60_000,
  model: (inputs) => LTX_MODELS[inputs.quality],
  async build(inputs, context) {
    return ltxVideoRequest({
      ...inputs,
      prompt: expandMentions(inputs.prompt, context.mentions),
    });
  },
  outputs: ltxVideoOutputs,
};
