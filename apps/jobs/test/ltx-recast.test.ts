import { expect, it } from "vitest";
import {
  ltxRecastGraph,
  ltxRecastPrompts,
  LTX_RECAST_MODELS,
} from "@open-cinema/comfy";

const prompts = ltxRecastPrompts({
  target: "the woman in the denim jacket on the left",
  name: "Mara",
  identity: "a woman in her early thirties with a platinum blunt bob.",
  wardrobe: "a mustard-yellow rain jacket",
  action: "drinks from a cup",
  references: 2,
  sheet: true,
});

function graph(sheet: boolean) {
  return ltxRecastGraph({
    ...prompts,
    references: 2,
    sheet,
    target: { x: 0.15, y: 0.13, width: 0.36, height: 0.87 },
    poseStrength: 0.9,
    seed: 7,
  });
}

it("uses only Lightricks adapters, and Ingredients only with a sheet", () => {
  const loras = (sheet: boolean) =>
    Object.values(graph(sheet))
      .filter((n) => n.class_type.includes("LoRALoader"))
      .map((n) => n.inputs.lora_name);
  expect(loras(false)).toEqual([LTX_RECAST_MODELS.unionControl]);
  expect(loras(true)).toEqual([
    LTX_RECAST_MODELS.unionControl,
    LTX_RECAST_MODELS.ingredients,
  ]);
  expect(graph(true).sheet_guide?.inputs.frame_idx).toBe(-1);
});

it("guides motion with ComfyUI's core edge nodes, loading no detector weights", () => {
  const g = graph(false);
  expect(g.edges?.class_type).toBe("Canny");
  expect(g.edges?.inputs.image).toEqual(["edges_blur", 0]);
  expect(g.motion_guide?.inputs.image).toEqual(["edges", 0]);
  expect(
    Object.values(g).filter((n) => n.class_type === "DWPreprocessor"),
  ).toHaveLength(0);
});

it("generates only inside the marked person and keeps the take's audio", () => {
  const g = graph(false);
  expect(g.target_x?.inputs.expression).toBe("max(1, round(a * 0.15))");
  expect(g.mask_source_seed?.inputs.bboxes).toEqual(["target_box", 0]);
  expect(g.mask_result_track?.inputs.images).toEqual(["generated_full", 0]);
  expect(g.composite?.inputs).toMatchObject({
    destination: ["source_clip", 0],
    source: ["generated_full", 0],
    mask: ["mask", 0],
  });
  expect(g.save_result_video?.inputs.audio).toEqual(["source_frames", 1]);
});

it("names the references and the sheet layout in the prompts", () => {
  expect(prompts.keyframePrompt).toContain(
    "replace the woman in the denim jacket on the left with Mara, the person shown in the second image and the third image",
  );
  expect(
    prompts.videoPrompt.startsWith("### Reference Sheet Description"),
  ).toBe(true);
  expect(prompts.videoPrompt).toContain(
    "platinum blunt bob, wearing a mustard-yellow rain jacket, drinks from a cup.",
  );
});
