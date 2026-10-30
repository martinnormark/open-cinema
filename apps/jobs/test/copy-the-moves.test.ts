// Copy the moves on Wan 3.0 (Router) and Wan Animate 2 (Comfy Cloud). The runs
// behind these shapes are in docs/copy-the-moves.md.
import { expect, it } from "bun:test";
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
  SAM3_MODEL,
  trackWindow,
  WAN3_CAST_MODEL_ID,
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

type Graph = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;

it("tracks tagged people with SAM 3.1 and names them by colour to Wan 3.0, in one Cloud graph", async () => {
  const swaps = inputs({
    prompt:
      "Replace @person1 with @Cal and @person3 with @GrandmaDot. Keep the floodlights.",
    seconds: 10,
    cast: [
      {
        person: 1,
        character: { elementId: "char-cal" },
        point: { x: 0.55, y: 0.45, timeMs: 4000 },
        box: { x: 0.4, y: 0.2, w: 0.3, h: 0.6 },
      },
      {
        person: 3,
        character: { elementId: "char-dot" },
        point: { x: 0.74, y: 0.4, timeMs: 8700 },
      },
    ],
  });
  expect(definition.provider!(swaps)).toBe("cloud-workflow");
  expect(definition.model(swaps)).toBe(WAN3_CAST_MODEL_ID);
  expect(displayModel(swaps)).toBe("SAM 3.1 + Wan 3.0");
  expect(modelCredit(displayModel(swaps))).toBe(
    "SAM 3.1 + Wan 3.0 by Meta and Alibaba (Tongyi Wan), hosted, via Comfy Cloud",
  );
  // The sound goes back on inside the graph; no dub stage follows.
  expect(workflowStages("video.performance-transfer", swaps)).toEqual([]);

  const request = (await definition.build(
    swaps,
    context,
  )) as CloudWorkflowRequest;
  const graph = request.input.graph as Graph;
  // The clip, then up to three views per Character: no cut-outs.
  expect(
    request.input.media.map((m) => [m.node, m.url.split("/").at(-1)]),
  ).toEqual([
    ["source", "dance"],
    ["reference_0", "cal-face"],
    ["reference_1", "cal-sheet"],
    ["reference_2", "dot-face"],
    ["reference_3", "dot-sheet"],
    ["reference_4", "dot-smile"],
  ]);
  // SAM 3.1 segments each from their click (and box) on their own frame,
  // then tracks them forwards and backwards from it.
  expect(graph.sam!.inputs.ckpt_name).toBe(SAM3_MODEL);
  const detect = Object.values(graph).filter(
    (n) => n.class_type === "SAM3_Detect",
  );
  expect(detect).toHaveLength(2);
  expect(graph.p0_box!.class_type).toBe("PrimitiveBoundingBox");
  expect(graph.p1_box).toBeUndefined();
  expect(
    Object.values(graph).filter((n) => n.class_type === "SAM3_VideoTrack"),
  ).toHaveLength(4);
  const wan = graph.wan!.inputs;
  expect(graph.wan!.class_type).toBe("Wan3ReferenceToVideoApi");
  expect(wan["model.reference_videos.video1"]).toEqual(["source", 0]);
  expect(wan["model.reference_videos.video2"]).toEqual(["tracks_video", 0]);
  expect(wan["model.duration"]).toBe("10");
  expect(wan["model.audio"]).toBe(false);
  // 15 s of reference video at most: the 10 s clip leaves 4.75 s of tracks.
  expect(trackWindow(10, [4, 8.7])).toEqual({ start: 4, seconds: 4.7 });
  const prompt = wan["model.prompt"] as string;
  expect(prompt).toContain(
    "Video 2 is the same footage as Video 1 from 4.0 s to 8.7 s",
  );
  expect(prompt).toContain(
    "Person 1, filled in red in Video 2, becomes Cal, shown in Image 1 and Image 2",
  );
  expect(prompt).toContain(
    "Person 3, filled in blue in Video 2, becomes Grandma Dot, shown in Image 3, Image 4 and Image 5",
  );
  // The colours only point people out; they must not reach the result.
  expect(prompt).toContain("the result has no flat colours");
  expect(prompt).toContain("Keep the floodlights.");
  expect(prompt).not.toContain("Replace");
  expect(prompt).not.toContain("@person");
  expect(graph.save_result!.inputs.video).toEqual(["result_video", 0]);
  // Both Characters resolve, though only the first is `character`.
  expect(
    requestMentions({
      workflowKind: "video.performance-transfer",
      inputs: swaps,
    }).map((m) => m.elementId),
  ).toEqual(["char-cal", "char-dot"]);
});

it("swaps a tagged thing for one of your Things", async () => {
  const lantern: ResolvedMention = {
    ...cal,
    elementId: "thing-lantern",
    handle: "StormLantern",
    name: "Storm Lantern",
    type: "thing",
    description: "A brass hurricane lantern with a green glass chimney.",
    references: [
      {
        asset: { type: "media-asset", assetId: "lantern-hero" },
        view: "three-quarter",
        roles: ["identity"],
      },
    ],
  };
  const ball = inputs({
    character: undefined,
    prompt: "Replace @person1 with @StormLantern",
    seconds: 6,
    sound: false,
    cast: [
      {
        person: 1,
        character: { elementId: "thing-lantern" },
        point: { x: 0.5, y: 0.43, timeMs: 1500 },
      },
    ],
  });
  const request = (await definition.build(ball, {
    ...context,
    mentions: [...context.mentions, lantern],
  })) as CloudWorkflowRequest;
  const graph = request.input.graph as Graph;
  const prompt = graph.wan!.inputs["model.prompt"] as string;
  expect(prompt).toContain(
    "The object filled in red in Video 2 becomes Storm Lantern, the object shown in Image 1",
  );
  // A 6 s clip leaves room to track all of it.
  expect(prompt).toContain("Video 2 is the same footage as Video 1,");
  // A silent clip: Wan's video is saved as it comes.
  expect(graph.save_result!.inputs.video).toEqual(["wan", 0]);
  expect(graph.result_video).toBeUndefined();
});

it("quotes tagged runs on the tracks Wan reads as well", () => {
  const estimate = estimateGeneration({
    workflowKind: "video.performance-transfer",
    inputs: inputs({
      seconds: 6,
      cast: [
        {
          person: 1,
          character: { elementId: "char-cal" },
          point: { x: 0.5, y: 0.5, timeMs: 0 },
        },
      ],
    }),
  });
  // 6 s read, 6 s of tracks read, 6 s made, at 720p.
  expect(estimate.credits).toEqual({ min: 379.8, max: 379.8 });
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
