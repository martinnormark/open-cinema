// How `@Handle:state` mentions are read in the composer and compiled for the
// model, which must agree on what a creator typed.
import { expect, mock, test } from "bun:test";
import {
  mentionTokens,
  recipeFromGeneration,
  toStateHandle,
  type Element,
  type ElementReference,
  type ResolvedMention,
} from "@open-cinema/contracts";
import { expandMentions } from "@open-cinema/comfy";
// The resolver is pure; its module also exports the composer, whose store
// reaches the server.
mock.module("../src/features/elements/store", () => ({
  useElements: () => ({ elements: [] }),
}));
const { blockingMentionProblem, mentionPayload, resolveMentions } =
  await import("../src/features/elements/mentions");

const at = "2026-10-17T00:00:00.000Z";
const reference = (
  id: string,
  view: ElementReference["view"],
  stateId: string | null = null,
): ElementReference => ({
  id,
  elementId: "cal",
  stateId,
  asset: { type: "media-asset", assetId: id },
  status: "approved",
  view,
  roles: [],
  note: "",
  sortOrder: 0,
  createdAt: at,
  updatedAt: at,
});
const state = (id: string, name: string, kind: "wardrobe" | "emotion") => ({
  id,
  elementId: "cal",
  name,
  description: `${name} description`,
  kind,
  createdAt: at,
  updatedAt: at,
});
const cal: Element = {
  id: "cal",
  ownerId: "owner",
  projectId: null,
  type: "character",
  name: "Cal",
  handle: "Cal",
  description: "a lighthouse keeper",
  version: 1,
  references: [
    reference("base-sheet", "sheet"),
    reference("base-portrait", "face-closeup"),
    reference("wet-sheet", "sheet", "wet"),
  ],
  states: [
    state("wet", "Wet", "wardrobe"),
    state("dry", "Dry", "wardrobe"),
    state("scared", "Frightened", "emotion"),
    state("sleepy", "Søvnig", "emotion"),
  ],
  createdAt: at,
  updatedAt: at,
};

test("a mention starts a word, so an address is not a mention", () => {
  expect(
    mentionTokens("write to ana@Cal about @Cal").map((t) => t.start),
  ).toEqual([23]);
});

test("states named in any script can be mentioned", () => {
  const handle = toStateHandle("Мокрый");
  const [token] = mentionTokens(`@Cal:${handle}+søvnig now`);
  expect(token?.stateHandles).toEqual([handle, "søvnig"]);
  const [mention] = resolveMentions("@Cal:søvnig", [cal]);
  expect(mention?.states.map((s) => s.id)).toEqual(["sleepy"]);
});

test("a state's sheet replaces the base sheet, as the server resolves it", () => {
  const [wet] = resolveMentions("@Cal:wet at the door", [cal]);
  expect(wet?.references.map((r) => r.id)).toEqual([
    "wet-sheet",
    "base-portrait",
  ]);
  const payload = mentionPayload([wet!]);
  expect(payload.references).toHaveLength(2);
});

test("a state that does not resolve, or clashes, stops the generation", () => {
  expect(blockingMentionProblem(resolveMentions("@Cal:wett", [cal]))).toContain(
    "no state named",
  );
  expect(
    blockingMentionProblem(resolveMentions("@Cal:wet+dry", [cal])),
  ).not.toBeNull();
  expect(
    blockingMentionProblem(resolveMentions("@Cal:wet+frightened", [cal])),
  ).toBeNull();
  // An unknown Element reads as plain words, as it always has.
  expect(blockingMentionProblem(resolveMentions("@Nobody", [cal]))).toBeNull();
});

const resolved = (stateName: string | null): ResolvedMention => ({
  elementId: "cal",
  handle: "Cal",
  name: "Cal",
  type: "character",
  version: 1,
  description: "a lighthouse keeper",
  stateId: stateName ? stateName.toLowerCase() : null,
  stateName,
  stateDescription: stateName ? `${stateName} description` : null,
  states: stateName
    ? [
        {
          id: stateName.toLowerCase(),
          name: stateName,
          description: "",
          kind: "wardrobe",
        },
      ]
    : [],
  references: [],
});

test("the prompt names each mention whatever case was typed", () => {
  expect(expandMentions("@cal waves", [resolved(null)], "full")).toBe(
    "Cal (a lighthouse keeper) waves",
  );
});

test("one Element in two states expands each token with its own state", () => {
  expect(
    expandMentions("@Cal:wet meets @Cal:dry", [
      resolved("Wet"),
      resolved("Dry"),
    ]),
  ).toBe("Cal (wet) meets Cal (dry)");
});

test("a recipe made from a generation keeps a lowercase mention as a slot", () => {
  const spec = recipeFromGeneration(
    {
      workflowKind: "image.flux",
      inputs: {
        prompt: "@cal on the pier at dusk",
        aspectRatio: "16:9",
        resolution: "1k",
      },
    },
    [resolved(null)],
  );
  expect(spec?.template.startsWith("{")).toBe(true);
  expect(spec?.template).not.toContain("@cal");
});
