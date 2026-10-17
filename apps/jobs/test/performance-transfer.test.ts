import { expect, it } from "vitest";
import {
  generationRequestSchema,
  performanceTransferInputsSchema,
  requestAssetRefs,
  requestMentions,
  type ResolvedMention,
} from "@open-cinema/contracts";
import {
  estimateGeneration,
  getWorkflowDefinition,
  workflowStages,
  type BuildContext,
  type CloudWorkflowRequest,
} from "@open-cinema/comfy";

const mara: ResolvedMention = {
  elementId: "char-mara",
  handle: "Mara",
  name: "Mara",
  type: "character",
  version: 3,
  description: "Woman in her forties with a white blunt bob and freckles.",
  stateId: null,
  stateName: null,
  stateDescription: null,
  references: [
    {
      asset: { type: "media-asset", assetId: "mara-sheet" },
      view: "sheet",
      roles: ["appearance", "wardrobe"],
    },
    {
      asset: { type: "media-asset", assetId: "mara-face" },
      view: "face-closeup",
      roles: ["identity"],
    },
    {
      asset: { type: "media-asset", assetId: "mara-full" },
      view: "full-body",
      roles: ["appearance", "wardrobe"],
    },
  ],
};
const field: ResolvedMention = {
  ...mara,
  elementId: "loc-field",
  handle: "Poppies",
  name: "Poppy field",
  type: "location",
  description: "A poppy meadow under an overcast sky.",
  references: [],
};

const context: BuildContext = {
  mentions: [mara, field],
  asset: async (ref) => {
    const id = ref.type === "media-asset" ? ref.assetId : ref.outputId;
    return {
      ref,
      mediaType: id === "dance" ? "video/mp4" : "image/jpeg",
      sizeBytes: 10,
      publicUrl: null,
      fetchableUrl: async () => `https://comfy-storage.test/${id}`,
      base64: async () => "AAAA",
      dataUri: async () => "data:image/jpeg;base64,AAAA",
    };
  },
};

function inputs(extra: Record<string, unknown> = {}) {
  return performanceTransferInputsSchema.parse({
    source: { type: "media-asset", assetId: "dance" },
    character: { elementId: "char-mara" },
    location: { elementId: "loc-field" },
    prompt: "@Mara dances through the poppies",
    ...extra,
  });
}

type Node = { class_type: string; inputs: Record<string, unknown> };
const node = (request: CloudWorkflowRequest, id: string) =>
  request.input.graph[id] as Node | undefined;
const definition = getWorkflowDefinition("video.performance-transfer")!;
const build = async (extra?: Record<string, unknown>) =>
  (await definition.build(inputs(extra), context)) as CloudWorkflowRequest;

it("is a Cloud graph with no follow-up stages", () => {
  expect(definition.provider?.(inputs())).toBe("cloud-workflow");
  expect(definition.model(inputs())).toBe("comfy-cloud/ltx-2.3-union-pose");
  expect(workflowStages("video.performance-transfer", inputs())).toEqual([]);
  expect(definition.cloudOutputNodes).toEqual(["save_result", "save_control"]);
});

it("drives LTX 2.3 Union Control with the source's pose and holds a given keyframe", async () => {
  const request = await build({
    firstFrame: { type: "media-asset", assetId: "keyframe" },
  });
  expect(request.input.media).toEqual([
    {
      node: "source",
      field: "file",
      url: "https://comfy-storage.test/dance",
      filename: "source.mp4",
      contentType: "video/mp4",
    },
    {
      node: "keyframe",
      field: "image",
      url: "https://comfy-storage.test/keyframe",
      filename: "keyframe.jpg",
      contentType: "image/jpeg",
    },
  ]);
  expect(node(request, "union_control")?.inputs.lora_name).toBe(
    "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors",
  );
  expect(node(request, "checkpoint")?.inputs.ckpt_name).toBe(
    "ltx-2.3-22b-distilled-fp8.safetensors",
  );
  // Only the skeleton reaches the guide, so the Character's look is free.
  expect(node(request, "guide")?.inputs).toMatchObject({
    image: ["pose_fit", 0],
    strength: 0.9,
    latent: ["keyframe_condition", 0],
    // The adapter reads its guide at half size, as its metadata says.
    iclora_parameters: ["iclora_parameters", 0],
  });
  expect(request.input.graph).not.toHaveProperty("depth");
  expect(node(request, "keyframe_condition")?.inputs.strength).toBe(1);
  // Who and where are carried by text: the mention and each description.
  const text = node(request, "positive_text")?.inputs.text as string;
  expect(text).toContain("Mara dances through the poppies.");
  expect(text).toContain("white blunt bob");
  expect(text).toContain("Poppy field: A poppy meadow");
});

it("leans on the Character's full-body reference, never the headless sheet, without a keyframe", async () => {
  const request = await build();
  expect(request.input.media[1]).toMatchObject({
    node: "keyframe",
    url: "https://comfy-storage.test/mara-full",
  });
  expect(node(request, "keyframe_condition")?.inputs.strength).toBe(0.6);
});

it("generates from the prompt alone when there is no keyframe or Character", async () => {
  const request = await build({ character: undefined });
  expect(request.input.media).toHaveLength(1);
  expect(request.input.graph).not.toHaveProperty("keyframe");
  expect(node(request, "guide")?.inputs.latent).toEqual(["empty_video", 0]);
});

it("adds the source's depth under the skeleton for pose-depth", async () => {
  const request = await build({ control: "pose-depth", strength: 0.5 });
  expect(node(request, "guide")?.inputs).toMatchObject({
    image: ["pose_over_depth", 0],
    strength: 0.5,
  });
  expect(node(request, "depth")?.class_type).toBe(
    "DepthAnythingV2Preprocessor",
  );
});

it("keeps runs short: at most 97 frames (8n+1) and 768 px, on a 64 px grid", async () => {
  const request = await build();
  const expression = (id: string) =>
    node(request, id)?.inputs.expression as string;
  expect(expression("frame_count")).toBe(
    "max(1, ((min(a, 97) - 1) // 8) * 8 + 1)",
  );
  expect(expression("out_width")).toBe(
    "max(64, round(a * min(1, 768 / max(a, b)) / 64) * 64)",
  );
});

it("builds the same request again for the same inputs", async () => {
  expect(await build()).toEqual(await build());
});

it("rejects a still image as the performance and a non-Character performer", async () => {
  await expect(
    build({ source: { type: "media-asset", assetId: "keyframe" } }),
  ).rejects.toThrow("Choose a video clip whose performance to reuse");
  await expect(
    build({ character: { elementId: "loc-field" } }),
  ).rejects.toThrow("Choose a Character to perform the shot");
});

it("lists its media and Elements once, and estimates by GPU time", () => {
  const request = generationRequestSchema.parse({
    workflowKind: "video.performance-transfer",
    inputs: {
      ...inputs({ firstFrame: { type: "media-asset", assetId: "keyframe" } }),
      mentions: [{ elementId: "char-mara" }],
    },
  });
  expect(requestAssetRefs(request)).toEqual([
    { type: "media-asset", assetId: "dance" },
    { type: "media-asset", assetId: "keyframe" },
  ]);
  expect(requestMentions(request)).toEqual([
    { elementId: "char-mara" },
    { elementId: "loc-field" },
  ]);
  expect(estimateGeneration(request)).toMatchObject({
    credits: null,
    basis: "heuristic",
  });
});
