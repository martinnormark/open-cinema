import { expect, it } from "bun:test";
import {
  characterReplaceInputsSchema,
  resultOutputs,
  type ResolvedMention,
} from "@open-cinema/contracts";
import {
  getWorkflowDefinition,
  scailFrameCount,
  scailSegments,
  type BuildContext,
} from "@open-cinema/comfy";

const mara: ResolvedMention = {
  elementId: "char-mara",
  handle: "Mara",
  name: "Mara",
  type: "character",
  version: 2,
  description:
    "a woman in her early thirties with a short platinum blunt bob and freckles.",
  stateId: null,
  stateName: null,
  stateDescription: null,
  states: [],
  motion: [],
  references: [
    {
      asset: { type: "media-asset", assetId: "mara-face" },
      view: "face-closeup",
      roles: ["identity"],
    },
    {
      asset: { type: "media-asset", assetId: "mara-pose" },
      view: "full-body",
      roles: ["pose"],
    },
    {
      asset: { type: "media-asset", assetId: "mara-back" },
      view: "rear",
      roles: ["appearance"],
    },
    {
      asset: { type: "media-asset", assetId: "mara-full" },
      view: "full-body",
      roles: ["identity", "wardrobe"],
    },
  ],
};

function context(): BuildContext {
  return {
    mentions: [mara],
    asset: async (ref) => {
      const id = ref.type === "media-asset" ? ref.assetId : ref.outputId;
      return {
        ref,
        mediaType: id === "take" ? "video/mp4" : "image/jpeg",
        sizeBytes: 10,
        publicUrl: null,
        fetchableUrl: async () => `https://comfy-storage.test/${id}`,
        base64: async () => `b64-${id}`,
        dataUri: async () => `data:image/jpeg;base64,b64-${id}`,
      };
    },
  };
}

const base = {
  source: { type: "media-asset", assetId: "take" },
  character: { elementId: "char-mara" },
  target: {
    type: "person",
    point: { x: 0.7, y: 0.4, timeMs: 0 },
    description: "the woman with long red hair",
  },
  preservation: {
    preserve: ["performance", "timing", "camera", "other-people"],
  },
};

it("recasts on Kling 3.0 Omni with the source by URL and the Character's face first", async () => {
  const definition = getWorkflowDefinition("video.character-replace")!;
  const request = await definition.build(
    characterReplaceInputsSchema.parse(base),
    context(),
  );
  expect(request.model).toBe("kling/kling-v3-omni");
  expect(request.input).toMatchObject({
    mode: "pro",
    video_list: [
      {
        video_url: "https://comfy-storage.test/take",
        refer_type: "base",
        keep_original_sound: "no",
      },
    ],
    // Pose-only references are not identity evidence and are left out.
    image_list: [
      { image_url: "b64-mara-face" },
      { image_url: "b64-mara-full" },
      { image_url: "b64-mara-back" },
    ],
  });
  const prompt = String((request.input as Record<string, unknown>).prompt);
  expect(prompt).toContain(
    "In <<<video_1>>>, replace the woman with long red hair (on the right of the frame) with the person shown in <<<image_1>>>, <<<image_2>>>, <<<image_3>>>: Mara, a woman",
  );
  expect(prompt).toContain("reference outfit");
  expect(prompt).toContain("Keep every other person");
  // Without a headless sheet there is nothing to explain.
  expect(prompt).not.toContain("character sheet");
});

it("sends the close portrait as the face and the headless sheet as the outfit", async () => {
  const sheeted: ResolvedMention = {
    ...mara,
    references: [
      {
        asset: { type: "media-asset", assetId: "mara-sheet" },
        view: "sheet",
        roles: [],
      },
      {
        asset: { type: "media-asset", assetId: "mara-smile" },
        view: "smile",
        roles: [],
      },
      {
        asset: { type: "media-asset", assetId: "mara-portrait" },
        view: "face-closeup",
        roles: [],
      },
    ],
  };
  const definition = getWorkflowDefinition("video.character-replace")!;
  const request = await definition.build(
    characterReplaceInputsSchema.parse(base),
    { ...context(), mentions: [sheeted] },
  );
  expect((request.input as Record<string, unknown>).image_list).toEqual([
    { image_url: "b64-mara-portrait" },
    { image_url: "b64-mara-sheet" },
    { image_url: "b64-mara-smile" },
  ]);
  const prompt = String((request.input as Record<string, unknown>).prompt);
  expect(prompt).toContain(
    "Take the face only from the close portrait in <<<image_1>>>, <<<image_3>>>. <<<image_2>>> is a character sheet",
  );
  expect(prompt).toContain(
    "heads are left out of the full-body panels on purpose",
  );
});

