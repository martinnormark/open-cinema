import { expect, test } from "bun:test";
import {
  characterSheetInputsSchema,
  requestAssetRefs,
} from "@open-cinema/contracts";
import { getWorkflowDefinition, type BuildContext } from "@open-cinema/comfy";
import { characterSheetGraph } from "../../../packages/comfy/src/workflows/character-sheet";

// Protect the generated prompt contract, including long descriptions and literal braces.
// UI state-reference selection is owned by character-sheets.test.ts in the web app.
function prompt(inputs: Parameters<typeof characterSheetGraph>[0]) {
  const graph = characterSheetGraph(inputs);
  const format = graph["4"]!.inputs;
  return String(format.f_string).replace(/\{([abc])\}/g, (_, key: string) => {
    const [id] = format[`values.${key}`] as [string, number];
    return String(graph[id]!.inputs.value);
  });
}
const base = { prompt: "Mara {the keeper}, dark hair, a navy sweater" };
const image = { type: "media-asset" as const, assetId: "portrait" };

test("the workflow injects UI text without truncating layout or overriding a guided state's outfit", () => {
  const generated = prompt(
    characterSheetInputsSchema.parse({ prompt: "x".repeat(2000) }),
  );
  expect(generated).toContain("Exactly three equal vertical panels");
  expect(generated).toContain(
    "Right third: one large sharp three-quarter face close-up",
  );
  expect(generated).toContain("No studio, no equipment");
  expect(prompt(characterSheetInputsSchema.parse(base))).toContain(
    "Mara {the keeper}",
  );
  const state = prompt(
    characterSheetInputsSchema.parse({
      ...base,
      references: [image],
      state: { name: "Wet", description: "Drenched red raincoat" },
    }),
  );
  expect(state).toContain("changed for this state: Drenched red raincoat");
  expect(state).toContain(
    "State instructions take priority only for the attributes they explicitly change",
  );
  expect(state).toContain(
    "wetness changes their condition, never replaces the outfit",
  );
  expect(state).toContain("Keep the face, age, skin tone and build");
});

test("edits retain an explicit source and preservation instructions, and reject incomplete edits", async () => {
  for (const extra of [{ source: image }, { edit: "Green sweater" }])
    expect(
      characterSheetInputsSchema.safeParse({ ...base, ...extra }).success,
    ).toBe(false);
  const inputs = characterSheetInputsSchema.parse({
    ...base,
    source: image,
    edit: "Change only the sweater to green",
    cacheNonce: 123,
  });
  expect(
    requestAssetRefs({ workflowKind: "image.character-sheet", inputs }),
  ).toEqual([image]);
  const text = prompt(inputs);
  expect(text).toContain(
    "Edit image 1. Requested change: Change only the sweater to green",
  );
  expect(text).toContain("all unrelated details");
  expect(text).toContain("front and rear");
  const portraitEdit = prompt(
    characterSheetInputsSchema.parse({ ...inputs, shot: "portrait" }),
  );
  expect(portraitEdit).not.toContain("blank front face");
  expect(portraitEdit).toContain("Keep facial details visible");
  expect(portraitEdit).toContain(
    "requested edit overrides default appearance or expression",
  );
  const context: BuildContext = {
    mentions: [],
    asset: async (ref) => ({
      ref,
      mediaType: "image/png",
      sizeBytes: 1,
      publicUrl: null,
      base64: async () => "",
      dataUri: async () => "data:image/png;base64,AQ==",
      fetchableUrl: async () => "https://assets.example/source.png",
    }),
  };
  const definition = getWorkflowDefinition("image.character-sheet")!;
  expect(definition.provider!(inputs)).toBe("cloud-workflow");
  const request = await definition.build(inputs, context);
  expect(request.input.media).toEqual([
    {
      node: "10",
      field: "image",
      url: "data:image/png;base64,AQ==",
      filename: "reference-0.png",
      contentType: "image/png",
    },
  ]);
});
