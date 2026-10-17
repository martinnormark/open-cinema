import {
  KLING_EDIT_LIMITS,
  withDirection,
  type AssetRef,
  type WorkflowInputs,
} from "@open-cinema/contracts";
import { fluxImageInput, FLUX_IMAGE_MODEL } from "./flux-image";
import {
  backgroundLockStage,
  backgroundMatteStage,
  backgroundReplaceOutputs,
  BACKGROUND_REPLACE_MODEL,
  klingBackgroundRequest,
  locationReferences,
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
import {
  characterKeyframe,
  LTX_PERFORMANCE_MEDIA_INPUTS,
  LTX_PERFORMANCE_MODEL_ID,
  LTX_PERFORMANCE_OUTPUT_NODES,
  ltxPerformanceGraph,
  performancePrompt,
  REFERENCE_KEYFRAME_STRENGTH,
} from "./ltx-performance-transfer";
import { ltxVideoModel, ltxVideoRequest } from "./ltx-video";
import {
  planReferences,
  REFERENCE_VIDEO_MODEL,
  referenceVideoPrompt,
  referenceVideoRequest,
} from "./reference-video";
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
import {
  LTX_CAMERA_MODEL_ID,
  LTX_CAMERA_OUTPUT_NODES,
  ltxCameraRequest,
} from "./revision-modes";
import type {
  BuildContext,
  CloudMediaInput,
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

/** One mention's approved references, a Character's close portrait first. */
function referencesOf(mention: BuildContext["mentions"][number]) {
  return mention.type === "character"
    ? characterReferences(mention)
    : mention.references;
}

/**
 * Every mention's approved references, taken in turns: each Element's lead
 * view, then each one's second, and so on. With the image limit shared, a
 * Thing mentioned last still brings its hero view instead of losing every
 * slot to the Elements written before it.
 */
function mentionReferences(context: BuildContext) {
  const lists = context.mentions.map(referencesOf);
  const longest = Math.max(0, ...lists.map((l) => l.length));
  const out: ReturnType<typeof referencesOf> = [];
  for (let i = 0; i < longest; i++)
    for (const list of lists) if (list[i]) out.push(list[i]!);
  return out;
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

/**
 * Each mention's approved references in the server's order (a Character's
 * close portrait first), then any other explicit references, deduplicated.
 * The composer sends its mentions' references too, so they must not lead.
 */
function referenceRefs(explicit: readonly AssetRef[], context: BuildContext) {
  const seen = new Set<string>();
  const refs: AssetRef[] = [];
  for (const ref of [
    ...mentionReferences(context).map((r) => r.asset),
    ...explicit,
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
  displayModel: (inputs) =>
    inputs.camera
      ? "LTX-2 camera LoRA"
      : inputs.firstFrame
        ? "FLUX 3 Video"
        : "LTX 2.5",
  deadlineMs: 45 * 60_000,
  model: (inputs) =>
    inputs.camera ? LTX_CAMERA_MODEL_ID : ltxVideoModel(inputs),
  // A camera move needs a LoRA, which only the open weights on Cloud take.
  provider: (inputs) => (inputs.camera ? "cloud-workflow" : "router"),
  cloudOutputNodes: LTX_CAMERA_OUTPUT_NODES,
  async build(inputs, context) {
    if (inputs.camera)
      return ltxCameraRequest(
        {
          ...inputs,
          prompt: withDirection(inputs.prompt, inputs.direction, "video"),
        },
        context,
      );
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

export const referenceVideoWorkflow: WorkflowDefinition<"video.reference"> = {
  kind: "video.reference",
  displayModel: "Kling 3.0 Omni",
  deadlineMs: 45 * 60_000,
  model: () => REFERENCE_VIDEO_MODEL,
  async build(inputs, context) {
    const plan = planReferences(context.mentions);
    const [videoUrl, images] = await Promise.all([
      plan.video
        ? context.asset(plan.video.asset).then((a) => a.fetchableUrl())
        : null,
      Promise.all(
        plan.images.map(async ({ asset }) => {
          const resolved = await context.asset(asset);
          // Kling takes bare base64 and rejects a data: URI.
          return resolved.publicUrl ?? (await resolved.base64());
        }),
      ),
    ]);
    return referenceVideoRequest(
      inputs,
      referenceVideoPrompt(inputs, context.mentions, plan),
      { videoUrl, images },
    );
  },
  outputs: backgroundReplaceOutputs,
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
      inputs.pipeline === "ltx-alpha" ? "LTX 2.5 Alpha Gen" : "Kling 3.0 Omni",
    deadlineMs: 60 * 60_000,
    model: (inputs) =>
      inputs.pipeline === "ltx-alpha"
        ? LTX_ALPHA_MODEL_ID
        : BACKGROUND_REPLACE_MODEL,
    provider: (inputs) =>
      inputs.pipeline === "ltx-alpha" ? "cloud-workflow" : "router",
    cloudOutputNodes: LTX_ALPHA_OUTPUT_NODES,
    async build(inputs, context) {
      if (inputs.pipeline === "ltx-alpha")
        return ltxAlphaBackgroundRequest(inputs, context);
      // Kling fetches the source clip by URL only.
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
          return await asset.base64();
        }),
      );
      return klingBackgroundRequest(inputs, location, {
        videoUrl,
        referenceImages,
      });
    },
    outputs: backgroundReplaceOutputs,
    label: "Replacing the background",
    // Kling's edit gets the lock; the alpha composite already keeps the take's own pixels.
    stages: (inputs) =>
      inputs.pipeline === "ltx-alpha"
        ? []
        : [backgroundMatteStage, backgroundLockStage],
  };

/**
 * LTX 2.3 Union Control on Comfy Cloud: the source's pose drives a new clip
 * that opens on the given keyframe, or leans on the Character's reference.
 */
export const performanceTransferWorkflow: WorkflowDefinition<"video.performance-transfer"> =
  {
    kind: "video.performance-transfer",
    displayModel: "LTX 2.3 Union Control",
    deadlineMs: 60 * 60_000,
    model: () => LTX_PERFORMANCE_MODEL_ID,
    provider: () => "cloud-workflow",
    cloudOutputNodes: LTX_PERFORMANCE_OUTPUT_NODES,
    async build(inputs, context) {
      const find = (id: string | undefined) =>
        id ? context.mentions.find((m) => m.elementId === id) : undefined;
      const character = find(inputs.character?.elementId);
      const location = find(inputs.location?.elementId);
      if (inputs.character && character?.type !== "character")
        throw new Error("Choose a Character to perform the shot");
      const keyframeRef = inputs.firstFrame ?? characterKeyframe(character);
      const [source, keyframe] = await Promise.all([
        context.asset(inputs.source),
        keyframeRef ? context.asset(keyframeRef) : null,
      ]);
      if (!source.mediaType.startsWith("video/"))
        throw new Error("Choose a video clip whose performance to reuse");
      const media: CloudMediaInput[] = [
        {
          ...LTX_PERFORMANCE_MEDIA_INPUTS.source,
          url: await source.fetchableUrl(),
          filename: mediaFilename("source", source.mediaType),
          contentType: source.mediaType,
        },
      ];
      if (keyframe)
        media.push({
          ...LTX_PERFORMANCE_MEDIA_INPUTS.keyframe,
          url: await keyframe.fetchableUrl(),
          filename: mediaFilename("keyframe", keyframe.mediaType),
          contentType: keyframe.mediaType,
        });
      return {
        model: LTX_PERFORMANCE_MODEL_ID,
        input: {
          graph: ltxPerformanceGraph({
            prompt: performancePrompt(
              inputs.prompt,
              context.mentions,
              character,
              location,
            ),
            control: inputs.control,
            strength: inputs.strength,
            keyframeStrength: !keyframe
              ? null
              : inputs.firstFrame
                ? 1
                : REFERENCE_KEYFRAME_STRENGTH,
            seed: seedFrom(JSON.stringify([inputs.source, inputs.prompt])),
          }),
          media,
        },
      };
    },
    // Cloud outputs are read from the SaveVideo nodes, not a Router document.
    outputs: () => [],
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
