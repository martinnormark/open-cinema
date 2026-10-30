import { expect, it } from "bun:test";
import {
  approvedMotionReferences,
  approvedReferences,
  generationRequestSchema,
  type Element,
  type ResolvedMention,
} from "@open-cinema/contracts";
import {
  getWorkflowDefinition,
  REFERENCE_RULE,
  type BuildContext,
} from "@open-cinema/comfy";

const base = {
  version: 1,
  stateId: null,
  stateName: null,
  stateDescription: null,
  states: [],
};

const mara: ResolvedMention = {
  ...base,
  elementId: "mara",
  handle: "Mara",
  name: "Mara",
  type: "character",
  description: "A lighthouse keeper with a scar through her left eyebrow.",
  references: [
    {
      asset: { type: "media-asset", assetId: "mara-sheet" },
      view: "sheet",
      roles: [],
    },
    {
      asset: { type: "media-asset", assetId: "mara-face" },
      view: "face-closeup",
      roles: [],
    },
  ],
  motion: [],
};

const harbor: ResolvedMention = {
  ...base,
  elementId: "harbor",
  handle: "Harbor",
  name: "Harbor",
  type: "location",
  description: "A stone breakwater with a red-and-white lighthouse.",
  references: [
    {
      asset: { type: "media-asset", assetId: "harbor-wide" },
      view: "establishing",
      roles: [],
    },
  ],
  motion: [
    {
      asset: { type: "job-output", jobId: "move", outputId: "video" },
      view: "push-in",
    },
  ],
};

const theo: ResolvedMention = {
  ...base,
  elementId: "theo",
  handle: "Theo",
  name: "Theo",
  type: "character",
  description: "A tall fisherman in a yellow oilskin.",
  references: [],
  motion: [],
};

function context(mentions: ResolvedMention[]): BuildContext {
  return {
    mentions,
    asset: async (ref) => {
      const id = ref.type === "media-asset" ? ref.assetId : ref.jobId;
      return {
        ref,
        mediaType: id === "move" ? "video/mp4" : "image/png",
        sizeBytes: 10,
        publicUrl: null,
        fetchableUrl: async () => `https://comfy-storage.test/${id}`,
        base64: async () => `b64-${id}`,
        dataUri: async () => `data:image/png;base64,${id}`,
      };
    },
  } as BuildContext;
}

async function build(prompt: string, mentions: ResolvedMention[]) {
  const request = generationRequestSchema.parse({
    workflowKind: "video.reference",
    inputs: { prompt, durationSeconds: 5 },
  });
  if (request.workflowKind !== "video.reference") throw new Error();
  const definition = getWorkflowDefinition("video.reference")!;
  return (await definition.build(request.inputs, context(mentions))) as {
    model: string;
    input: Record<string, unknown> & { prompt: string };
  };
}

it("sends a Location's move as the reference video and faces as images", async () => {
  const body = await build(
    "@Mara stands at the end of @Harbor, the camera behind her left shoulder.",
    [mara, harbor],
  );
  expect(body.model).toBe("kling/kling-v3-omni");
  expect(body.input.video_list).toEqual([
    {
      video_url: "https://comfy-storage.test/move",
      refer_type: "feature",
      keep_original_sound: "no",
    },
  ]);
  // The close portrait leads, so the face comes from it, not the sheet.
  expect(body.input.image_list).toEqual([
    { image_url: "b64-mara-face" },
    { image_url: "b64-mara-sheet" },
  ]);
  expect(body.input).not.toHaveProperty("first_frame");
  expect(body.input).toMatchObject({ duration: "5", mode: "std" });
  expect(body.input.prompt).toBe(
    "Mara (as in <<<image_1>>> and <<<image_2>>>) stands at the end of Harbor (the place shown in <<<video_1>>>), the camera behind her left shoulder. " +
      REFERENCE_RULE,
  );
});

it("describes in words a mention whose references do not reach the model", async () => {
  const body = await build("@Theo waits on @Harbor.", [theo, harbor]);
  expect(body.input.prompt).toContain(
    "Theo (A tall fisherman in a yellow oilskin) waits",
  );
  expect(body.input.prompt).toContain(
    "Harbor (the place shown in <<<video_1>>>)",
  );
});

it("falls back to a Location's still when it has no move", async () => {
  const still = { ...harbor, motion: [] };
  const body = await build("Dawn over @Harbor.", [still]);
  expect(body.input).not.toHaveProperty("video_list");
  expect(body.input.image_list).toEqual([{ image_url: "b64-harbor-wide" }]);
  expect(body.input.prompt).toContain(
    "Harbor (the place shown in <<<image_1>>>)",
  );
});

it("keeps moving references out of the stills every image model reads", () => {
  const ref = (id: string, view: string, stateId: string | null = null) => ({
    id,
    elementId: "harbor",
    stateId,
    asset: { type: "media-asset" as const, assetId: id },
    status: "approved" as const,
    view: view as never,
    roles: [],
    note: "",
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  });
  const element: Pick<Element, "references"> = {
    references: [
      ref("wide", "establishing"),
      ref("move", "push-in"),
      ref("night-move", "push-in", "night"),
    ],
  };
  expect(approvedReferences(element).map((r) => r.id)).toEqual(["wide"]);
  expect(approvedMotionReferences(element).map((r) => r.id)).toEqual(["move"]);
  // A state's own move replaces the base move, as its own views do.
  expect(approvedMotionReferences(element, "night").map((r) => r.id)).toEqual([
    "night-move",
  ]);
});
