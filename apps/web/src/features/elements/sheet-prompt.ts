/**
 * Prompts for a Character's reference set: a three-panel sheet and two close
 * portraits, one per state the Character goes through in the film.
 *
 * The rules come from what sheets teach a video model:
 * - The backdrop is plain neutral grey with soft light. "Studio" draws a photo
 *   studio with stands and lamps into the frame and bakes its key light into
 *   every later shot, so it is never said; neither is any lamp, key or rim
 *   light, which the model draws or drags into scenes that do not have it.
 * - Hands stay empty. A prop born inside a sheet can never be dropped, thrown
 *   or taken away, so every object is its own Thing Element.
 * - The full-body panels lose their heads after generation (see headless.ts),
 *   so the large portrait is the only face to learn from.
 * - The portrait is made twice, with and without a smile, so a laugh never
 *   arrives as somebody else's teeth.
 */

/** Words that must never reach a sheet prompt, for the reasons above. */
export const BANNED_SHEET_WORDS = [
  "studio",
  "rim light",
  "key light",
  "overhead light",
  "spotlight",
  "lamp",
  "softbox",
] as const;

export const SHEET_BACKDROP =
  "Plain seamless neutral grey backdrop, soft even diffused light from all sides, no hard shadows, no blown-out highlights. No studio, no equipment, no walls, no props, no text, no labels";

const EMPTY_HANDS = "Hands empty and relaxed, holding nothing";

export type CharacterShot = "sheet" | "portrait" | "smile";

const SHOTS: Record<CharacterShot, string> = {
  sheet: [
    "Character reference sheet: one wide image made of three equal vertical panels side by side, the same grey backdrop in every panel",
    `Left panel: the full body from the front, head to shoes, standing straight, arms relaxed at the sides. ${EMPTY_HANDS}`,
    "Middle panel: the full body from directly behind, same pose, head to shoes, the face not visible",
    "Right panel: a large close portrait of the face in three-quarter view, head and shoulders filling the panel, neutral expression, mouth closed, sharp detail in skin, eyes and hair",
    "Same person, same clothing and same proportions in all three panels",
  ].join(". "),
  portrait: [
    "Close portrait in three-quarter view, head and shoulders filling the frame, eyes toward the camera",
    "Neutral expression, mouth closed, sharp detail in skin, eyes, hair and any marks",
  ].join(". "),
  smile: [
    "Close portrait in three-quarter view, head and shoulders filling the frame, eyes toward the camera",
    "A natural open smile showing the teeth, sharp detail in the teeth, lips, skin, eyes and hair",
  ].join(". "),
};

/** Keeps the creator's words but drops banned lighting and studio words. */
export function cleanSheetText(text: string): string {
  let out = text;
  for (const word of BANNED_SHEET_WORDS)
    out = out.replace(new RegExp(`\\b${word}s?\\b`, "gi"), "");
  return out
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface CharacterShotPrompt {
  /** What makes the Character recognizable. */
  identity: string;
  /** How the Character looks in this state, if it is one. */
  state?: { name: string; description: string } | null;
  /** True when the close portrait is sent as a reference image. */
  guided?: boolean;
}

export function characterShotPrompt(
  shot: CharacterShot,
  { identity, state, guided = false }: CharacterShotPrompt,
): string {
  const subject = cleanSheetText(identity).replace(/[.\s]+$/, "");
  const look = state
    ? cleanSheetText(state.description || state.name).replace(/[.\s]+$/, "")
    : "";
  // A reference image pulls hard toward its own look. Live, a state appended
  // after the base description came back unchanged; an instruction that leads
  // with the change, without the base description to contradict it, works.
  const lead = !guided
    ? [subject, look ? `In this state: ${look}` : ""]
    : look
      ? [
          `Show the person from the reference image changed for this state: ${look}`,
          "Make the change clearly visible in the hair, skin and clothing; keep the face, age, skin tone and build as in the reference",
        ]
      : [
          "Show the person from the reference image. Keep the face, age, skin, hair and build exactly",
          subject,
        ];
  return [...lead, SHOTS[shot], SHEET_BACKDROP, "Photorealistic photograph"]
    .filter(Boolean)
    .join(". ")
    .concat(".")
    .slice(0, 2000);
}
