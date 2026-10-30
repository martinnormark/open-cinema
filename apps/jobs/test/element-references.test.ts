// Which approved references lead when an Element is mentioned, and how
// several Elements share one model's image limit.
import { expect, it } from "bun:test";
import {
  approvedReferences,
  generationRequestSchema,
  type ElementReference,
  type ReferenceView,
  type ResolvedMention,
} from "@open-cinema/contracts";
import { getWorkflowDefinition, type BuildContext } from "@open-cinema/comfy";

function ref(
  id: string,
  view: ReferenceView,
  sortOrder: number,
  stateId: string | null = null,
): ElementReference {
  return {
    id,
    elementId: "e",
    stateId,
    asset: { type: "media-asset", assetId: id },
    status: "approved",
    view,
    roles: [],
    note: "",
    sortOrder,
    createdAt: "",
    updatedAt: "",
  };
}

it("leads with the view that identifies the Element, whatever order it was approved in", () => {
  const lantern = {
    references: [
      ref("detail", "detail", 0),
      ref("turnaround", "turnaround", 1),
      ref("hero", "three-quarter", 2),
    ],
  };
  expect(approvedReferences(lantern).map((r) => r.id)).toEqual([
    "hero",
    "turnaround",
    "detail",
  ]);
  const harbor = {
    references: [
      ref("stones", "detail", 0),
      ref("lighthouse", "landmark", 1),
      ref("wide", "establishing", 2),
      ref("night-wide", "establishing", 3, "night"),
    ],
  };
  // A state's own view still comes before the identity's.
  expect(approvedReferences(harbor, "night").map((r) => r.id)).toEqual([
    "night-wide",
    "lighthouse",
    "stones",
  ]);
});

function mention(
  id: string,
  type: ResolvedMention["type"],
  views: ReferenceView[],
): ResolvedMention {
  return {
    elementId: id,
    handle: id,
    name: id,
    type,
    version: 1,
    description: "",
    stateId: null,
    stateName: null,
    stateDescription: null,
    states: [],
    references: views.map((view) => ({
      asset: { type: "media-asset", assetId: `${id}-${view}` },
      view,
      roles: [],
    })),
    motion: [],
  };
}

function context(mentions: ResolvedMention[]): BuildContext {
  return {
    mentions,
    asset: async (ref) => {
      const url = `https://assets.test/${ref.type === "media-asset" ? ref.assetId : ref.jobId}`;
      return {
        ref,
        mediaType: "image/png",
        sizeBytes: 10,
        publicUrl: url,
        base64: async () => "",
        dataUri: async () => "",
        fetchableUrl: async () => url,
      };
    },
  };
}

it("gives every mentioned Element its lead reference before any gets a second", async () => {
  const mentions = [
    mention("Harbor", "location", [
      "establishing",
      "landmark",
      "alternate-angle",
      "detail",
    ]),
    mention("Mara", "character", ["face-closeup", "sheet", "smile"]),
    mention("Cal", "character", ["face-closeup", "sheet", "smile"]),
    mention("Lantern", "thing", ["three-quarter", "turnaround", "detail"]),
  ];
  const request = generationRequestSchema.parse({
    workflowKind: "image.flux-reference",
    inputs: { prompt: "@Mara hands @Cal the @Lantern on @Harbor" },
  });
  if (request.workflowKind !== "image.flux-reference") throw new Error();
  const body = (await getWorkflowDefinition("image.flux-reference")!.build(
    request.inputs,
    context(mentions),
  )) as unknown as { input: { images: string[] } };
  const sent = body.input.images.map((url) => url.split("/").pop());
  expect(sent).toHaveLength(10);
  // Written last, the Thing still arrives, and so does each face.
  expect(sent.slice(0, 4)).toEqual([
    "Harbor-establishing",
    "Mara-face-closeup",
    "Cal-face-closeup",
    "Lantern-three-quarter",
  ]);
});
