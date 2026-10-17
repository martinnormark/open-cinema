import type {
  AssetRef,
  ReferenceView,
  ResolvedMention,
  WorkflowInputs,
} from "@open-cinema/contracts";
import {
  LTX_CAMERA_MEDIA_INPUTS,
  LTX_CAMERA_MODEL_ID,
  LTX_CAMERA_OUTPUT_NODES,
  ltxCameraGraph,
} from "./ltx-camera";
import {
  LTX_RESTAGE_MEDIA_INPUTS,
  LTX_RESTAGE_MODEL_ID,
  LTX_RESTAGE_OUTPUT_NODES,
  ltxRestageGraph,
} from "./ltx-restage";
import {
  LTX_EDIT_LIMITS,
  LTX_EDIT_MEDIA_INPUTS,
  LTX_EDIT_MODEL_IDS,
  LTX_EDIT_OUTPUT_NODES,
  ltxEditGraph,
  ltxEditPrompts,
} from "./ltx-edit";
import { mediaFilename, seedFrom } from "./ltx-alpha-background";
import { expandMentions } from "./results";
import type {
  BuildContext,
  CloudMediaInput,
  CloudWorkflowRequest,
  WorkflowDefinition,
} from "./types";

/**
 * Object Swap, Restyle and camera re-staging run as open-weights FLUX and LTX
 * graphs on Comfy Cloud (./ltx-edit.ts, ./ltx-camera.ts). Each one keeps the
 * take's frame count, frame rate and audio.
 */

/** Cloud outputs are read by node; Router result documents never reach these. */
const noRouterOutputs = () => [];

async function cloudMedia(
  context: BuildContext,
  slot: { node: string; field: string },
  ref: AssetRef,
  role: string,
): Promise<CloudMediaInput> {
  const asset = await context.asset(ref);
  return {
    ...slot,
    url: await asset.fetchableUrl(),
    filename: mediaFilename(role, asset.mediaType),
    contentType: asset.mediaType,
  };
}

async function sourceVideo(context: BuildContext, ref: AssetRef) {
  const asset = await context.asset(ref);
  if (!asset.mediaType.startsWith("video/"))
    throw new Error("This revision needs a source video");
  return cloudMedia(context, LTX_EDIT_MEDIA_INPUTS.source, ref, "source");
}

/** A Thing's sheet: views that show its whole design come first. */
const THING_VIEWS: readonly ReferenceView[] = [
  "three-quarter",
  "front",
  "side",
  "detail",
  "top",
  "rear",
];

export function thingReferences(thing: ResolvedMention): AssetRef[] {
  const rank = (view: ReferenceView | null) => {
    const i = view ? THING_VIEWS.indexOf(view) : -1;
    return i === -1 ? THING_VIEWS.length : i;
  };
  return [...thing.references]
    .sort((a, b) => rank(a.view) - rank(b.view))
    .map((r) => r.asset)
    .slice(0, LTX_EDIT_LIMITS.maxReferences);
}

/** "The lamp" plus where the creator marked it, for the keyframe edit. */
export function describeObject(
  original: string,
  point?: { x: number; y: number },
) {
  const what = original.trim().replace(/[.\s]+$/, "");
  const lower = what.replace(/^(The|A|An) /, (a) => a.toLowerCase());
  const named = /^(the|a|an) /i.test(lower) ? lower : `the ${lower}`;
  if (!point) return named;
  const side =
    point.x < 0.38
      ? "on the left"
      : point.x > 0.62
        ? "on the right"
        : "in the centre";
  return `${named} (${side} of the frame)`;
}

function identity(mention: ResolvedMention) {
  return [mention.description, mention.stateDescription]
    .filter(Boolean)
    .join(" ")
    .trim()
    .replace(/[.\s]+$/, "");
}

export async function objectSwapRequest(
  inputs: WorkflowInputs<"video.object-swap">,
  context: BuildContext,
): Promise<CloudWorkflowRequest> {
  const thing = context.mentions.find(
    (m) => m.elementId === inputs.thing.elementId,
  );
  if (!thing) throw new Error("The Thing to swap in was not resolved");
  if (thing.type !== "thing") throw new Error("Object Swap needs a Thing");
  const refs = thingReferences(thing);
  if (!refs.length)
    throw new Error("Approve at least one reference image for this Thing");
  const details = identity(thing);
  const prompts = ltxEditPrompts({
    mode: "swap",
    references: refs.length,
    direction: expandMentions(inputs.prompt ?? "", context.mentions),
    style: "",
    original: describeObject(inputs.original, inputs.point),
    replacement: details ? `${thing.name}, ${details}` : thing.name,
    name: thing.name,
  });
  // SAM 3 finds the object by a plain noun phrase, not the spatial note.
  prompts.swap = {
    original: inputs.original.trim().replace(/[.\s]+$/, ""),
    replacement: thing.name,
  };
  const media = [
    await sourceVideo(context, inputs.source),
    ...(await Promise.all(
      refs.map((ref, i) =>
        cloudMedia(
          context,
          LTX_EDIT_MEDIA_INPUTS.reference(i),
          ref,
          `reference-${i}`,
        ),
      ),
    )),
  ];
  return {
    model: LTX_EDIT_MODEL_IDS.swap,
    input: {
      graph: ltxEditGraph({
        mode: "swap",
        ...prompts,
        references: refs.length,
        seed: seedFrom(JSON.stringify(inputs)),
      }),
      media,
    },
  };
}