it("keeps the source clothing and sound with face views only when the creator preserves them", async () => {
  const definition = getWorkflowDefinition("video.character-replace")!;
  const request = await definition.build(
    characterReplaceInputsSchema.parse({
      ...base,
      target: { type: "person", point: { x: 0.2, y: 0.5, timeMs: 0 } },
      preservation: { preserve: ["performance", "wardrobe", "audio"] },
    }),
    context(),
  );
  const prompt = String((request.input as Record<string, unknown>).prompt);
  expect(prompt).toContain("replace the person on the left of the frame");
  expect(prompt).toContain("Keep the original clothing");
  expect(request.input).toMatchObject({
    video_list: [{ keep_original_sound: "yes" }],
  });
  // Body views carry the reference outfit, which Kling follows over the prompt.
  expect((request.input as Record<string, unknown>).image_list).toEqual([
    { image_url: "b64-mara-face" },
  ]);
});

it("conforms the 24 fps edit onto the source's frame grid and offers only that", async () => {
  const definition = getWorkflowDefinition("video.character-replace")!;
  const stages =
    typeof definition.stages === "function"
      ? definition.stages(characterReplaceInputsSchema.parse(base))
      : (definition.stages ?? []);
  const [conform] = stages;
  if (conform?.kind !== "media") throw new Error("expected a media stage");
  const edit = { type: "job-output", jobId: "j", outputId: "j:v1" } as const;
  const tasks = conform.tasks(characterReplaceInputsSchema.parse(base), {
    ...context(),
    saved: ["v1"],
    output: (id: string) => (id === "v1" ? edit : null),
  });
  expect(tasks).toEqual([
    {
      output: "video",
      operation: "conform",
      parts: [
        { name: "source", ref: { type: "media-asset", assetId: "take" } },
        { name: "edit", ref: edit },
      ],
    },
  ]);
  expect(
    resultOutputs([
      { providerAssetId: "v1" },
      { providerAssetId: "conform:video" },
    ]),
  ).toEqual([{ providerAssetId: "conform:video" }]);
});

it("refuses a recast with no way to identify the person", async () => {
  const definition = getWorkflowDefinition("video.character-replace")!;
  await expect(
    definition.build(
      characterReplaceInputsSchema.parse({
        ...base,
        target: { type: "person" },
      }),
      context(),
    ),
  ).rejects.toThrow("Describe or point at the person to recast");
});

it("recasts on MiniMax H3 as a Cloud graph that tracks the clicked person with SAM 3.1", async () => {
  const definition = getWorkflowDefinition("video.character-replace")!;
  const inputs = characterReplaceInputsSchema.parse({
    ...base,
    pipeline: "minimax-h3",
    target: {
      ...base.target,
      point: { x: 0.7, y: 0.4, timeMs: 1500 },
      box: { x: 0.55, y: 0.1, width: 0.3, height: 0.85, timeMs: 1500 },
    },
    preservation: { preserve: ["performance", "audio"] },
  });
  expect(definition.provider?.(inputs)).toBe("cloud-workflow");
  expect(
    typeof definition.displayModel === "function" &&
      definition.displayModel(inputs),
  ).toBe("SAM 3.1 + MiniMax H3");
  const request = await definition.build(inputs, context());
  expect(request.model).toBe("comfy-cloud/minimax-h3-recast");
  const { graph, media } = request.input as {
    graph: Record<
      string,
      { class_type: string; inputs: Record<string, unknown> }
    >;
    media: { node: string; field: string; url: string }[];
  };
  expect(media.map((m) => [m.node, m.field, m.url])).toEqual([
    ["source", "video", "https://comfy-storage.test/take"],
    ["reference_0", "image", "https://comfy-storage.test/mara-face"],
    ["reference_1", "image", "https://comfy-storage.test/mara-full"],
    ["reference_2", "image", "https://comfy-storage.test/mara-back"],
  ]);
  // The take is read on H3's 24 fps grid; SAM 3.1 starts from the click and box.
  expect(graph.source!.inputs).toMatchObject({ force_rate: 24 });
  const detect = Object.values(graph).find(
    (n) => n.class_type === "SAM3_Detect",
  )!;
  expect(detect.inputs.positive_coords).toBeDefined();
  expect(detect.inputs.bboxes).toBeDefined();
  const condition = graph.condition!.inputs;
  expect(condition["ref_videos.ref_video_0"]).toEqual(["source", 0]);
  expect(condition["ref_videos.ref_video_1"]).toEqual(["tracks_frames", 0]);
  expect(condition["ref_video_audios.ref_video_audio_0"]).toEqual([
    "source",
    2,
  ]);
  expect(condition["ref_images.ref_image_2"]).toEqual(["reference_2", 0]);
  const prompt = String(condition.prompt);
  expect(prompt).toContain(
    "Replace the woman with long red hair (on the right of the frame), the person filled in red in <Video 2>, in <Video 1> with Mara, the person shown in <Picture 1>, <Picture 2>, <Picture 3>",
  );
  // The take's length, not the template's fixed five seconds, with its sound.
  expect(graph.result_frames!.inputs.length).toEqual(["source_size", 2]);
  expect(graph.result_video!.inputs.audio).toEqual(["source", 2]);
});

