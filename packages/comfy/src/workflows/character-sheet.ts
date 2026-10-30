import type { CharacterSheetInputs } from "@open-cinema/contracts";
import type { WorkflowDefinition } from "./types";
import { mediaFilename } from "./ltx-alpha-background";

export const CHARACTER_SHEET_MODEL = "comfy-cloud/character-sheet-v1";
export const CHARACTER_SHEET_OUTPUTS = ["100"] as const;
type Graph = Record<
  string,
  {
    class_type: string;
    inputs: Record<string, unknown>;
    _meta?: { title: string };
  }
>;

const BACKDROP =
  "Plain seamless neutral grey backdrop (#808080), soft even diffused light, no hard shadows, no blown-out highlights. No studio, no equipment, no walls, no props, no text, no labels. Photorealistic photograph.";
const SHOTS = {
  sheet:
    "Exactly three equal vertical panels, side by side in one wide image. Left third: one full body directly facing camera, head to shoes, standing straight, hands empty and relaxed. Middle third: the same full body directly from behind, head to shoes, face not visible. Right third: one large sharp three-quarter face close-up, head and shoulders, neutral expression, mouth closed. Same person, clothing and proportions in every panel. Keep each view entirely inside its third, no borders or gutters.",
  portrait:
    "One sharp three-quarter close portrait, head and shoulders filling the frame, eyes toward camera, neutral expression, mouth closed. No collage.",
  smile:
    "One sharp three-quarter close portrait, head and shoulders filling the frame, eyes toward camera, a natural open smile showing teeth. Preserve the same face and teeth. No collage.",
} as const;

