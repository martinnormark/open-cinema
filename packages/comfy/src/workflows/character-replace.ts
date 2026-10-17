import {
  CONFORM_STAGE,
  type CharacterReplaceInputs,
  type ReferenceView,
  type ResolvedMention,
  type TargetSelection,
} from "@open-cinema/contracts";
import { KLING_EDIT_LIMITS } from "./background-replace";
import type { BuildContext, MediaStage, ProviderRequest } from "./types";

/**
 * `video.character-replace` runs on Kling V3 Omni's video edit (`refer_type:
 * base`): the source clip is re-rendered with the selected person replaced by
 * the Character in the reference images, keeping the edit's duration. Chosen in
 * Phase 0 over Kling O1, Wan 2.7 / HappyHorse video edit, Runway Aleph 2 and
 * Higgsfield Genjutsu; evidence and limits are in docs/phase0-recast.md.
 */
export const CHARACTER_REPLACE_MODEL = "kling/kling-v3-omni";

/** Most informative views first: whole body and wardrobe, then the face. */
const VIEW_PRIORITY: readonly ReferenceView[] = [
  "full-body",
  "front",
  "face-closeup",
  "three-quarter",
  "rear",
  "profile",
  "expression",
];

function viewRank(view: ReferenceView | null) {
  const rank = view ? VIEW_PRIORITY.indexOf(view) : -1;
  return rank < 0 ? VIEW_PRIORITY.length : rank;
}

/** Views that show the face without the Character's outfit. */
const FACE_VIEWS: readonly ReferenceView[] = ["face-closeup", "expression"];

/**
 * Orders a Character's approved references for an identity-and-body recast.
 * When the source wardrobe is kept, only face views go: full-body and
 * three-quarter views carry the reference outfit, which Kling followed over
 * the prompt in Phase 0 (G4, U5). That variant is not yet measured, so the
 * composer does not offer keeping the wardrobe.
 */
export function characterReferences(
  mention: ResolvedMention,
  { faceOnly = false }: { faceOnly?: boolean } = {},
) {
  const ordered = [...mention.references]
    .filter(
      (r) =>
        r.roles.length === 0 ||
        r.roles.some((role) =>
          ["identity", "appearance", "wardrobe"].includes(role),
        ),
    )
    .sort((a, b) => viewRank(a.view) - viewRank(b.view));
  if (!faceOnly) return ordered;
  const faces = ordered.filter(
    (r) =>
      (r.view && FACE_VIEWS.includes(r.view)) ||
      (r.roles.includes("identity") && !r.roles.includes("wardrobe")),
  );
  return faces.length ? faces : ordered;
}

/**
 * Kling cannot take coordinates, so a point or box becomes a spatial phrase
 * that is combined with the creator's description of the person.
 */
export function describeTarget(target: TargetSelection): string {
  if (target.type !== "person")
    throw new Error("Select the person to recast in the source video");
  const x = target.box
    ? target.box.x + target.box.width / 2
    : (target.point?.x ?? null);
  const side =
    x === null
      ? null
      : x < 0.38
        ? "on the left of the frame"
        : x > 0.62
          ? "on the right of the frame"
          : "in the centre of the frame";
  const description = target.description?.trim();
  if (description && side) return `${description} (${side})`;
  if (description) return description;
  if (side) return `the person ${side}`;
  throw new Error("Describe or point at the person to recast");
}

export interface CharacterReplacePromptOptions {
  target: string;
  character: Pick<ResolvedMention, "name" | "description" | "stateName">;
  /** True when the creator asked to keep the source person's clothing. */
  keepSourceWardrobe: boolean;
  imageTags: readonly string[];
  direction?: string | undefined;
}

/**
 * The edit instruction, worded as evaluated in Phase 0 (evaluation/recast/tools/recast.py).
 * Selection relies on the target phrase; see docs/phase0-recast.md for how often
 * that picks the right person.
 */
export function characterReplacePrompt(o: CharacterReplacePromptOptions) {
  const who = o.character.stateName
    ? `${o.character.name} (${o.character.stateName})`
    : o.character.name;
  const wardrobe = o.keepSourceWardrobe
    ? "Keep the original clothing of the replaced person exactly as in the source video; change only the person (face, hair, skin, build)."
    : "Dress the new person in their reference outfit from the reference images.";
  const identity = o.character.description.trim().replace(/[.\s]+$/, "");
  return [
    `In <<<video_1>>>, replace ${o.target} with the person shown in ${o.imageTags.join(", ")}: ${who}${identity ? `, ${identity}` : ""}.`,
    wardrobe,
    "Keep the replaced person's exact performance: body movement, pose, gestures, facial expression, gaze, head turns, lip movement and timing. Keep every other person, the background, all objects, the framing, the lighting and the camera movement exactly as in the original video. Photorealistic, same film look.",
    o.direction?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2500);
}

/** Builds the Kling V3 Omni edit request for a resolved recast. */
export async function characterReplaceRequest(
  inputs: CharacterReplaceInputs,
  context: BuildContext,
): Promise<ProviderRequest> {
  const mention = context.mentions.find(
    (m) => m.elementId === inputs.character.elementId,
  );
  if (!mention) throw new Error("The Character to recast was not resolved");
  if (mention.type !== "character")
    throw new Error("Recasting needs a Character Element");

  const source = await context.asset(inputs.source);
  if (!source.mediaType.startsWith("video/"))
    throw new Error("Recasting needs a source video");
  // Kling fetches the edited video itself; it accepts no inline video.
  const videoUrl = await source.fetchableUrl();

  const keepSourceWardrobe = inputs.preservation.preserve.includes("wardrobe");
  const refs = [
    ...inputs.references,
    ...characterReferences(mention, { faceOnly: keepSourceWardrobe }).map(
      (r) => r.asset,
    ),
  ].slice(0, KLING_EDIT_LIMITS.maxReferenceImages);
  if (!refs.length)
    throw new Error("Approve at least one reference image for this Character");
  const images = await Promise.all(
    refs.map(async (ref) => {
      const asset = await context.asset(ref);
      return { image_url: asset.publicUrl ?? (await asset.base64()) };
    }),
  );

  return {
    model: CHARACTER_REPLACE_MODEL,
    input: {
      prompt: characterReplacePrompt({
        target: describeTarget(inputs.target),
        character: mention,
        keepSourceWardrobe,
        imageTags: images.map((_, i) => `<<<image_${i + 1}>>>`),
        direction: inputs.prompt,
      }),
      mode: "pro",
      video_list: [
        {
          video_url: videoUrl,
          refer_type: "base",
          keep_original_sound: inputs.preservation.preserve.includes("audio")
            ? "yes"
            : "no",
        },
      ],
      image_list: images,
    },
  };
}

/**
 * Kling returns 24 fps at the source length within a frame, so 25 and 29.97
 * fps takes drift against their own audio and frame-exact review. A Comfy
 * Cloud graph retimes the edit onto the source's frame grid with the source
 * audio (docs/background-job.md); `conform:video` is then the result.
 */
export const characterConformStage: MediaStage<"video.character-replace"> = {
  kind: "media",
  id: CONFORM_STAGE,
  label: "Matching the source frame rate",
  deadlineMs: 20 * 60_000,
  tasks(inputs, context) {
    const editId = context.saved.find((id) => !id.includes(":"));
    const edit = editId ? context.output(editId) : null;
    if (!edit) throw new Error("The recast edit is missing");
    return [
      {
        output: "video",
        operation: "conform",
        parts: [
          { name: "source", ref: inputs.source },
          { name: "edit", ref: edit },
        ],
      },
    ];
  },
};
