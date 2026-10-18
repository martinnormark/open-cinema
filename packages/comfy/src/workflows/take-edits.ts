import {
  CONFORM_STAGE,
  REFRAME_ASPECTS,
  type AreaInputs,
  type ExtendInputs,
  type ResolvedMention,
} from "@open-cinema/contracts";
import { referencesOf } from "./definitions";
import { seedanceRelocateOutputs } from "./background-replace";
import {
  LTX_FILL_MEDIA_INPUTS,
  LTX_FILL_MODEL_ID,
  LTX_FILL_OUTPUT_NODES,
  ltxFillGraph,
} from "./ltx-fill";
import { mediaFilename, seedFrom } from "./ltx-alpha-background";
import {
  WAN_VACE_MODEL_ID,
  WAN_VACE_OUTPUT_NODES,
  wanAreaGraph,
} from "./wan-vace";
import { expandMentions } from "./results";
import type {
  BuildContext,
  CloudMediaInput,
  MediaStage,
  ProviderRequest,
  WorkflowDefinition,
} from "./types";

/**
 * Edits that keep most of a take: what happens after its last frame
 * (`video.extend`), and a brushed area, a stretch of time or a new frame
 * shape (`video.fill`). docs/take-edits.md records the runs behind them.
 */

/** Seedance 2.5 on Router, the same model "Move the whole shot" uses. */
export const SEEDANCE_EXTEND_MODEL = "byteplus/dreamina-seedance-2-5-260628";
/** Seedance reads up to nine images; each mentioned Element sends its lead view. */
const SEEDANCE_MAX_REFERENCES = 3;

async function sourceMedia(
  context: BuildContext,
  inputs: { source: ExtendInputs["source"] },
): Promise<CloudMediaInput> {
  const asset = await context.asset(inputs.source);
  if (!asset.mediaType.startsWith("video/"))
    throw new Error("This change needs a video take");
  return {
    ...LTX_FILL_MEDIA_INPUTS.source,
    url: await asset.fetchableUrl(),
    filename: mediaFilename("source", asset.mediaType),
    contentType: asset.mediaType,
  };
}

/** Each mentioned Element's lead view: a Character's close portrait first. */
export function leadReferences(mentions: readonly ResolvedMention[]) {
  return mentions
    .map((m) => ({ mention: m, ref: referencesOf(m)[0] }))
    .filter((r) => r.ref)
    .slice(0, SEEDANCE_MAX_REFERENCES);
}

/**
 * Seedance's extend prompt: say it continues `[Video 1]`, describe only the
 * new seconds, and close with the constraints Comfy's template recommends.
 */
