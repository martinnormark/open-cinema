import { expect, it } from "vitest";
import {
  characterReplaceInputsSchema,
  resultOutputs,
  type ResolvedMention,
} from "@open-cinema/contracts";
import { getWorkflowDefinition, type BuildContext } from "@open-cinema/comfy";

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
