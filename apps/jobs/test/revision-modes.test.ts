import { expect, it } from "vitest";
import {
  ltxVideoInputsSchema,
  objectSwapInputsSchema,
  restageInputsSchema,
  restyleInputsSchema,
  type ResolvedMention,
} from "@open-cinema/contracts";
import {
  getWorkflowDefinition,
  type BuildContext,
  type CloudWorkflowRequest,
} from "@open-cinema/comfy";

const lantern: ResolvedMention = {
  elementId: "thing-lantern",
  handle: "Lantern",
  name: "Lantern",
  type: "thing",
  version: 1,
  description: "A weathered brass ship lantern.",
  stateId: null,
  stateName: null,
  stateDescription: null,
  states: [],
  motion: [],
  references: [
    {
      asset: { type: "media-asset", assetId: "lantern-detail" },
      view: "detail",
      roles: ["material"],
    },
    {
      asset: { type: "media-asset", assetId: "lantern-front" },
      view: "front",
      roles: ["identity"],
    },
  ],
};

const VIDEOS = new Set(["take"]);
const context: BuildContext = {
  mentions: [lantern],
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

type Node = { class_type: string; inputs: Record<string, unknown> };
const graphOf = (request: CloudWorkflowRequest) =>
  request.input.graph as Record<string, Node>;
const ofType = (request: CloudWorkflowRequest, type: string) =>
  Object.values(graphOf(request)).filter((n) => n.class_type === type);

/** Every link names a node that exists and each media input a loader. */
function expectWired(
  request: CloudWorkflowRequest,
  outputs: readonly string[],
) {
  const graph = graphOf(request);
  for (const [id, node] of Object.entries(graph))
    for (const value of Object.values(node.inputs))
      if (Array.isArray(value) && typeof value[0] === "string")
        expect(graph[value[0]], `${id} links to ${value[0]}`).toBeDefined();
  for (const media of request.input.media)
    expect(graph[media.node]?.inputs).toHaveProperty(media.field);
  for (const id of outputs) expect(graph[id]).toBeDefined();
}

const source = { type: "media-asset", assetId: "take" } as const;

it("swaps an object with the Thing's sheet and keeps the take outside SAM 3's masks", async () => {
  const definition = getWorkflowDefinition("video.object-swap")!;
  const inputs = objectSwapInputsSchema.parse({
    source,
    thing: { elementId: "thing-lantern" },
    original: "the table lamp",
    point: { x: 0.3, y: 0.4 },
    preservation: { preserve: ["performance", "background"] },
  });
  expect(definition.provider?.(inputs)).toBe("cloud-workflow");
  const request = (await definition.build(
    inputs,
    context,
  )) as CloudWorkflowRequest;
  expectWired(request, definition.cloudOutputNodes!);
  // The front view leads the sheet, then the detail.
  expect(request.input.media.map((m) => m.url)).toEqual([
    "https://comfy-storage.test/take",
    "https://comfy-storage.test/lantern-front",
    "https://comfy-storage.test/lantern-detail",
  ]);
  expect(ofType(request, "ReferenceLatent").length).toBeGreaterThanOrEqual(2);
  const prompts = ofType(request, "CLIPTextEncode").map((n) => n.inputs.text);
  expect(prompts).toContain("the table lamp");
  expect(prompts).toContain("Lantern");
  expect(ofType(request, "SAM3_VideoTrack")).toHaveLength(2);
  // The union IC-LoRA's depth guide comes from MoGe-2 (MIT), the model Re-stage loads.
  expect(ofType(request, "LoadMoGeModel")[0]?.inputs.model_name).toBe(
    "moge_2_vitl_normal_fp16.safetensors",
  );
  expect(ofType(request, "MoGeRender")[0]?.inputs.output).toBe("depth");
  expect(ofType(request, "DepthAnythingV2Preprocessor")).toHaveLength(0);
  const composite = ofType(request, "ImageCompositeMasked")[0]!;
  expect(composite.inputs.destination).toEqual(["source_clip", 0]);
});

it("refuses a swap without an approved reference", async () => {
  const definition = getWorkflowDefinition("video.object-swap")!;
  const inputs = objectSwapInputsSchema.parse({
    source,
    thing: { elementId: "thing-lantern" },
    original: "the lamp",
    preservation: { preserve: ["performance"] },
  });
  await expect(
    definition.build(inputs, {
      ...context,
      mentions: [{ ...lantern, references: [] }],
    }),
  ).rejects.toThrow(/reference/);
});

it("restyles from a style image or from words alone, but not from nothing", async () => {
  const definition = getWorkflowDefinition("video.restyle")!;
  const withImage = restyleInputsSchema.parse({
    source,
    styleImage: { type: "media-asset", assetId: "painting" },
    preservation: { preserve: ["performance"] },
  });
  const request = (await definition.build(
    withImage,
    context,
  )) as CloudWorkflowRequest;
  expectWired(request, definition.cloudOutputNodes!);
  expect(request.input.media).toHaveLength(2);
  expect(ofType(request, "SAM3_VideoTrack")).toHaveLength(0);

  const words = restyleInputsSchema.parse({
    source,
    prompt: "hand-painted watercolour",
    preservation: { preserve: ["performance"] },
  });
  const wordsOnly = (await definition.build(
    words,
    context,
  )) as CloudWorkflowRequest;
  expect(wordsOnly.input.media).toHaveLength(1);
  // Only the take's own frame guides the edit.
  expect(ofType(wordsOnly, "ReferenceLatent").length).toBeLessThan(
    ofType(request, "ReferenceLatent").length,
  );

  const nothing = restyleInputsSchema.parse({
    source,
    preservation: { preserve: ["performance"] },
  });
  await expect(definition.build(nothing, context)).rejects.toThrow(/style/);
});

it("re-stages a take by re-projecting every frame and filling with Lightricks' own IC-LoRA", async () => {
  const definition = getWorkflowDefinition("video.restage")!;
  const inputs = restageInputsSchema.parse({
    source,
    angle: "from-left",
    preservation: { preserve: ["performance"] },
  });
  const request = (await definition.build(
    inputs,
    context,
  )) as CloudWorkflowRequest;
  expectWired(request, definition.cloudOutputNodes!);
  const loras = ofType(request, "LoraLoaderModelOnly").map((n) =>
    String(n.inputs.lora_name),
  );
  expect(loras).toEqual(["ltx-2.3-22b-ic-lora-in-outpainting-0.9.safetensors"]);
  expect(ofType(request, "RenderMesh")).toHaveLength(97);
  const [camera] = ofType(request, "CreateCameraInfo");
  expect(camera!.inputs["mode.position_x"]).toBeLessThan(0);
});

it("runs a camera move on Cloud and leaves free-camera LTX on Router", async () => {
  const definition = getWorkflowDefinition("video.ltx")!;
  const free = ltxVideoInputsSchema.parse({ prompt: "A harbor at dawn" });
  expect(definition.provider?.(free) ?? "router").toBe("router");
  const dolly = ltxVideoInputsSchema.parse({
    prompt: "A harbor at dawn",
    camera: "dolly-in",
    durationSeconds: 4,
  });
  expect(definition.provider?.(dolly)).toBe("cloud-workflow");
  const request = (await definition.build(
    dolly,
    context,
  )) as CloudWorkflowRequest;
  expectWired(request, definition.cloudOutputNodes!);
  const loras = ofType(request, "LoraLoaderModelOnly").map((n) =>
    String(n.inputs.lora_name),
  );
  expect(loras.some((name) => /dolly-in/i.test(name))).toBe(true);
  expect(request.input.media).toHaveLength(0);
});