export async function restyleRequest(
  inputs: WorkflowInputs<"video.restyle">,
  context: BuildContext,
): Promise<CloudWorkflowRequest> {
  const style = context.mentions.find(
    (m) => m.elementId === inputs.style?.elementId,
  );
  const refs = [
    ...(inputs.styleImage ? [inputs.styleImage] : []),
    ...(style ? style.references.map((r) => r.asset) : []),
  ].slice(0, LTX_EDIT_LIMITS.maxReferences);
  const words = [
    style
      ? `${style.name}${identity(style) ? `: ${identity(style)}` : ""}`
      : "",
    expandMentions(inputs.prompt ?? "", context.mentions),
  ]
    .filter(Boolean)
    .join(". ");
  if (!refs.length && !words)
    throw new Error("Choose a style reference or describe the look");
  const prompts = ltxEditPrompts({
    mode: "restyle",
    references: refs.length,
    direction: "",
    style: words,
    original: "",
    replacement: "",
    name: "",
  });
  const media = [
    await sourceVideo(context, inputs.source),
    ...(await Promise.all(
      refs.map((ref, i) =>
        cloudMedia(
          context,
          LTX_EDIT_MEDIA_INPUTS.reference(i),
          ref,
          `reference-${i}`,
        ),
      ),
    )),
  ];
  return {
    model: LTX_EDIT_MODEL_IDS.restyle,
    input: {
      graph: ltxEditGraph({
        mode: "restyle",
        ...prompts,
        references: refs.length,
        seed: seedFrom(JSON.stringify(inputs)),
      }),
      media,
    },
  };
}

export const objectSwapWorkflow: WorkflowDefinition<"video.object-swap"> = {
  kind: "video.object-swap",
  displayModel: "FLUX.2 Klein + LTX 2.3",
  deadlineMs: 45 * 60_000,
  model: () => LTX_EDIT_MODEL_IDS.swap,
  provider: () => "cloud-workflow",
  cloudOutputNodes: LTX_EDIT_OUTPUT_NODES,
  build: objectSwapRequest,
  outputs: noRouterOutputs,
};

export const restyleWorkflow: WorkflowDefinition<"video.restyle"> = {
  kind: "video.restyle",
  displayModel: "FLUX.2 Klein + LTX 2.3",
  deadlineMs: 45 * 60_000,
  model: () => LTX_EDIT_MODEL_IDS.restyle,
  provider: () => "cloud-workflow",
  cloudOutputNodes: LTX_EDIT_OUTPUT_NODES,
  build: restyleRequest,
  outputs: noRouterOutputs,
};

export const restageWorkflow: WorkflowDefinition<"video.restage"> = {
  kind: "video.restage",
  displayModel: "MoGe-2 + LTX 2.3 In-Outpainting",
  deadlineMs: 45 * 60_000,
  model: () => LTX_RESTAGE_MODEL_ID,
  provider: () => "cloud-workflow",
  cloudOutputNodes: LTX_RESTAGE_OUTPUT_NODES,
  async build(inputs, context) {
    return {
      model: LTX_RESTAGE_MODEL_ID,
      input: {
        graph: ltxRestageGraph({
          angle: inputs.angle,
          description: inputs.prompt ?? "",
          seed: seedFrom(JSON.stringify(inputs)),
        }),
        media: [
          await cloudMedia(
            context,
            LTX_RESTAGE_MEDIA_INPUTS.source,
            inputs.source,
            "source",
          ),
        ],
      },
    };
  },
  outputs: noRouterOutputs,
};

/** `video.ltx` with a camera move: LTX-2 and a camera-control LoRA on Cloud. */
export async function ltxCameraRequest(
  inputs: WorkflowInputs<"video.ltx">,
  context: BuildContext,
): Promise<CloudWorkflowRequest> {
  if (!inputs.camera) throw new Error("No camera move was chosen");
  return {
    model: LTX_CAMERA_MODEL_ID,
    input: {
      graph: ltxCameraGraph({
        move: inputs.camera,
        prompt: expandMentions(inputs.prompt, context.mentions),
        durationSeconds: inputs.durationSeconds,
        fps: inputs.fps,
        resolution: inputs.resolution,
        seed: seedFrom(JSON.stringify(inputs)),
        firstFrame: !!inputs.firstFrame,
      }),
      media: inputs.firstFrame
        ? [
            await cloudMedia(
              context,
              LTX_CAMERA_MEDIA_INPUTS.firstFrame,
              inputs.firstFrame,
              "first-frame",
            ),
          ]
        : [],
    },
  };
}
export { LTX_CAMERA_MODEL_ID, LTX_CAMERA_OUTPUT_NODES };
