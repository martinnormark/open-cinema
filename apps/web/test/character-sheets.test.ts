// Character workflow requests and states as sheets of their own.
import { expect, test } from "bun:test";
import { approvedReferences, type Element } from "@open-cinema/contracts";
import {
  elementTypes,
  reviewSheet,
  stateSheets,
  viewRequest,
} from "../src/features/elements/model";

const now = "2026-10-17T00:00:00.000Z";
function ref(
  id: string,
  view: "sheet" | "face-closeup" | "smile",
  stateId: string | null = null,
) {
  return {
    id,
    elementId: "cal",
    stateId,
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
const wet = {
  id: "wet",
  elementId: "cal",
  name: "Wet",
  description: "soaked to the skin after the fall into the Thames",
  createdAt: now,
  updatedAt: now,
};
const cal: Element = {
  id: "cal",
  ownerId: "me",
  projectId: null,
  type: "character",
  name: "Cal",
  handle: "Cal",
  description: "A man in his seventies with silver hair, in a grey jacket",
  version: 3,
  references: [
    ref("base-sheet", "sheet"),
    ref("base-portrait", "face-closeup"),
    ref("base-smile", "smile"),
  ],
  states: [wet],
  createdAt: now,
  updatedAt: now,
};
const slot = (id: string) =>
  elementTypes.character.slots.find((s) => s.id === id)!;
const assetIds = (request: ReturnType<typeof viewRequest>) =>
  request.workflowKind === "image.character-sheet"
    ? request.inputs.references.map((r) =>
        r.type === "media-asset" ? r.assetId : r.outputId,
      )
    : [];

test("a state is its own sheet: its views replace the base ones", () => {
  const wetCal = {
    ...cal,
    references: [...cal.references, ref("wet-sheet", "sheet", "wet")],
  };
  expect(approvedReferences(wetCal, "wet").map((r) => r.id)).toEqual([
    "wet-sheet",
    "base-portrait",
    "base-smile",
  ]);
  expect(approvedReferences(wetCal).map((r) => r.id)).not.toContain(
    "wet-sheet",
  );
  expect(reviewSheet(wetCal, "wet").missingRequired.map((s) => s.id)).toEqual([
    "face-closeup",
    "smile",
  ]);
  expect(stateSheets(wetCal).map((row) => row.sheet?.id ?? null)).toEqual([
    "base-sheet",
    "wet-sheet",
  ]);
});

test("a state's sheet is guided by the face, never the base outfit", () => {
  const request = viewRequest(cal, slot("sheet"), wet);
  expect(request.workflowKind).toBe("image.character-sheet");
  expect(assetIds(request)).toEqual(["base-portrait"]);
  expect(request.inputs).toMatchObject({
    shot: "sheet",
    state: { name: "Wet", description: wet.description },
    prompt: cal.description,
  });
  // The base sheet guides a new base sheet, after the face.
  expect(assetIds(viewRequest(cal, slot("sheet"), null))).toEqual([
    "base-portrait",
    "base-sheet",
  ]);
});
