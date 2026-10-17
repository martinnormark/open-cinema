// The default path through a reference sheet, the same for every type: make
// the anchor view, approve it, make the rest from it, then use the Element.
import { expect, test } from "bun:test";
import type {
  Element,
  ElementReference,
  ElementType,
  ReferenceView,
} from "@open-cinema/contracts";
import {
  defaultView,
  elementTypes,
  nextStep,
  replacedBy,
  viewRequest,
} from "../src/features/elements/model";

function ref(
  view: ReferenceView,
  status: ElementReference["status"] = "approved",
  stateId: string | null = null,
): ElementReference {
  return {
    id: `${stateId ?? "base"}-${view}-${status}`,
    elementId: "e",
    stateId,
    asset: { type: "media-asset", assetId: view },
    status,
    view,
    roles: [],
    note: "",
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  };
}

function element(type: ElementType, references: ElementReference[]): Element {
  return {
    id: "e",
    ownerId: "me",
    projectId: null,
    type,
    name: "Lantern",
    handle: "Lantern",
    description: "A brass storm lantern with a cracked green glass chimney.",
    version: 1,
    references,
    states: [
      {
        id: "lit",
        elementId: "e",
        name: "Lit",
        description: "",
        kind: "use",
        createdAt: "",
        updatedAt: "",
      },
    ],
    createdAt: "",
    updatedAt: "",
  };
}

const none = new Map<ReferenceView, number>();
const ids = (step: ReturnType<typeof nextStep>) =>
  step.kind === "finish" ? step.slots.map((s) => s.id) : [];

test.each([
  ["character", "face-closeup", ["smile", "sheet"]],
  ["location", "establishing", ["push-in", "landmark"]],
  ["thing", "three-quarter", ["turnaround", "detail"]],
] as const)(
  "a %s starts from its %s, then finishes the sheet in one step",
  (type, anchor, rest) => {
    expect(nextStep(element(type, []), null, none)).toMatchObject({
      kind: "start",
      slot: { id: anchor },
    });
    expect(
      nextStep(element(type, []), null, new Map([[anchor, 2]])),
    ).toMatchObject({ kind: "review", waiting: 2 });
    const anchored = element(type, [ref(anchor)]);
    expect(ids(nextStep(anchored, null, none))).toEqual([...rest]);
    // Views already waiting for a decision are not made again.
    expect(ids(nextStep(anchored, null, new Map([[rest[0], 1]])))).toEqual([
      rest[1],
    ]);
    expect(nextStep(anchored, null, new Map(rest.map((v) => [v, 1])))).toEqual({
      kind: "reviewing",
      waiting: 2,
    });
    const done = element(type, [ref(anchor), ...rest.map((v) => ref(v))]);
    expect(nextStep(done, null, none).kind).toBe("ready");
  },
);

test("a Thing's state needs only its anchor view; identity fills in the rest", () => {
  const lantern = element("thing", [ref("three-quarter")]);
  expect(nextStep(lantern, "lit", none)).toMatchObject({
    kind: "start",
    slot: { id: "three-quarter" },
  });
  const lit = element("thing", [
    ref("three-quarter"),
    ref("three-quarter", "approved", "lit"),
  ]);
  expect(nextStep(lit, "lit", none).kind).toBe("ready");
});

test("the turnaround is one three-panel image made from the approved hero view", () => {
  const slot = elementTypes.thing.slots.find((s) => s.id === "turnaround")!;
  const request = viewRequest(
    element("thing", [ref("three-quarter"), ref("detail")]),
    slot,
    null,
  );
  expect(request.workflowKind).toBe("image.flux-reference");
  if (request.workflowKind !== "image.flux-reference") return;
  expect(request.inputs.references).toEqual([
    { type: "media-asset", assetId: "three-quarter" },
  ]);
  expect(request.inputs).toMatchObject({ aspectRatio: "21:9" });
  expect(request.inputs.prompt).toContain("Left panel");
  expect(request.inputs.prompt).toContain("cracked green glass chimney");
});

test("untagged uploads take the views the sheet still needs, never a panel view", () => {
  const taken = new Set<ReferenceView>();
  const thing = element("thing", []);
  const first = defaultView(thing, null, "image", taken);
  taken.add(first!);
  expect([first, defaultView(thing, null, "image", taken)]).toEqual([
    "three-quarter",
    "detail",
  ]);
  // A photo of a person is a portrait, not a sheet or a smile.
  const portrait = element("character", [ref("face-closeup")]);
  expect(defaultView(portrait, null, "image")).toBeNull();
  // A clip of a place is its moving reference.
  expect(defaultView(element("location", []), null, "video")).toBe("push-in");
});

test("approving a second hero view replaces the first; landmarks sit side by side", () => {
  const lantern = element("thing", [ref("three-quarter")]);
  expect(replacedBy(lantern, null, "three-quarter")?.view).toBe(
    "three-quarter",
  );
  expect(replacedBy(lantern, "lit", "three-quarter")).toBeNull();
  const harbor = element("location", [ref("landmark")]);
  expect(replacedBy(harbor, null, "landmark")).toBeNull();
});
