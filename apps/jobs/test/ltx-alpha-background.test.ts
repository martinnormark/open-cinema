import { expect, it } from "bun:test";
import {
  backgroundReplaceInputsSchema,
  type ResolvedMention,
} from "@open-cinema/contracts";
import {
  getWorkflowDefinition,
  workflowStages,
  type BuildContext,
  type CloudWorkflowRequest,
} from "@open-cinema/comfy";

const harbor: ResolvedMention = {
  elementId: "loc-harbor",
  handle: "Harbor",
  name: "Harbor",
  type: "location",
  version: 1,
  description: "A small working fishing harbor.",
  stateId: null,
  stateName: null,
  stateDescription: null,
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

const VIDEOS = new Set(["take", "plate"]);
const context: BuildContext = {
  mentions: [harbor],
  asset: async (ref) => {
    const id = ref.type === "media-asset" ? ref.assetId : ref.outputId;
    return {
      ref,
      mediaType: VIDEOS.has(id) ? "video/mp4" : "image/jpeg",
      sizeBytes: 10,
      publicUrl: null,
      fetchableUrl: async () => `https://comfy-storage.test/${id}`,
      base64: async () => "AAAA",
      dataUri: async () => "data:image/jpeg;base64,AAAA",
    };
  },
};

function alphaInputs(extra: Record<string, unknown>) {
  return backgroundReplaceInputsSchema.parse({
    source: { type: "media-asset", assetId: "take" },
    preservation: { preserve: ["foreground", "performance"] },
    pipeline: "ltx-alpha",
    ...extra,
  });
}

type Node = { class_type: string; inputs: Record<string, unknown> };
const nodes = (request: CloudWorkflowRequest) =>
  Object.values(request.input.graph) as Node[];

const definition = getWorkflowDefinition("video.background-replace")!;

it("uses an explicit background clip, such as an LTX 2.5 plate, through the video loader", async () => {
  const request = (await definition.build(
    alphaInputs({
      location: { elementId: "loc-harbor" },
      background: { type: "media-asset", assetId: "plate" },
    }),
    context,
  )) as CloudWorkflowRequest;
  expect(request.input.media[1]).toMatchObject({
    node: "background_video",
    field: "file",
    url: "https://comfy-storage.test/plate",
  });
  expect(request.input.graph).not.toHaveProperty("background_image");
});

it("asks for a background when there is neither a plate nor a Location", async () => {
  await expect(definition.build(alphaInputs({}), context)).rejects.toThrow(
    "Choose a background image or clip, or a Location",
  );
});
