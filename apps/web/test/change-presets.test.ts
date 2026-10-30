// Change presets fill the revision studio's own fields, so each must speak
// to a real mode and fill every gap it opens.
import { expect, test } from "bun:test";
import { CHANGE_PRESETS, presetFields } from "../src/features/revision/presets";
import { replacementKinds } from "../src/features/revision/model";

test("slot words land in the direction", () => {
  const rain = CHANGE_PRESETS.find((p) => p.id === "rain")!;
  expect(presetFields(rain, { rain: "light drizzle" }).direction).toBe(
    "Light drizzle, wet surfaces and reflections, the clothes reacting to it",
  );
  expect(rain.effect).toBe("water");
});
