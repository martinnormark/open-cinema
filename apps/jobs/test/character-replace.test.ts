import { expect, it } from "vitest";
import {
  characterReplaceInputsSchema,
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

it("recasts on Kling 3.0 Omni with the source by URL and the Character's body views first", async () => {
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
      { image_url: "b64-mara-full" },
      { image_url: "b64-mara-face" },
      { image_url: "b64-mara-back" },
    ],
  });
  const prompt = String((request.input as Record<string, unknown>).prompt);
  expect(prompt).toContain(
    "In <<<video_1>>>, replace the woman with long red hair (on the right of the frame) with the person shown in <<<image_1>>>, <<<image_2>>>, <<<image_3>>>: Mara, a woman",
  );
  expect(prompt).toContain("reference outfit");
  expect(prompt).toContain("Keep every other person");
});

it("keeps the source clothing and sound when the creator preserves them", async () => {
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
