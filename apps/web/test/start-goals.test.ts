// The front page offers every revision mode as a goal, once, so a new mode
// cannot ship without a way in.
import { expect, test } from "bun:test";
import { goals } from "../src/features/start/goals";
import type { Element } from "@open-cinema/contracts";
import {
  defaultElement,
  replacementKinds,
  type ReplacementKind,
} from "../src/features/revision/model";

test("every revision mode has exactly one take goal", () => {
  const kinds = goals.flatMap((g) => (g.source === "take" ? [g.kind] : []));
  expect([...kinds].sort()).toEqual(
    (Object.keys(replacementKinds) as ReplacementKind[]).sort(),
  );
});

// A goal that is about an Element arrives with the creator's only ready one.
test("the only ready Element is the default where the mode is about it", () => {
  const element = (id: string, approved: boolean) =>
    ({
      id,
      type: "character",
      references: approved
        ? [{ id: `${id}-ref`, status: "approved", stateId: null, view: null }]
        : [],
      states: [],
    }) as unknown as Element;
  const cal = element("cal", true);
  const draft = element("draft", false);
  expect(defaultElement("character", [cal, draft])?.id).toBe("cal");
  expect(defaultElement("character", [cal, element("theo", true)])).toBeNull();
  // Optional Elements, such as who comes in, are never chosen for the creator.
  expect(defaultElement("extend", [cal])).toBeNull();
});
