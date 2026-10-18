// The front page offers every revision mode as a goal, once, so a new mode
// cannot ship without a way in.
import { expect, test } from "bun:test";
import { goals } from "../src/features/start/goals";
import {
  replacementKinds,
  type ReplacementKind,
} from "../src/features/revision/model";

test("every revision mode has exactly one take goal", () => {
  const kinds = goals.flatMap((g) => (g.source === "take" ? [g.kind] : []));
  expect([...kinds].sort()).toEqual(
    (Object.keys(replacementKinds) as ReplacementKind[]).sort(),
  );
});
