// The studio's clip-aware estimates must quote the same rates and times as the
// shared estimator the rest of the app uses.
import { expect, test } from "bun:test";
import type { GenerationRequest } from "@open-cinema/contracts";
import { estimateGeneration } from "@open-cinema/comfy/estimates";
import { estimateReplacement } from "../src/features/revision/estimate";
import { replacementKinds } from "../src/features/revision/model";

const numbers = ({
  credits,
  seconds,
  basis,
}: ReturnType<typeof estimateGeneration>) => ({
  credits,
  seconds,
  basis,
});

const shared = (
  workflowKind: GenerationRequest["workflowKind"],
  inputs: Record<string, unknown> = {},
) =>
  // Only the kind and the background pipeline decide these estimates.
  numbers(estimateGeneration({ workflowKind, inputs } as GenerationRequest));

test("matches the shared estimate for every replacement kind", () => {
  for (const { kind, workflowKind } of Object.values(replacementKinds))
    expect(numbers(estimateReplacement(kind, null))).toEqual(
      shared(workflowKind, { pipeline: "kling" }),
    );
  expect(numbers(estimateReplacement("background", null, "ltx-alpha"))).toEqual(
    shared("video.background-replace", { pipeline: "ltx-alpha" }),
  );
});

test("prices Router edits per source second once the clip length is known", () => {
  expect(estimateReplacement("background", 6)).toEqual({
    credits: { min: 37.5 * 6 * 0.9, max: 37.5 * 6 * 1.1 },
    seconds: { min: 150, max: 1800 },
    basis: "observed",
  });
  expect(estimateReplacement("character", 5).credits).toEqual({
    min: 35 * 5 * 0.9,
    max: 35 * 5 * 1.1,
  });
  expect(estimateReplacement("background", null).note).toBe(
    "About 38 credits per second of source video.",
  );
});
