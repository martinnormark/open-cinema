// Character sheets: headless full-body panels, the prompt rules, and states
// as sheets of their own.
import { expect, test } from "bun:test";
import { approvedReferences, type Element } from "@open-cinema/contracts";
import { removeHead } from "../src/features/elements/headless";
import {
  BANNED_SHEET_WORDS,
  characterShotPrompt,
} from "../src/features/elements/sheet-prompt";
import {
  elementTypes,
  reviewSheet,
  stateSheets,
  viewRequest,
} from "../src/features/elements/model";

const GREY = [128, 128, 128];
const SKIN = [200, 150, 120];
const SUIT = [40, 40, 50];

/** A 300x300 grey panel with a standing figure: head, neck, torso, legs. */
function figure({ head = true } = {}) {
  const width = 900;
  const height = 300;
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    rgb: number[],
  ) => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++)
        data.set([...rgb, 255], (y * width + x) * 4);
  };
  paint(0, width, 0, height, GREY);
  if (head) {
    paint(135, 165, 20, 55, SKIN); // head
    paint(143, 157, 55, 65, SKIN); // neck
  }
  paint(110, 190, head ? 65 : 0, 170, SUIT); // shoulders and torso
  paint(120, 145, 170, 285, SUIT); // legs
  paint(155, 180, 170, 285, SUIT);
  return { data, width, height };
}
const at = (px: ReturnType<typeof figure>, x: number, y: number) =>
  Array.from(px.data.slice((y * px.width + x) * 4, (y * px.width + x) * 4 + 3));
const near = (a: number[], b: number[]) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= 4);

test("removes the head above the collar and leaves the body", () => {
  const px = figure();
  const { cutRow } = removeHead(px);
  expect(cutRow).toBeGreaterThanOrEqual(55);
  expect(cutRow).toBeLessThanOrEqual(66);
  expect(near(at(px, 150, 35), GREY)).toBe(true);
  expect(near(at(px, 150, 100), SUIT)).toBe(true);
  expect(near(at(px, 130, 250), SUIT)).toBe(true);
  // The back and portrait panels are untouched.
  expect(near(at(px, 450, 35), GREY)).toBe(true);
});

test("leaves a figure without a head alone", () => {
  const px = figure({ head: false });
  const before = px.data.slice();
  expect(removeHead(px).cutRow).toBeNull();
  expect(px.data).toEqual(before);
});

test("sheet prompts follow the rules whatever the creator wrote", () => {
  for (const shot of ["sheet", "portrait", "smile"] as const) {
    const prompt = characterShotPrompt(shot, {
      identity:
        "Cal, seventies, silver hair, studio portrait style with rim light and a softbox, holding a lantern",
      state: { name: "Wet", description: "soaked through under a spotlight" },
    }).toLowerCase();
    expect(prompt).toContain("no studio, no equipment, no walls");
    expect(prompt).toContain("neutral grey backdrop");
    for (const word of BANNED_SHEET_WORDS)
      expect(prompt.replace("no studio", "")).not.toContain(word);
  }
  const sheet = characterShotPrompt("sheet", { identity: "Cal" });
  expect(sheet).toContain("three equal vertical panels");
  expect(sheet).toContain("holding nothing");
  expect(characterShotPrompt("smile", { identity: "Cal" })).toContain(
    "showing the teeth",
  );
  expect(characterShotPrompt("portrait", { identity: "Cal" })).toContain(
    "mouth closed",
  );
});

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
  request.workflowKind === "image.flux-reference"
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
  expect(request.workflowKind).toBe("image.flux-reference");
  expect(assetIds(request)).toEqual(["base-portrait"]);
  expect(request.inputs).toMatchObject({ aspectRatio: "21:9" });
  expect(request.inputs.prompt).toContain(
    "changed for this state: soaked to the skin",
  );
  expect(request.inputs.prompt).not.toContain("grey jacket");
  // The base sheet guides a new base sheet, after the face.
  expect(assetIds(viewRequest(cal, slot("sheet"), null))).toEqual([
    "base-portrait",
    "base-sheet",
  ]);
});
