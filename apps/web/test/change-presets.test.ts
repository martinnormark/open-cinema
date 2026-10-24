// Change presets fill the revision studio's own fields, so each must speak
// to a real mode and fill every gap it opens.
import { expect, test } from "bun:test";
import { CHANGE_PRESETS, presetFields } from "../src/features/revision/presets";
import { replacementKinds } from "../src/features/revision/model";

test("preset ids are unique and every preset belongs to a mode", () => {
  const ids = CHANGE_PRESETS.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const p of CHANGE_PRESETS) expect(replacementKinds[p.kind]).toBeTruthy();
});

test("every gap in a template is a slot, and every slot is used", () => {
  for (const p of CHANGE_PRESETS) {
    const templates = [p.direction, p.wardrobeNote ?? ""];
    const used = new Set(
      templates.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])),
    );
    expect([...used].sort()).toEqual(p.slots.map((s) => s.key).sort());
  }
});

test("a chosen preset reads as finished words before anything is typed", () => {
  for (const p of CHANGE_PRESETS) {
    const { direction } = presetFields(p, {});
    expect(direction).not.toContain("{");
    expect(direction.length).toBeGreaterThanOrEqual(3);
    expect(direction[0]).toBe(direction[0]!.toUpperCase());
  }
});

// The swap looks for the named object in every frame: an example that is not
// in the creator's take would change nothing, so a preset only suggests one.
test("swap presets suggest the object but never fill it in", () => {
  for (const p of CHANGE_PRESETS) {
    expect(p.kind === "object").toBe(p.replaced !== undefined);
    expect(Object.keys(presetFields(p, {}))).toEqual([
      "direction",
      "wardrobeNote",
    ]);
  }
});

test("slot words land in the direction", () => {
  const rain = CHANGE_PRESETS.find((p) => p.id === "rain")!;
  expect(presetFields(rain, { rain: "light drizzle" }).direction).toBe(
    "Light drizzle, wet surfaces and reflections, the clothes reacting to it",
  );
  expect(rain.effect).toBe("water");
});

test("restyles name the background, or it stays a photograph", () => {
  for (const p of CHANGE_PRESETS.filter((p) => p.kind === "restyle"))
    expect(
      p.slots.some((s) => s.key === "place") ||
        /every surface|framing|people/.test(p.direction),
    ).toBe(true);
});
