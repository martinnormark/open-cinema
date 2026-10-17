import {
  withDirection,
  type AssetRef,
  type WorkflowInputs,
} from "@open-cinema/contracts";
import { fluxImageInput, FLUX_IMAGE_MODEL } from "./flux-image";
import {
  backgroundLockStage,
  backgroundMatteStage,
  backgroundReplaceOutputs,
  DEFAULT_BACKGROUND_PIPELINE,
  BACKGROUND_REPLACE_MODELS,
  klingBackgroundRequest,
  KLING_EDIT_LIMITS,
  locationReferences,
  switchxBackgroundRequest,
} from "./background-replace";
import { MAX_REFERENCE_IMAGES } from "./flux-reference";
import {
  LTX_ALPHA_MEDIA_INPUTS,
  LTX_ALPHA_MODEL_ID,
  LTX_ALPHA_OUTPUT_NODES,
  ltxAlphaBackgroundGraph,
  mediaFilename,
  seedFrom,
} from "./ltx-alpha-background";
import { ltxVideoModel, ltxVideoRequest } from "./ltx-video";
import {
  expandMentions,
  httpsUrl,
  mediaTypeFromUrl,
  resultField,
} from "./results";
import {
  CHARACTER_REPLACE_MODEL,
  characterConformStage,
  characterReferences,
  characterReplaceRequest,
} from "./character-replace";
import type {
  BuildContext,
  CloudWorkflowRequest,
  ProviderOutput,
  WorkflowDefinition,
} from "./types";

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

/** Each mention's approved references, a Character's close portrait first. */
function mentionReferences(context: BuildContext) {
  return context.mentions.flatMap((m) =>
    m.type === "character" ? characterReferences(m) : m.references,
  );
}

/**
 * A Character sheet's full-body panels have no heads on purpose; without
 * saying so FLUX may draw a headless figure or invent a face for the body.
 */
export const SHEET_GUIDE =
  "Character sheets among the reference images show the body from the front and back with the head left out on purpose: use them for build and clothing, and take each face only from that character's close portrait.";

function withSheetGuide(prompt: string, context: BuildContext) {
  return mentionReferences(context).some((r) => r.view === "sheet")
    ? `${prompt} ${SHEET_GUIDE}`
    : prompt;
}

/** Explicit references first, then each mention's approved sheet, deduplicated. */
function referenceRefs(explicit: readonly AssetRef[], context: BuildContext) {
  const seen = new Set<string>();
  const refs: AssetRef[] = [];
  for (const ref of [
    ...explicit,
    ...mentionReferences(context).map((r) => r.asset),
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
      // No reference images reach this model, so mentions say who they are.
      input: fluxImageInput({
        ...inputs,
        prompt: withDirection(
          expandMentions(inputs.prompt, context.mentions, "full"),
          inputs.direction,
          "image",
        ),
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
            prompt: withSheetGuide(
              withDirection(
                expandMentions(inputs.prompt, context.mentions, "state"),
                inputs.direction,
                "image",
              ),
              context,
            ),
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
    // Router's LTX reads text only: mentions say who they are, not just a name.
    const prompt = expandMentions(
      inputs.prompt,
      context.mentions,
      frame ? "state" : "full",
    );
    return ltxVideoRequest(
      { ...inputs, prompt: withDirection(prompt, inputs.direction, "video") },
      frame ? (frame.publicUrl ?? (await frame.base64())) : undefined,
    );
  },
  outputs: ltxVideoOutputs,
};

/**
 * LTX 2.5 Alpha Gen on Comfy Cloud: matte the take, composite it over the
 * explicit background (image or clip) or the Location's best reference.
 */
async function ltxAlphaBackgroundRequest(
  inputs: WorkflowInputs<"video.background-replace">,
  context: BuildContext,
): Promise<CloudWorkflowRequest> {
  const location = context.mentions.find(
    (m) => m.elementId === inputs.location?.elementId,
  );
  const plateRef = inputs.background ?? locationReferences(location)[0];
  if (!plateRef)
    throw new Error("Choose a background image or clip, or a Location");
  const [source, plate] = await Promise.all([
    context.asset(inputs.source),
    context.asset(plateRef),
  ]);
  const background = plate.mediaType.startsWith("video/") ? "video" : "image";
  const slot =
    background === "video"
      ? LTX_ALPHA_MEDIA_INPUTS.backgroundVideo
      : LTX_ALPHA_MEDIA_INPUTS.backgroundImage;
  return {
    model: LTX_ALPHA_MODEL_ID,
    input: {
      graph: ltxAlphaBackgroundGraph({
        background,
        seed: seedFrom(JSON.stringify(inputs.source)),
      }),
      media: [
        {
          ...LTX_ALPHA_MEDIA_INPUTS.source,
          url: await source.fetchableUrl(),
          filename: mediaFilename("source", source.mediaType),
          contentType: source.mediaType,
        },
        {
          ...slot,
          url: await plate.fetchableUrl(),
          filename: mediaFilename("background", plate.mediaType),
          contentType: plate.mediaType,
        },
      ],
    },
  };
}

export const backgroundReplaceWorkflow: WorkflowDefinition<"video.background-replace"> =
  {
    kind: "video.background-replace",
    displayModel: (inputs) =>
      inputs.pipeline === "ltx-alpha"
        ? "LTX 2.5 Alpha Gen"
        : DEFAULT_BACKGROUND_PIPELINE === "kling"
          ? "Kling 3.0 Omni"
          : "Beeble SwitchX",
    deadlineMs: 60 * 60_000,
    model: (inputs) =>
      inputs.pipeline === "ltx-alpha"
        ? LTX_ALPHA_MODEL_ID
        : BACKGROUND_REPLACE_MODELS[DEFAULT_BACKGROUND_PIPELINE],
    provider: (inputs) =>
      inputs.pipeline === "ltx-alpha" ? "cloud-workflow" : "router",
    cloudOutputNodes: LTX_ALPHA_OUTPUT_NODES,
    async build(inputs, context) {
      if (inputs.pipeline === "ltx-alpha")
        return ltxAlphaBackgroundRequest(inputs, context);
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
    // SwitchX keeps its matted subject itself; Kling's edit gets the lock.
    // The alpha composite already keeps the take's own pixels.
    ...(DEFAULT_BACKGROUND_PIPELINE === "kling"
      ? {
          label: "Replacing the background",
          stages: (inputs) =>
            inputs.pipeline === "ltx-alpha"
              ? []
              : [backgroundMatteStage, backgroundLockStage],
        }
      : {}),
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
    label: "Recasting the character",
    stages: [characterConformStage],
  };
