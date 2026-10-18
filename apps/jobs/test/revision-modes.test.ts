import { expect, it } from "vitest";
import {
  areaInputsSchema,
  extendInputsSchema,
  ltxVideoInputsSchema,
  momentInputsSchema,
  reframeInputsSchema,
  objectSwapInputsSchema,
  restageInputsSchema,
  restyleInputsSchema,
  vfxInputsSchema,
  type ExtendInputs,
  type ResolvedMention,
} from "@open-cinema/contracts";
import {
  getWorkflowDefinition,
  type BuildContext,
  type CloudWorkflowRequest,
  type WorkflowDefinition,
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

/** Images the keyframe edit reads: the take's frame, then each reference. */
const keyframeImages = (request: CloudWorkflowRequest) =>
  Object.keys(ofType(request, "ReferenceMultiLatent")[0]!.inputs).filter((k) =>
    k.startsWith("images."),
  ).length;

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
  // The frame and both views go to the FLUX 3 Klein edit.
  expect(keyframeImages(request)).toBe(3);
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
  expect(keyframeImages(wordsOnly)).toBe(1);
  expect(keyframeImages(request)).toBe(2);

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

it("adds an effect with the take as the IC-LoRA reference, keeping someone only when clearing the set", async () => {
  const definition = getWorkflowDefinition("video.vfx")!;
  const build = async (inputs: unknown) =>
    (await definition.build(
      vfxInputsSchema.parse(inputs),
      context,
    )) as CloudWorkflowRequest;
  const clean = await build({
    source,
    effect: "clean-plate",
    prompt: "the people walking behind them",
    keep: "the couple holding hands",
    preservation: { preserve: ["performance"] },
  });
  expectWired(clean, definition.cloudOutputNodes!);
  const loras = (request: CloudWorkflowRequest) =>
    ofType(request, "LoraLoaderModelOnly").map((n) =>
      String(n.inputs.lora_name),
    );
  expect(loras(clean).at(-1)).toBe(
    "ltx-2.3-22b-ic-lora-clean-plate-1.0.safetensors",
  );
  const [guide] = ofType(clean, "LTXVAddGuide");
  expect(guide!.inputs.frame_idx).toBe(0);
  expect(ofType(clean, "SAM3_VideoTrack")).toHaveLength(1);

  const water = await build({
    source,
    effect: "water",
    keep: "the couple holding hands",
    preservation: { preserve: ["performance"] },
  });
  expect(loras(water).at(-1)).toMatch(/water-simulation/);
  expect(ofType(water, "SAM3_VideoTrack")).toHaveLength(0);
  const [prompt] = ofType(water, "CLIPTextEncode").filter((n) =>
    String(n.inputs.text).includes("ADD WATER"),
  );
  expect(prompt).toBeDefined();
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

const maya: ResolvedMention = {
  ...lantern,
  elementId: "char-maya",
  handle: "Maya",
  name: "Maya",
  type: "character",
  description: "A woman in her thirties with short dark hair.",
  references: [
    {
      asset: { type: "media-asset", assetId: "maya-portrait" },
      view: "front",
      roles: ["identity"],
    },
  ],
};
const MASK = "data:image/png;base64,iVBORw0KGgo=";

it("clears a painted area with LTX, and draws new words in it with Wan VACE", async () => {
  const definition = getWorkflowDefinition("video.area")!;
  const clear = areaInputsSchema.parse({
    source,
    mask: MASK,
    preservation: { preserve: ["camera"] },
  });
  const add = areaInputsSchema.parse({ ...clear, prompt: "A vase of tulips" });
  expect(definition.model(clear)).toBe("comfy-cloud/ltx-2.3-fill");
  expect(definition.model(add)).toBe("comfy-cloud/wan-2.1-vace");
  for (const inputs of [clear, add]) {
    const request = (await definition.build(
      inputs,
      context,
    )) as CloudWorkflowRequest;
    expectWired(request, definition.cloudOutputNodes!);
    expect(request.input.media.map((m) => m.url)).toEqual([
      "https://comfy-storage.test/take",
      MASK,
    ]);
    // The take's own pixels go back outside the painted area.
    const composite = graphOf(request).result!;
    expect(composite.inputs.destination).toEqual(["source_clip", 0]);
  }
  const wan = (await definition.build(add, context)) as CloudWorkflowRequest;
  expect(ofType(wan, "WanVaceToVideo")).toHaveLength(1);
  // The template's CausVid LoRA is non-commercial; it stays out.
  expect(ofType(wan, "LoraLoaderModelOnly")).toHaveLength(0);
});

const stagesOf = (
  definition: WorkflowDefinition<"video.extend">,
  inputs: ExtendInputs,
) =>
  typeof definition.stages === "function"
    ? definition.stages(inputs)
    : (definition.stages ?? []);

it("redoes a moment with keyframes either side and splices it into the take", async () => {
  const definition = getWorkflowDefinition("video.moment")!;
  const inputs = momentInputsSchema.parse({
    source,
    range: { start: 2, end: 3.4 },
    prompt: "@Maya looks up and smiles",
    mentions: [{ elementId: "char-maya" }],
    preservation: { preserve: ["framing"] },
  });
  const request = (await definition.build(inputs, {
    ...context,
    mentions: [maya],
  })) as CloudWorkflowRequest;
  expectWired(request, definition.cloudOutputNodes!);
  expect(ofType(request, "LTXVAddGuide").length).toBeGreaterThanOrEqual(4);
  expect(ofType(request, "ReplaceImagesInBatch")).toHaveLength(1);
  const prompts = ofType(request, "CLIPTextEncode").map((n) => n.inputs.text);
  expect(prompts.some((p) => String(p).includes("short dark hair"))).toBe(true);
  expect(() =>
    momentInputsSchema.parse({ ...inputs, range: { start: 1, end: 5 } }),
  ).toThrow();
});

it("reframes to a new aspect with the outpaint IC-LoRA", async () => {
  const definition = getWorkflowDefinition("video.reframe")!;
  const inputs = reframeInputsSchema.parse({
    source,
    aspect: "9:16",
    preservation: { preserve: ["performance"] },
  });
  const request = (await definition.build(
    inputs,
    context,
  )) as CloudWorkflowRequest;
  expectWired(request, definition.cloudOutputNodes!);
  const loras = ofType(request, "LoraLoaderModelOnly").map(
    (n) => n.inputs.lora_name,
  );
  expect(loras).toContain("ltx-2.3-22b-ic-lora-outpaint.safetensors");
});

it("makes a take longer with Seedance extend, sending the Character's portrait", async () => {
  const definition = getWorkflowDefinition("video.extend")!;
  const inputs = extendInputsSchema.parse({
    source,
    seconds: 6,
    prompt: "@Maya walks in from the left",
    mentions: [{ elementId: "char-maya" }],
    preservation: { preserve: ["performance"] },
  });
  expect(definition.provider?.(inputs)).toBe("router");
  const request = await definition.build(inputs, {
    ...context,
    mentions: [maya],
  });
  const input = request.input as {
    content: { type: string; role?: string; text?: string }[];
    omni_reference_task_type: string;
    duration: number;
  };
  expect(input.omni_reference_task_type).toBe("extend");
  expect(input.duration).toBe(6);
  expect(input.content.map((c) => c.role ?? c.type)).toEqual([
    "text",
    "reference_video",
    "reference_image",
  ]);
  expect(input.content[0]!.text).toContain("[Image 1]");
  expect(stagesOf(definition, inputs).map((s) => s.id)).toEqual(["conform"]);
});

it("makes a take longer with LTX as one Cloud graph", async () => {
  const definition = getWorkflowDefinition("video.extend")!;
  const inputs = extendInputsSchema.parse({
    source,
    pipeline: "ltx",
    preservation: { preserve: ["performance"] },
  });
  expect(definition.provider?.(inputs)).toBe("cloud-workflow");
  const request = (await definition.build(
    inputs,
    context,
  )) as CloudWorkflowRequest;
  expectWired(request, definition.cloudOutputNodes!);
  expect(ofType(request, "ImageBatch").length).toBeGreaterThanOrEqual(1);
  expect(stagesOf(definition, inputs)).toHaveLength(0);
});
