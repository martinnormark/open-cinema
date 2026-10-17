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
    asset: async (ref) => ({
      ref,
      mediaType:
        ref.type === "media-asset" && ref.assetId === "take"
          ? "video/mp4"
          : "image/png",
      sizeBytes: 10,
      publicUrl:
        publicOrigin && ref.type === "media-asset"
          ? `${publicOrigin}/${ref.assetId}`
          : null,
      base64: async () => "AAAA",
      dataUri: async () => "data:image/png;base64,AAAA",
    }),
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
  const prompt = String(request.input.prompt);
  expect(prompt).toContain("background of <<<video_1>>>");
  expect(prompt).toContain("Harbor (dusk)");
  expect(prompt).toContain("<<<image_1>>> and <<<image_2>>>");
  expect(prompt).toContain("Keep the camera movement");
});

it("refuses to submit when the source clip has no provider-reachable URL", async () => {
  const definition = getWorkflowDefinition("video.background-replace")!;
  await expect(definition.build(inputs, context(null))).rejects.toThrow(
    /public media origin/,
  );
});

it("reads Kling and SwitchX result documents as recorded in Phase 0", () => {
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
      id: "swx_1",
      status: "completed",
      output: {
        render: "https://cdn.beeble.ai/switchx/a/render.mp4?s=1",
        alpha: "https://cdn.beeble.ai/switchx/a/alpha.mp4?s=1",
        source: "https://cdn.beeble.ai/switchx/a/source.mp4?s=1",
      },
    }).map((o) => o.providerAssetId),
  ).toEqual(["render", "alpha"]);
  expect(
    backgroundReplaceOutputs({
      code: 0,
      data: { task_result: { videos: [] } },
    }),
  ).toEqual([]);
});
