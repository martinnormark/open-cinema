import { expect, it } from "vitest";
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

it("runs on Comfy Cloud and keeps Kling as the default pipeline", () => {
  const kling = backgroundReplaceInputsSchema.parse({
    source: { type: "media-asset", assetId: "take" },
    preservation: { preserve: ["foreground"] },
  });
  expect(definition.provider?.(kling)).toBe("router");
  expect(definition.model(kling)).toBe("kling/kling-v3-omni");
  const alpha = alphaInputs({});
  expect(definition.provider?.(alpha)).toBe("cloud-workflow");
  expect(definition.model(alpha)).toBe("comfy-cloud/ltx-2.5-alpha-gen");
  // The composite keeps the take's own pixels, so no matte or lock stage follows.
  const kind = "video.background-replace";
  expect(workflowStages(kind, alpha)).toEqual([]);
  expect(workflowStages(kind, kling).map((s) => s.id)).toHaveLength(2);
});

it("mattes the take with Alpha Gen and composites it over the Location's establishing view", async () => {
  const request = (await definition.build(
    alphaInputs({ location: { elementId: "loc-harbor" } }),
    context,
  )) as CloudWorkflowRequest;

  expect(request.input.media).toEqual([
    {
      node: "source",
      field: "file",
      url: "https://comfy-storage.test/take",
      filename: "source.mp4",
      contentType: "video/mp4",
    },
    {
      node: "background_image",
      field: "image",
      url: "https://comfy-storage.test/wide",
      filename: "background.jpg",
      contentType: "image/jpeg",
    },
  ]);
  const graph = nodes(request);
  const lora = graph.find((n) => n.class_type === "LTXICLoRALoaderModelOnly")!;
  expect(lora.inputs).toMatchObject({
    lora_name: "ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors",
    strength_model: 1,
  });
  // The model card requires an empty prompt.
  for (const text of graph.filter((n) => n.class_type === "CLIPTextEncode"))
    expect(text.inputs.text).toBe("");
  // The composite keeps the source pixels and writes the matte alongside it.
  const composite = graph.find((n) => n.class_type === "ImageCompositeMasked")!;
  expect(composite.inputs.source).toEqual(["clip", 0]);
  expect(
    graph
      .filter((n) => n.class_type === "SaveVideo")
      .map((n) => n.inputs.filename_prefix),
  ).toEqual(["open_cinema/alpha_composite", "open_cinema/alpha_matte"]);
  expect(definition.cloudOutputNodes).toEqual(["save_composite", "save_matte"]);
});

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

it("builds the same graph again for the same take", async () => {
  const inputs = alphaInputs({ location: { elementId: "loc-harbor" } });
  const first = await definition.build(inputs, context);
  const second = await definition.build(inputs, context);
  expect(second).toEqual(first);
});

it("asks for a background when there is neither a plate nor a Location", async () => {
  await expect(definition.build(alphaInputs({}), context)).rejects.toThrow(
    "Choose a background image or clip, or a Location",
  );
});