it("leaves the sound out of an H3 recast of a take whose audio is not kept", async () => {
  const definition = getWorkflowDefinition("video.character-replace")!;
  const request = await definition.build(
    characterReplaceInputsSchema.parse({ ...base, pipeline: "minimax-h3" }),
    context(),
  );
  const graph = (
    request.input as {
      graph: Record<string, { inputs: Record<string, unknown> }>;
    }
  ).graph;
  expect(graph.condition!.inputs).not.toHaveProperty(
    "ref_video_audios.ref_video_audio_0",
  );
  expect(graph.result_video!.inputs).not.toHaveProperty("audio");
});

it("refuses an H3 recast without a click on the person", async () => {
  const definition = getWorkflowDefinition("video.character-replace")!;
  await expect(
    definition.build(
      characterReplaceInputsSchema.parse({
        ...base,
        pipeline: "minimax-h3",
        target: { type: "person", description: "the woman on the right" },
      }),
      context(),
    ),
  ).rejects.toThrow("Click the person to recast on the frame");
});

it("plans SCAIL-2's segments from the take's length, five frames of overlap each", () => {
  expect(scailSegments(scailFrameCount(6.1))).toEqual([
    { start: 0, length: 81 },
    { start: 76, length: 69 },
  ]);
  // Short takes are one 4n + 1 segment; long ones are capped at 10 s.
  expect(scailSegments(40)).toEqual([{ start: 0, length: 37 }]);
  expect(scailFrameCount(30)).toBe(239);
});

it("recasts on Wan SCAIL-2 as a Cloud graph from a click and a Klein keyframe", async () => {
  const definition = getWorkflowDefinition("video.character-replace")!;
  const inputs = characterReplaceInputsSchema.parse({
    ...base,
    pipeline: "wan-scail2",
    seconds: 6.1,
    target: { ...base.target, point: { x: 0.7, y: 0.4, timeMs: 1500 } },
    preservation: { preserve: ["performance", "audio"] },
  });
  expect(definition.provider?.(inputs)).toBe("cloud-workflow");
  const request = await definition.build(inputs, context());
  expect(request.model).toBe("comfy-cloud/wan-scail2-recast");
  const { graph, media } = request.input as {
    graph: Record<
      string,
      { class_type: string; inputs: Record<string, unknown> }
    >;
    media: { node: string; field: string }[];
  };
  // Klein reads the frame plus up to three Character views.
  expect(media.map((m) => m.node)).toEqual([
    "source",
    "reference_0",
    "reference_1",
    "reference_2",
  ]);
  expect(graph.source!.inputs).toMatchObject({
    force_rate: 24,
    frame_load_cap: 145,
  });
  // Only the clicked person is replaced, seeded from their own track.
  expect(graph.drive_track!.inputs).toMatchObject({
    initial_mask: ["seed_mask", 0],
    max_objects: 1,
  });
  expect(graph.colour_masks!.inputs.replacement_mode).toBe(true);
  // The second segment continues from the first.
  expect(graph.segment_1_condition!.inputs).toMatchObject({
    previous_frames: ["segment_0_decode", 0],
    length: 69,
  });
  expect(graph.result_video!.inputs.audio).toEqual(["source", 2]);
  // Every math node names its first value `a`; Cloud skips the branch otherwise.
  for (const node of Object.values(graph))
    if (
      node.class_type === "ComfyMathExpression" &&
      Object.keys(node.inputs).some((k) => k.startsWith("values."))
    )
      expect(node.inputs).toHaveProperty(["values.a"]);
});

it("refuses a Wan recast without the take's length", async () => {
  const definition = getWorkflowDefinition("video.character-replace")!;
  await expect(
    definition.build(
      characterReplaceInputsSchema.parse({ ...base, pipeline: "wan-scail2" }),
      context(),
    ),
  ).rejects.toThrow("The take's length is needed");
});