export function seedanceExtendPrompt(
  words: string,
  mentions: readonly { name: string }[],
) {
  const who = mentions
    .map((m, i) => `${m.name} is the one shown in [Image ${i + 1}].`)
    .join(" ");
  return [
    "Extend [Video 1] forward, continuing directly from its last frame.",
    words.trim().replace(/[.\s]*$/, ".") === "."
      ? "The action carries on naturally."
      : words.trim().replace(/[.\s]*$/, "."),
    who,
    "Keep the same people, clothes, place and light, and keep the camera moving as it was.",
    "One continuous shot: no cut, no fade, no black frames, no text.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2500);
}

async function seedanceExtendRequest(
  inputs: ExtendInputs,
  context: BuildContext,
): Promise<ProviderRequest> {
  const source = await context.asset(inputs.source);
  const leads = leadReferences(context.mentions);
  const images = await Promise.all(
    leads.map(async ({ ref }) => {
      const asset = await context.asset(ref!.asset);
      return asset.publicUrl ?? (await asset.dataUri());
    }),
  );
  return {
    model: SEEDANCE_EXTEND_MODEL,
    input: {
      content: [
        {
          type: "text",
          text: seedanceExtendPrompt(
            expandMentions(inputs.prompt ?? "", context.mentions),
            leads.map((l) => l.mention),
          ),
        },
        {
          type: "video_url",
          video_url: { url: await source.fetchableUrl() },
          role: "reference_video",
        },
        ...images.map((url) => ({
          type: "image_url",
          image_url: { url },
          role: "reference_image",
        })),
      ],
      // Only the new seconds come back; the append stage puts them after the take.
      omni_reference_task_type: "extend",
      duration: inputs.seconds,
      ratio: "adaptive",
      resolution: "720p",
      // The take keeps its own sound; the new seconds are silent.
      generate_audio: false,
      watermark: false,
    },
  };
}

/** The take, then Seedance's new seconds on its frame grid and size. */
export const extendAppendStage: MediaStage<"video.extend"> = {
  kind: "media",
  id: CONFORM_STAGE,
  label: "Joining the new seconds to the take",
  deadlineMs: 20 * 60_000,
  tasks(inputs, context) {
    const editId = context.saved.find((id) => !id.includes(":"));
    const edit = editId ? context.output(editId) : null;
    if (!edit) throw new Error("The new seconds are missing");
    return [
      {
        output: "video",
        operation: "append",
        parts: [
          { name: "source", ref: inputs.source },
          { name: "edit", ref: edit },
        ],
      },
    ];
  },
};

export const extendWorkflow: WorkflowDefinition<"video.extend"> = {
  kind: "video.extend",
  displayModel: (inputs) =>
    inputs.pipeline === "seedance" ? "Seedance 2.5" : "LTX 2.3",
  deadlineMs: 60 * 60_000,
  model: (inputs) =>
    inputs.pipeline === "seedance" ? SEEDANCE_EXTEND_MODEL : LTX_FILL_MODEL_ID,
  provider: (inputs) =>
    inputs.pipeline === "seedance" ? "router" : "cloud-workflow",
  cloudOutputNodes: LTX_FILL_OUTPUT_NODES,
  async build(inputs, context) {
    if (inputs.pipeline === "seedance")
      return seedanceExtendRequest(inputs, context);
    return {
      model: LTX_FILL_MODEL_ID,
      input: {
        graph: ltxFillGraph({
          mode: "extend",
          prompt: expandMentions(inputs.prompt ?? "", context.mentions, "full"),
          seed: seedFrom(JSON.stringify(inputs)),
        }),
        media: [await sourceMedia(context, inputs)],
      },
    };
  },
  outputs: seedanceRelocateOutputs,
  label: "Making the new seconds",
  stages: (inputs) =>
    inputs.pipeline === "seedance" ? [extendAppendStage] : [],
};

const fillBase = {
  deadlineMs: 45 * 60_000,
  model: () => LTX_FILL_MODEL_ID,
  provider: () => "cloud-workflow" as const,
  cloudOutputNodes: LTX_FILL_OUTPUT_NODES,
  outputs: () => [],
};

/** Words ask for something new in the area; without them it is cleared. */
export function areaAdds(inputs: AreaInputs) {
  return (inputs.prompt ?? "").trim().length >= 3;
}

export const areaWorkflow: WorkflowDefinition<"video.area"> = {
  ...fillBase,
  kind: "video.area",
  displayModel: (inputs) =>
    areaAdds(inputs) ? "Wan 2.1 VACE" : "LTX 2.3 In-Outpainting IC-LoRA",
  model: (inputs) => (areaAdds(inputs) ? WAN_VACE_MODEL_ID : LTX_FILL_MODEL_ID),
  cloudOutputNodes: WAN_VACE_OUTPUT_NODES,
  async build(inputs, context) {
    const seed = seedFrom(JSON.stringify(inputs));
    const media = [
      await sourceMedia(context, inputs),
      {
        ...LTX_FILL_MEDIA_INPUTS.mask,
        url: inputs.mask,
        filename: "mask.png",
        contentType: "image/png",
      },
    ];
    // A Thing as VACE's reference image came back empty in testing
    // (docs/take-edits.md), so the area takes words only.
    return areaAdds(inputs)
      ? {
          model: WAN_VACE_MODEL_ID,
          input: {
            graph: wanAreaGraph({
              prompt: inputs.prompt!.trim(),
              seed,
              reference: false,
            }),
            media,
          },
        }
      : {
          model: LTX_FILL_MODEL_ID,
          input: {
            graph: ltxFillGraph({ mode: "area", prompt: "", seed }),
            media,
          },
        };
  },
};

export const momentWorkflow: WorkflowDefinition<"video.moment"> = {
  ...fillBase,
  kind: "video.moment",
  displayModel: "LTX 2.3",
  async build(inputs, context) {
    return {
      model: LTX_FILL_MODEL_ID,
      input: {
        graph: ltxFillGraph({
          mode: "moment",
          prompt: expandMentions(inputs.prompt, context.mentions, "full"),
          range: inputs.range,
          seed: seedFrom(JSON.stringify(inputs)),
        }),
        media: [await sourceMedia(context, inputs)],
      },
    };
  },
};

export const reframeWorkflow: WorkflowDefinition<"video.reframe"> = {
  ...fillBase,
  kind: "video.reframe",
  displayModel: "LTX 2.3 outpainting IC-LoRA",
  async build(inputs, context) {
    return {
      model: LTX_FILL_MODEL_ID,
      input: {
        graph: ltxFillGraph({
          mode: "reframe",
          prompt: inputs.prompt ?? "",
          aspect: REFRAME_ASPECTS[inputs.aspect].ratio,
          fit: "whole",
          seed: seedFrom(JSON.stringify(inputs)),
        }),
        media: [await sourceMedia(context, inputs)],
      },
    };
  },
};
