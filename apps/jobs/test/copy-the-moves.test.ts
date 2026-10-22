// Copy the moves on Wan 3.0 (Router) and Wan Animate 2 (Comfy Cloud). The runs
// behind these shapes are in docs/copy-the-moves.md.
import { expect, it } from "vitest";
import {
  MOTION_ENGINES,
  modelCredit,
  performanceTransferInputsSchema,
  requestMentions,
  type ResolvedMention,
} from "@open-cinema/contracts";
import {
  DUB_STAGE,
  MEDIA_GRAPH_PARTS,
  WAN3_MODEL,
  estimateGeneration,
  getWorkflowDefinition,
  mediaGraph,
  wan3Duration,
  wan3MovesOutputs,
  wanFrameCount,
  wanWindows,
  workflowStages,
  type BuildContext,
  type CloudWorkflowRequest,
  type ProviderRequest,
} from "@open-cinema/comfy";

const cal: ResolvedMention = {
  elementId: "char-cal",
  handle: "Cal",
  name: "Cal",
  type: "character",
  version: 1,
  description: "A man in his sixties with swept-back silver hair.",
  stateId: null,
  stateName: null,
  stateDescription: null,
  states: [],
  motion: [],
  references: [
    {
      asset: { type: "media-asset", assetId: "cal-face" },
      view: "face-closeup",
      roles: ["identity"],
    },
    {
      asset: { type: "media-asset", assetId: "cal-sheet" },
      view: "sheet",
      roles: ["appearance", "wardrobe"],
    },
  ],
};
const lighthouse: ResolvedMention = {
  ...cal,
  elementId: "loc-lighthouse",
  handle: "Lighthouse",
  name: "Lighthouse",
  type: "location",
  description: "A white lighthouse on black basalt above a stormy sea.",
  references: [
    {
      asset: { type: "media-asset", assetId: "lighthouse-wide" },
      view: null,
      roles: ["appearance"],
    },
  ],
};

const dot: ResolvedMention = {
  ...cal,
  elementId: "char-dot",
  handle: "GrandmaDot",
  name: "Grandma Dot",
  description: "A tiny woman in her eighties with lilac hair in curlers.",
  references: [
    {
      asset: { type: "media-asset", assetId: "dot-face" },
      view: "face-closeup",
      roles: ["identity"],
    },
    {
      asset: { type: "media-asset", assetId: "dot-smile" },
      view: "smile",
      roles: ["identity"],
    },
    {
      asset: { type: "media-asset", assetId: "dot-sheet" },
      view: "sheet",
      roles: ["appearance", "wardrobe"],
    },
  ],
};

const context: BuildContext = {
  mentions: [cal, lighthouse, dot],
  asset: async (ref) => {
    const id = ref.type === "media-asset" ? ref.assetId : ref.outputId;
    return {
      ref,
      mediaType: id === "dance" ? "video/mp4" : "image/jpeg",
      sizeBytes: 10,
      publicUrl: null,
      fetchableUrl: async () => `https://comfy-storage.test/${id}`,
      base64: async () => "AAAA",
      dataUri: async () => `data:image/jpeg;base64,${id}`,
    };
  },
};

const inputs = (extra: Record<string, unknown> = {}) =>
  performanceTransferInputsSchema.parse({
    source: { type: "media-asset", assetId: "dance" },
    engine: "wan-3",
    character: { elementId: "char-cal" },
    prompt: "@Cal copies the moves",
    seconds: 8,
    ...extra,
  });
const definition = getWorkflowDefinition("video.performance-transfer")!;
const displayModel = (i: ReturnType<typeof inputs>) =>
  typeof definition.displayModel === "function"
    ? definition.displayModel(i)
    : definition.displayModel;

it("names the model that runs, its maker and where it runs", () => {
  expect(displayModel(inputs())).toBe("Wan 3.0");
  expect(modelCredit("Wan 3.0")).toBe(
    "Wan 3.0 by Alibaba (Tongyi Wan), hosted, via Comfy Router",
  );
  const open = inputs({ engine: "wan-animate" });
  expect(displayModel(open)).toBe("FLUX 3 Klein + Wan Animate 2");
  expect(modelCredit(displayModel(open))).toContain("open weights");
  for (const engine of Object.values(MOTION_ENGINES))
    expect(modelCredit(engine.jobModel)).not.toBe(engine.jobModel);
});

