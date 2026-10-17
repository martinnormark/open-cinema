import type { AssetRef } from "@open-cinema/contracts";
import { fluxImageInput, FLUX_IMAGE_MODEL } from "./flux-image";
import {
  backgroundReplaceOutputs,
  DEFAULT_BACKGROUND_PIPELINE,
  BACKGROUND_REPLACE_MODELS,
  klingBackgroundRequest,
  KLING_EDIT_LIMITS,
  locationReferences,
  switchxBackgroundRequest,
} from "./background-replace";
import { MAX_REFERENCE_IMAGES } from "./flux-reference";
import { ltxVideoModel, ltxVideoRequest } from "./ltx-video";
import {
  expandMentions,
  httpsUrl,
  mediaTypeFromUrl,
  resultField,
} from "./results";
import {
  CHARACTER_REPLACE_MODEL,
  characterReplaceRequest,
} from "./character-replace";
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
/** LTX returns one clip at `result.video_url`; FLUX 3 Video (first frame) at `result.sample`. */
export function ltxVideoOutputs(data: unknown): ProviderOutput[] {
  const ltx = singleOutput("video_url", "video", "video/mp4")(data);
  return ltx.length ? ltx : singleOutput("sample", "video", "video/mp4")(data);
}

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
        refs.map(async (ref) => {
          // A signed link keeps the body small; local development has none and inlines.
          const asset = await context.asset(ref);
          return asset.publicUrl ?? asset.base64();
        }),
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
  displayModel: (inputs) => (inputs.firstFrame ? "FLUX 3 Video" : "LTX 2.5"),
  deadlineMs: 45 * 60_000,
  model: ltxVideoModel,
  async build(inputs, context) {
    const frame = inputs.firstFrame && (await context.asset(inputs.firstFrame));
    return ltxVideoRequest(
      { ...inputs, prompt: expandMentions(inputs.prompt, context.mentions) },
      frame ? (frame.publicUrl ?? (await frame.base64())) : undefined,
    );
  },
  outputs: ltxVideoOutputs,
};

export const backgroundReplaceWorkflow: WorkflowDefinition<"video.background-replace"> =
  {
    kind: "video.background-replace",
    displayModel:
      DEFAULT_BACKGROUND_PIPELINE === "kling"
        ? "Kling 3.0 Omni"
        : "Beeble SwitchX",
    deadlineMs: 60 * 60_000,
    model: () => BACKGROUND_REPLACE_MODELS[DEFAULT_BACKGROUND_PIPELINE],
    async build(inputs, context) {
      // Kling and SwitchX fetch the source clip by URL only.
      const source = await context.asset(inputs.source);
      const videoUrl = await source.fetchableUrl();
      const location = context.mentions.find(
        (m) => m.elementId === inputs.location?.elementId,
      );
      const refs = [
        ...(inputs.background ? [inputs.background] : []),
        ...locationReferences(location),
      ].slice(0, KLING_EDIT_LIMITS.maxReferenceImages);
      const referenceImages = await Promise.all(
        refs.map(async (ref) => {
          const asset = await context.asset(ref);
          if (asset.publicUrl) return asset.publicUrl;
          // Kling takes bare base64 and rejects a data: URI with provider_error.
          return DEFAULT_BACKGROUND_PIPELINE === "kling"
            ? await asset.base64()
            : await asset.dataUri();
        }),
      );
      const media = { videoUrl, referenceImages };
      if (DEFAULT_BACKGROUND_PIPELINE === "switchx") {
        const matte =
          inputs.target.type === "mask"
            ? await (await context.asset(inputs.target.mask)).fetchableUrl()
            : null;
        return switchxBackgroundRequest(inputs, location, {
          ...media,
          matteUrl: matte ?? undefined,
        });
      }
      return klingBackgroundRequest(inputs, location, media);
    },
    outputs: backgroundReplaceOutputs,
  };

export const characterReplaceWorkflow: WorkflowDefinition<"video.character-replace"> =
  {
    kind: "video.character-replace",
    displayModel: "Kling 3.0 Omni",
    deadlineMs: 60 * 60_000,
    model: () => CHARACTER_REPLACE_MODEL,
    build: characterReplaceRequest,
    // Same Kling edit result document as background replacement.
    outputs: backgroundReplaceOutputs,
  };
