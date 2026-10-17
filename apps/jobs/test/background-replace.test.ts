import { expect, it } from "vitest";
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

it("reads Kling result documents as recorded in Phase 0", () => {
  // Shapes copied from live Router results (URLs shortened).
  expect(
    backgroundReplaceOutputs({
      code: 0,
      data: {
        task_result: {
          videos: [
            {
              id: "9402",
              duration: "6.041",
              url: "https://v15-kling-fdl.klingai.com/x/clip.mp4?sig=1",
            },
          ],
        },
      },
    }),
  ).toEqual([
    {
      providerAssetId: "9402",
      url: "https://v15-kling-fdl.klingai.com/x/clip.mp4?sig=1",
      mediaType: "video/mp4",
    },
  ]);
  expect(
    backgroundReplaceOutputs({
      code: 0,
      data: { task_result: { videos: [] } },
    }),
  ).toEqual([]);
});