it("sends Wan 3.0 the clip by URL and the references in order", async () => {
  const request = (await definition.build(
    inputs({
      location: { elementId: "loc-lighthouse" },
      performer: "the man in the middle",
      resolution: "1080p",
    }),
    context,
  )) as ProviderRequest;
  expect(definition.provider?.(inputs())).toBe("router");
  expect(request.model).toBe(WAN3_MODEL);
  const input = request.input as {
    input: { prompt: string; media: { type: string; url: string }[] };
    parameters: Record<string, unknown>;
  };
  expect(input.input.media).toEqual([
    { type: "reference_video", url: "https://comfy-storage.test/dance" },
    { type: "reference_image", url: "data:image/jpeg;base64,cal-face" },
    { type: "reference_image", url: "data:image/jpeg;base64,cal-sheet" },
    { type: "reference_image", url: "data:image/jpeg;base64,lighthouse-wide" },
  ]);
  expect(input.input.prompt).toContain("the man in the middle in Video 1");
  expect(input.input.prompt).toContain("Image 1 and Image 2");
  expect(input.input.prompt).toContain("Image 3");
  // The bare default direction adds nothing to the prompt.
  expect(input.input.prompt).not.toContain("@Cal");
  expect(input.parameters).toMatchObject({
    resolution: "1080P",
    duration: 8,
    ratio: "adaptive",
    prompt_extend: false,
    audio: false,
    watermark: false,
  });
  expect(input.parameters.seed).toBeLessThan(2 ** 31);
});

it("keeps the clip's place without a Location", async () => {
  const request = (await definition.build(
    inputs(),
    context,
  )) as ProviderRequest;
  const { prompt } = (request.input as { input: { prompt: string } }).input;
  expect(prompt).toContain("Keep the place");
});

it("asks Wan for whole seconds it can make", () => {
  expect(wan3Duration(undefined)).toBe(-1);
  expect(wan3Duration(1.2)).toBe(2);
  expect(wan3Duration(7.6)).toBe(8);
  expect(wan3Duration(14)).toBe(10);
});

it("reads Wan's video URL and lays the clip's sound back under it", () => {
  expect(
    wan3MovesOutputs({ output: { video_url: "https://oss.test/v.mp4" } }),
  ).toEqual([
    {
      providerAssetId: "video",
      url: "https://oss.test/v.mp4",
      mediaType: "video/mp4",
    },
  ]);
  expect(wan3MovesOutputs({ output: {} })).toEqual([]);
  const stages = workflowStages("video.performance-transfer", inputs());
  expect(stages.map((s) => s.id)).toEqual([DUB_STAGE]);
  expect(
    workflowStages(
      "video.performance-transfer",
      inputs({ engine: "wan-animate" }),
    ),
  ).toEqual([]);
  // A silent clip has no sound to lay under the result.
  expect(
    workflowStages("video.performance-transfer", inputs({ sound: false })),
  ).toEqual([]);
  expect(MEDIA_GRAPH_PARTS.dub).toEqual(["source", "edit"]);
  const graph = mediaGraph({
    operation: "dub",
    files: { source: "source.mp4", edit: "edit.mp4" },
  } as Parameters<typeof mediaGraph>[0]);
  const nodes = Object.values(graph) as { class_type: string }[];
  expect(nodes.some((n) => n.class_type === "SaveVideo")).toBe(true);
});

it("quotes Wan 3.0 on the seconds it reads and makes", () => {
  const estimate = estimateGeneration({
    workflowKind: "video.performance-transfer",
    inputs: inputs(),
  });
  expect(estimate.credits).toEqual({ min: 337.6, max: 337.6 });
  expect(estimate.basis).toBe("published-pricing");
});

it("covers a stretch with Wan Animate 2 windows that never start past its end", () => {
  for (const frames of [33, 81, 120, 192, 240]) {
    const windows = wanWindows(frames);
    const covered =
      windows.reduce((sum, w) => sum + w, 0) - (windows.length - 1);
    expect(covered).toBeGreaterThanOrEqual(frames);
    expect(covered - windows.at(-1)!).toBeLessThan(frames);
    expect((windows[0]! - 1) % 4).toBe(0);
  }
  expect(wanWindows(192)).toEqual([33, 81, 81]);
  expect(wanFrameCount(8, 24)).toBe(192);
});

