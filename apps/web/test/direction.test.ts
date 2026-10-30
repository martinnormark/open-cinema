// LTX draws the camera hardware a look names: "shot on a 24mm lens" with
// "35mm film grain" put a keyhole-shaped lens mask over every frame.
import { expect, test } from "bun:test";
import {
  LOOK_NOTES_MAX,
  LOOK_FIELDS,
  lookWithDirection,
  projectSchema,
  recipeFromGeneration,
  recipeSpecSchema,
  LOOK_OPTIONS,
  LTX_FRAME_ARTEFACT,
  SHOT_FIELDS,
  SHOT_OPTIONS,
  directionPrompt,
  revisionDirectionPrompt,
  type Look,
} from "@open-cinema/contracts";

const every = <F extends string>(
  fields: readonly F[],
  options: Record<F, readonly { id: string }[]>,
) =>
  fields.flatMap((field) => options[field].map((o) => [field, o.id] as const));

test("no look or shot preset puts lens or film-stock words into a video prompt", () => {
  for (const [field, id] of every(LOOK_FIELDS, LOOK_OPTIONS)) {
    const look: Look = { [field]: id };
    const prompts = [
      directionPrompt({ overrides: look }, "video"),
      revisionDirectionPrompt({ overrides: look }),
    ];
    for (const prompt of prompts)
      expect(prompt, `${field}: ${id}`).not.toMatch(LTX_FRAME_ARTEFACT);
  }
  for (const [field, id] of every(SHOT_FIELDS, SHOT_OPTIONS))
    expect(
      directionPrompt({ shot: { [field]: id } }, "video"),
      `${field}: ${id}`,
    ).not.toMatch(LTX_FRAME_ARTEFACT);
});

test("the creator's own words pass through unchanged", () => {
  expect(
    directionPrompt({ overrides: { lens: "an old 50mm lens" } }, "video"),
  ).toBe("an old 50mm lens.");
});

test("a project's old free-text direction joins its look's notes", () => {
  const project = projectSchema.parse({
    id: "p",
    ownerId: "o",
    name: "Lighthouse",
    direction: "Cold blue-grey palette, practical light only",
    look: { palette: "teal-amber", notes: "Rain on every window" },
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
  });
  expect("direction" in project).toBe(false);
  expect(project.look).toEqual({
    palette: "teal-amber",
    notes: "Rain on every window. Cold blue-grey palette, practical light only",
  });
  // Long text is cut at a word so the notes stay within the look's limit.
  const long = lookWithDirection({}, "slow drift ".repeat(60));
  expect(long.notes!.length).toBeLessThanOrEqual(LOOK_NOTES_MAX);
  expect(long.notes!.endsWith("drift")).toBe(true);
  expect(lookWithDirection({ lens: "wide" }, "  ")).toEqual({ lens: "wide" });
});

test("a recipe saved from a camera-move video keeps the move", () => {
  const spec = recipeFromGeneration(
    {
      workflowKind: "video.ltx",
      inputs: {
        prompt: "A lighthouse at dusk",
        durationSeconds: 4,
        camera: "dolly-in",
        resolution: "1280x720",
        fps: 25,
        generateAudio: true,
        quality: "fast",
      },
    },
    [],
  );
  expect(spec?.camera).toBe("dolly-in");
  expect(spec?.capabilities).toContain("ltx-camera");
  // Specs saved before the field existed read as having no move.
  expect(
    recipeSpecSchema.parse({ medium: "video", template: "{x}" }).camera,
  ).toBeNull();
});