function clean(text: string) {
  return text
    .replace(
      /\b(studio|rim light|key light|overhead light|spotlight|lamp|softbox)s?\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Native ComfyUI graph: inputs → template → FLUX 3 → front-face mask → saved sheet.
 * The partner node performs its own prompt expansion. No extra LLM or credential.
 * Only the first third is processed, so rear and close-up pixels remain intact.
 */
export function characterSheetGraph(inputs: CharacterSheetInputs): Graph {
  const { shot, source, edit, references, state } = inputs;
  const guided = references.length > 0;
  const graph: Graph = {};
  const add = (
    id: string,
    class_type: string,
    values: Record<string, unknown>,
    title: string,
  ) => {
    graph[id] = { class_type, inputs: values, _meta: { title } };
  };
  add(
    "1",
    "PrimitiveStringMultiline",
    { value: clean(inputs.prompt) },
    "Character identity from the UI",
  );
  add(
    "2",
    "PrimitiveStringMultiline",
    {
      value: state ? clean(state.description || state.name) : "Base appearance",
    },
    "State direction from the UI",
  );
  add(
    "3",
    "PrimitiveStringMultiline",
    { value: edit ? clean(edit) : "Create this reference view" },
    "Edit instructions from the UI",
  );
  const lead = source
    ? `Edit image 1. Requested change: {c}. Keep its identity, pose, composition, background and all unrelated details. ${shot === "sheet" ? "Apply clothing changes consistently to front and rear. Preserve the blank front face; the close portrait is the face authority." : "Keep facial details visible and preserve this person's identity."} Identity context: {a}. Current state: {b}.`
    : guided && state
      ? "Show the person from the reference changed for this state: {b}. Identity and default clothing: {a}. State instructions take priority only for the attributes they explicitly change. Keep unspecified clothing items, colors and materials from the default clothing; wetness changes their condition, never replaces the outfit. Keep the face, age, skin tone and build from the reference unless the state explicitly changes one. Make the requested state clearly visible."
      : `${guided ? "Use the reference images for the same person's face and build. " : ""}Identity: {a}. State: {b}.`;
  add(
    "4",
    "StringFormat",
    {
      "values.a": ["1", 0],
      "values.b": ["2", 0],
      "values.c": ["3", 0],
      f_string: `${lead}\n${SHOTS[shot]}\n${BACKDROP}${source ? "\nThe requested edit overrides default appearance or expression instructions, but keep the reference layout." : ""}`,
    },
    "Character reference prompt template v1",
  );
  const imageInputs: Record<string, unknown> = {
    prompt: ["4", 0],
    aspect_ratio: shot === "sheet" ? "21:9" : "3:4",
    resolution: shot === "sheet" ? "1.5K" : "1K",
    grounding: false,
    safety_tolerance: 4,
    seed: inputs.cacheNonce,
  };
  const refs = [...(source ? [source] : []), ...references];
  for (let i = 0; i < refs.length; i++) {
    const id = String(10 + i);
    add(
      id,
      "LoadImage",
      { image: `reference-${i}.png` },
      i === 0 && source
        ? "Original image to edit"
        : "Approved identity reference",
    );
    imageInputs[`images.image_${i + 1}`] = [id, 0];
  }
  add("20", "Flux3ImageNode", imageInputs, "FLUX 3 Image: generate or edit");
  let result = "20";
  if (shot === "sheet") {
    add(
      "30",
      "ImageScale",
      {
        image: ["20", 0],
        upscale_method: "lanczos",
        width: 2352,
        height: 1008,
        crop: "disabled",
      },
      "Normalize the 21:9 sheet",
    );
    add(
      "31",
      "ImageCropV2",
      {
        image: ["30", 0],
        crop_region: { x: 0, y: 0, width: 784, height: 1008 },
      },
      "Front panel only",
    );
    add(
      "39",
      "ImageCropV2",
      {
        image: ["31", 0],
        crop_region: { x: 0, y: 0, width: 784, height: 256 },
      },
      "Limit face detection to the top of the standing figure",
    );
    add(
      "32",
      "LoadMediaPipeFaceLandmarker",
      { model_name: "mediapipe_face_fp32.safetensors" },
      "Front-face detector",
    );
    add(
      "33",
      "MediaPipeFaceLandmarker",
      {
        face_detection_model: ["32", 0],
        image: ["39", 0],
        detector_variant: "both",
        num_faces: 1,
        min_confidence: 0.5,
        missing_frame_fallback: "empty",
      },
      "Find faces only in the front panel",
    );
    add(
      "34",
      "MediaPipeFaceMask",
      { face_landmarks: ["33", 0], regions: "all" },
      "Remove facial features",
    );
    add(
      "35",
      "GrowMask",
      { mask: ["34", 0], expand: 8, tapered_corners: true },
      "Cover the edge of the face",
    );
    add(
      "36",
      "EmptyImage",
      { width: 784, height: 256, batch_size: 1, color: 8421504 },
      "Neutral grey face replacement",
    );
    add(
      "37",
      "ImageCompositeMasked",
      {
        destination: ["31", 0],
        source: ["36", 0],
        mask: ["35", 0],
        x: 0,
        y: 0,
        resize_source: false,
      },
      "Blank the front face",
    );
    add(
      "38",
      "ImageCompositeMasked",
      {
        destination: ["30", 0],
        source: ["37", 0],
        x: 0,
        y: 0,
        resize_source: false,
      },
      "Restore front; preserve rear and close-up",
    );
    result = "38";
  }
  add(
    "100",
    "SaveImage",
    { images: [result, 0], filename_prefix: `open_cinema_character_${shot}` },
    "Finished reference ready for review",
  );
  return graph;
}

export const characterSheetWorkflow: WorkflowDefinition<"image.character-sheet"> =
  {
    kind: "image.character-sheet",
    displayModel: "FLUX 3 Image · character workflow",
    model: () => CHARACTER_SHEET_MODEL,
    provider: () => "cloud-workflow",
    deadlineMs: 30 * 60_000,
    cloudOutputNodes: CHARACTER_SHEET_OUTPUTS,
    async build(inputs, context) {
      const refs = [
        ...(inputs.source ? [inputs.source] : []),
        ...inputs.references,
      ];
      const media = await Promise.all(
        refs.map(async (ref, i) => {
          const asset = await context.asset(ref);
          if (!asset.mediaType.startsWith("image/"))
            throw new Error("Character references must be images");
          return {
            node: String(10 + i),
            field: "image",
            url: asset.publicUrl ?? (await asset.dataUri()),
            filename: mediaFilename(`reference-${i}`, asset.mediaType),
            contentType: asset.mediaType,
          };
        }),
      );
      return {
        model: CHARACTER_SHEET_MODEL,
        input: { graph: characterSheetGraph(inputs), media },
      };
    },
    outputs: () => [],
  };