it("builds Wan Animate 2 as a Cloud graph with the keyframe and the clip", async () => {
  const request = (await definition.build(
    inputs({ engine: "wan-animate", resolution: "480p" }),
    context,
  )) as CloudWorkflowRequest;
  expect(definition.provider?.(inputs({ engine: "wan-animate" }))).toBe(
    "cloud-workflow",
  );
  expect(request.model).toBe("comfy-cloud/wan-animate-2");
  const graph = request.input.graph as Record<
    string,
    { class_type: string; inputs: Record<string, unknown> }
  >;
  expect(graph.save_result?.class_type).toBe("SaveVideo");
  expect(graph.save_keyframe?.class_type).toBe("SaveImage");
  expect(
    Object.values(graph).filter((n) => n.class_type === "WanAnimate2ToVideo"),
  ).toHaveLength(3);
  expect(request.input.media.map((m) => m.node)).toContain("source");
  await expect(
    definition.build(
      inputs({ engine: "wan-animate", seconds: undefined }),
      context,
    ),
  ).rejects.toThrow("length is unknown");
});

const crop = (id: string) => ({ type: "media-asset" as const, assetId: id });

it("swaps tagged people, each shown to Wan by a cut-out from the clip", async () => {
  const swaps = inputs({
    prompt:
      "Replace @person1 with @Cal and @person3 with @GrandmaDot. Keep the floodlights.",
    seconds: 10,
    cast: [
      {
        person: 1,
        character: { elementId: "char-cal" },
        point: { x: 0.55, y: 0.45, timeMs: 4000 },
        crop: crop("cut-1"),
      },
      {
        person: 3,
        character: { elementId: "char-dot" },
        point: { x: 0.74, y: 0.4, timeMs: 8700 },
        crop: crop("cut-3"),
      },
    ],
  });
  const request = (await definition.build(swaps, context)) as ProviderRequest;
  const input = request.input as {
    input: { prompt: string; media: { type: string; url: string }[] };
    parameters: Record<string, unknown>;
  };
  expect(input.input.media.map((m) => m.url)).toEqual([
    "https://comfy-storage.test/dance",
    "data:image/jpeg;base64,cut-1",
    "data:image/jpeg;base64,cal-face",
    "data:image/jpeg;base64,cal-sheet",
    "data:image/jpeg;base64,cut-3",
    "data:image/jpeg;base64,dot-face",
    "data:image/jpeg;base64,dot-sheet",
    "data:image/jpeg;base64,dot-smile",
  ]);
  const { prompt } = input.input;
  expect(prompt).toContain(
    "Person 1, the person shown in Image 1 (in the middle of the frame at 4.0 s), becomes Cal, shown in Image 2 and Image 3",
  );
  expect(prompt).toContain(
    "Person 3, the person shown in Image 4 (on the right of the frame at 8.7 s), becomes Grandma Dot, shown in Image 5, Image 6 and Image 7",
  );
  // The cut-outs point people out; their looks must not leak into the result.
  expect(prompt).toContain("Image 1 and Image 4 are stills from Video 1");
  expect(prompt).toContain("Keep the floodlights.");
  expect(prompt).not.toContain("@person");
  expect(input.parameters.duration).toBe(10);
  // Both Characters resolve, though only the first is `character`.
  expect(
    requestMentions({
      workflowKind: "video.performance-transfer",
      inputs: swaps,
    }).map((m) => m.elementId),
  ).toEqual(["char-cal", "char-dot"]);
});

it("keeps Wan 3.0 within ten reference images", async () => {
  const many = inputs({
    location: { elementId: "loc-lighthouse" },
    cast: [1, 2, 3].map((person) => ({
      person,
      character: { elementId: "char-dot" },
      point: { x: 0.5, y: 0.5, timeMs: 0 },
      crop: crop(`cut-${person}`),
    })),
  });
  const request = (await definition.build(many, context)) as ProviderRequest;
  const media = (request.input as { input: { media: unknown[] } }).input.media;
  expect(media.length - 1).toBeLessThanOrEqual(10);
});

it("leaves tagged people to Wan 3.0", async () => {
  await expect(
    definition.build(
      inputs({
        engine: "wan-animate",
        cast: [
          {
            person: 1,
            character: { elementId: "char-cal" },
            point: { x: 0.5, y: 0.5, timeMs: 0 },
          },
        ],
      }),
      context,
    ),
  ).rejects.toThrow("Wan 3.0");
});
