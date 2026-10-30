import { expect, it } from "bun:test";
import {
  backgroundReplaceInputsSchema,
  type ResolvedMention,
} from "@open-cinema/contracts";
import {
  backgroundReplaceOutputs,
  getWorkflowDefinition,
  type BuildContext,
} from "@open-cinema/comfy";

const harbor: ResolvedMention = {
  elementId: "loc-harbor",
  handle: "Harbor",
  name: "Harbor",
  type: "location",
  version: 3,
  description: "A small working fishing harbor with a weathered wooden pier.",
  stateId: "dusk",
  stateName: "dusk",
  stateDescription: "Sodium lamps coming on under a deep blue sky.",
  states: [],
  motion: [],
  references: [
    {
      asset: { type: "media-asset", assetId: "pier" },
      view: "detail",
      roles: ["material"],
    },
    {
      asset: { type: "media-asset", assetId: "wide" },
      view: "establishing",
      roles: ["layout"],
    },
  ],
};

function context(publicOrigin: string | null): BuildContext {
  return {
    mentions: [harbor],
    asset: async (ref) => {
      const id = ref.type === "media-asset" ? ref.assetId : ref.outputId;
      const publicUrl =
        publicOrigin && ref.type === "media-asset"
          ? `${publicOrigin}/${ref.assetId}`
          : null;
      return {
        ref,
        mediaType:
          ref.type === "media-asset" && ref.assetId === "take"
            ? "video/mp4"
            : "image/png",
        sizeBytes: 10,
        publicUrl,
        fetchableUrl: async () =>
          publicUrl ?? `https://comfy-storage.test/${id}`,
        base64: async () => "AAAA",
        dataUri: async () => "data:image/png;base64,AAAA",
      };
    },
  };
}

const inputs = backgroundReplaceInputsSchema.parse({
  source: { type: "media-asset", assetId: "take" },
  location: { elementId: "loc-harbor", stateId: "dusk" },
  target: { type: "background" },
  preservation: {
    preserve: ["foreground", "performance", "timing", "camera"],
    allowIntegration: true,
  },
});

it("edits the source on Kling 3.0 Omni with the Location's establishing view first", async () => {
  const definition = getWorkflowDefinition("video.background-replace")!;
  const request = await definition.build(inputs, context("https://media.test"));
  expect(request.model).toBe("kling/kling-v3-omni");
  expect(request.input).toMatchObject({
    video_list: [
      {
        video_url: "https://media.test/take",
        refer_type: "base",
        keep_original_sound: "no",
      },
    ],
    image_list: [
      { image_url: "https://media.test/wide" },
      { image_url: "https://media.test/pier" },
    ],
    mode: "std",
  });
  const prompt = String((request.input as Record<string, unknown>).prompt);
  expect(prompt).toContain("background of <<<video_1>>>");
  expect(prompt).toContain("Harbor (dusk)");
  expect(prompt).toContain("<<<image_1>>> and <<<image_2>>>");
  expect(prompt).toContain("Keep the camera movement");
});

it("sends the source by Comfy storage URL and references as bare base64 when there is no public origin", async () => {
  const definition = getWorkflowDefinition("video.background-replace")!;
  const request = await definition.build(inputs, context(null));
  expect(request.input).toMatchObject({
    video_list: [{ video_url: "https://comfy-storage.test/take" }],
    // Kling answers a data: URI with provider_error (seen live 2026-10-17).
    image_list: [{ image_url: "AAAA" }, { image_url: "AAAA" }],
  });
});

const moving = backgroundReplaceInputsSchema.parse({
  ...inputs,
  pipeline: "seedance",
});

it("moves the whole shot on Seedance 2.5 with the Location's references as data URIs", async () => {
  const definition = getWorkflowDefinition("video.background-replace")!;
  const { displayModel } = definition;
  expect(
    typeof displayModel === "function" ? displayModel(moving) : displayModel,
  ).toBe("Seedance 2.5");
  const request = await definition.build(moving, context(null));
  expect(request.model).toBe("byteplus/dreamina-seedance-2-5-260628");
  expect(request.input).toMatchObject({
    content: [
      { type: "text" },
      {
        type: "video_url",
        video_url: { url: "https://comfy-storage.test/take" },
        role: "reference_video",
      },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AAAA" },
        role: "reference_image",
      },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,AAAA" },
        role: "reference_image",
      },
    ],
    // Seedance edits accept only -1 (keep the source's length).
    duration: -1,
    resolution: "720p",
    generate_audio: false,
  });
  const content = (request.input as { content: { text?: string }[] }).content;
  const prompt = String(content[0]!.text);
  expect(prompt).toContain("Move the scene in [Video 1] to Harbor (dusk)");
  expect(prompt).toContain("[Image 1] and [Image 2]");
  expect(prompt).toContain("everyone who passes through");
});

it("reads Seedance results and conforms them instead of locking", () => {
  const definition = getWorkflowDefinition("video.background-replace")!;
  // Shape of the live Router result on 2026-10-18 (URL shortened).
  const result = {
    id: "cgt-1",
    status: "succeeded",
    content: { video_url: "https://storage.test/seedance.mp4" },
  };
  expect(definition.outputs(result)).toEqual([
    {
      providerAssetId: "video",
      url: "https://storage.test/seedance.mp4",
      mediaType: "video/mp4",
    },
  ]);
  const stageIds = (i: typeof inputs) => {
    const stages = definition.stages;
    return (typeof stages === "function" ? stages(i) : (stages ?? [])).map(
      (stage) => stage.id,
    );
  };
  expect(stageIds(moving)).toEqual(["conform"]);
  expect(stageIds(inputs)).not.toContain("conform");
});
