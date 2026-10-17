// Locations: moving references made from the description or a still, and the
// checklist preferring them over frontal stills.
import { expect, test } from "bun:test";
import {
  LTX_FRAME_ARTEFACT,
  type Element,
  type ReferenceView,
} from "@open-cinema/contracts";
import {
  elementTypes,
  guessView,
  reviewSheet,
  viewRequest,
} from "../src/features/elements/model";

const now = "2026-10-17T00:00:00.000Z";
function ref(id: string, view: ReferenceView) {
  return {
    id,
    elementId: "estate",
    stateId: null,
    asset: { type: "media-asset" as const, assetId: id },
    status: "approved" as const,
    view,
    roles: [],
    note: "",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}
const estate = (...references: ReturnType<typeof ref>[]): Element => ({
  id: "estate",
  ownerId: "me",
  projectId: null,
  type: "location",
  name: "Estate",
  handle: "Estate",
  description:
    "A brutalist housing estate: long brick slab blocks joined by concrete walkways, two towers behind, wet courtyards",
  version: 1,
  references,
  states: [],
  createdAt: now,
  updatedAt: now,
});
const pushIn = elementTypes.location.slots.find((s) => s.id === "push-in")!;

test("a moving reference is made from the description on LTX 2.5", () => {
  const request = viewRequest(estate(), pushIn, null);
  expect(request.workflowKind).toBe("video.ltx");
  if (request.workflowKind !== "video.ltx") return;
  expect(request.inputs).toMatchObject({
    durationSeconds: 5,
    resolution: "1280x720",
    generateAudio: false,
  });
  expect(request.inputs.firstFrame).toBeUndefined();
  expect(request.inputs.prompt).toContain("brutalist housing estate");
  expect(request.inputs.prompt).toContain("no people");
  expect(request.inputs.prompt).not.toMatch(LTX_FRAME_ARTEFACT);
});

test("with an approved establishing still, the move continues from it", () => {
  const request = viewRequest(
    estate(ref("detail", "detail"), ref("wide", "establishing")),
    pushIn,
    null,
  );
  if (request.workflowKind !== "video.ltx") throw new Error("not a video");
  expect(request.inputs.firstFrame).toEqual({
    type: "media-asset",
    assetId: "wide",
  });
  expect(request.inputs.prompt).toMatch(/^The same place as the image/);
});

test("the checklist warns while a Location has only stills", () => {
  const stills = reviewSheet(estate(ref("wide", "establishing")), null);
  expect(stills.missingRequired.map((s) => s.id)).toContain("push-in");
  expect(stills.warnings.join(" ")).toMatch(/Only still frame/);
  const moving = reviewSheet(
    estate(ref("wide", "establishing"), ref("move", "push-in")),
    null,
  );
  expect(moving.warnings.join(" ")).not.toMatch(/Only still/);
  expect(moving.missingRequired.map((s) => s.id)).not.toContain("push-in");
});

test("an uploaded clip of a place is tagged as a moving reference", () => {
  expect(guessView("location", "courtyard-drift.mp4", "video")).toBe("drift");
  expect(guessView("location", "IMG_2041.mov", "video")).toBe("push-in");
  expect(guessView("location", "courtyard-wide.jpg")).toBe("establishing");
});
