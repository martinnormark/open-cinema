import { z } from "zod";

/**
 * Project direction: a shared look that every shot in a project inherits, and
 * the directing choices a single shot makes on top of it. Identity lives on
 * Elements, state on their states, and portrayal here, so a shot override never
 * rewrites the project or an approved Element.
 */

export interface DirectionOption {
  id: string;
  label: string;
  /** Appended to the prompt; written so FLUX and LTX read it as camera language. */
  phrase: string;
  /**
   * Used for video instead of `phrase`. LTX draws camera hardware it is told
   * about: "shot on a 24mm lens" with "35mm film grain" put a round,
   * keyhole-shaped lens mask over every frame. Video phrases describe the
   * picture, never the lens or film stock (see LTX_FRAME_ARTEFACT).
   */
  video?: string;
  hint: string;
}

export const LOOK_FIELDS = [
  "palette",
  "lighting",
  "lens",
  "texture",
  "pacing",
] as const;
export type LookField = (typeof LOOK_FIELDS)[number];

export const LOOK_FIELD_LABELS: Record<LookField, string> = {
  palette: "Palette",
  lighting: "Lighting",
  lens: "Lens",
  texture: "Texture",
  pacing: "Pacing",
};

export const LOOK_OPTIONS: Record<LookField, readonly DirectionOption[]> = {
  palette: [
    {
      id: "natural",
      label: "Natural",
      phrase: "true-to-life natural colors",
      hint: "Colors as the eye sees them",
    },
    {
      id: "warm-amber",
      label: "Warm amber",
      phrase: "a warm amber and honey color palette",
      hint: "Nostalgic, intimate",
    },
    {
      id: "teal-orange",
      label: "Teal and orange",
      phrase: "a teal and orange color grade",
      hint: "Blockbuster contrast of skin and shadow",
    },
    {
      id: "cool-muted",
      label: "Cool and muted",
      phrase: "a desaturated, cool blue-grey palette",
      hint: "Nordic, restrained, melancholy",
    },
    {
      id: "pastel",
      label: "Pastel",
      phrase: "a soft pastel palette of pale pinks, mint and cream",
      hint: "Light, whimsical, symmetrical comedy",
    },
    {
      id: "monochrome",
      label: "Black and white",
      phrase: "high-contrast black and white",
      hint: "Graphic, timeless",
    },
    {
      id: "neon",
      label: "Neon night",
      phrase: "saturated magenta and cyan neon colors against deep shadow",
      hint: "Urban night, synthetic glow",
    },
  ],
  lighting: [
    {
      id: "soft-daylight",
      label: "Soft daylight",
      phrase: "soft diffused window daylight",
      hint: "Even and flattering",
    },
    {
      id: "golden-hour",
      label: "Golden hour",
      phrase: "low golden-hour sunlight raking from the side",
      hint: "Long warm shadows",
    },
    {
      id: "overcast",
      label: "Overcast",
      phrase: "flat overcast light with no hard shadows",
      hint: "Quiet, documentary",
    },
    {
      id: "hard-sun",
      label: "Hard sun",
      phrase: "hard midday sun with crisp black shadows",
      hint: "Heat, exposure",
    },
    {
      id: "low-key",
      label: "Low key",
      phrase:
        "low-key chiaroscuro lighting, one motivated source, deep shadows",
      hint: "Noir, suspense",
    },
    {
      id: "practicals",
      label: "Practical lamps",
      phrase: "lit only by warm practical lamps inside the scene",
      hint: "Evening interiors",
    },
    {
      id: "blue-hour",
      label: "Blue hour",
      phrase: "cool blue-hour twilight with a few warm lights",
      hint: "Between day and night",
    },
  ],
  lens: [
    {
      id: "wide-24",
      label: "Wide 24mm",
      phrase: "shot on a 24mm wide-angle lens",
      video: "wide-angle perspective with a broad field of view",
      hint: "Space and environment",
    },
    {
      id: "normal-35",
      label: "Normal 35mm",
      phrase: "shot on a 35mm lens",
      video: "natural perspective, as the eye sees it",
      hint: "Natural perspective",
    },
    {
      id: "portrait-85",
      label: "Portrait 85mm",
      phrase: "shot on an 85mm portrait lens with compressed perspective",
      video: "flattering portrait perspective, the background compressed",
      hint: "Intimate, flattering",
    },
    {
      id: "tele-135",
      label: "Telephoto",
      phrase: "shot on a long telephoto lens, strongly compressed background",
      video: "observed from far away, the background strongly compressed",
      hint: "Observed from afar",
    },
    {
      id: "anamorphic",
      label: "Anamorphic",
      phrase:
        "shot on anamorphic cinema lenses, oval bokeh and subtle horizontal flares, the full widescreen frame with no masking",
      video:
        "cinematic widescreen look with oval bokeh and subtle horizontal flares",
      hint: "Cinema widescreen",
    },
    {
      id: "vintage",
      label: "Vintage glass",
      phrase: "vintage lens with soft edges and gentle vignetting",
      video: "soft, slightly hazy vintage look with warm, low contrast",
      hint: "Imperfect, warm",
    },
  ],
  texture: [
    {
      id: "clean",
      label: "Clean digital",
      phrase: "clean, sharp digital image",
      hint: "Crisp, modern",
    },
    {
      id: "film-35",
      label: "35mm film",
      phrase: "fine 35mm film grain and gentle halation",
      video: "fine film grain and a soft glow around highlights",
      hint: "Classic cinema",
    },
    {
      id: "film-16",
      label: "16mm film",
      phrase: "coarse 16mm film grain with soft contrast",
      video: "coarse, visible grain with soft contrast",
      hint: "Indie, handmade",
    },
    {
      id: "glossy",
      label: "Glossy",
      phrase: "glossy commercial finish with polished highlights",
      hint: "Advertising",
    },
    {
      id: "painterly",
      label: "Painterly",
      phrase: "painterly texture like an oil painting",
      hint: "Illustrative",
    },
  ],
  pacing: [
    {
      id: "still",
      label: "Still",
      phrase: "almost still, patient and contemplative, long held moments",
      hint: "Breathing room",
    },
    {
      id: "measured",
      label: "Measured",
      phrase: "measured, unhurried movement",
      hint: "Steady storytelling",
    },
    {
      id: "lively",
      label: "Lively",
      phrase: "lively, energetic movement",
      hint: "Momentum",
    },
    {
      id: "urgent",
      label: "Urgent",
      phrase: "urgent, fast and restless movement",
      hint: "Chase, panic",
    },
  ],
};

/** Each field is an option id or the creator's own words; empty clears it. */
const lookValue = z.string().trim().max(160);
export const lookSchema = z.object({
  palette: lookValue.optional(),
  lighting: lookValue.optional(),
  lens: lookValue.optional(),
  texture: lookValue.optional(),
  pacing: lookValue.optional(),
  /** Anything else that defines the look, in a sentence. */
  notes: z.string().trim().max(300).optional(),
});
export type Look = z.infer<typeof lookSchema>;

export const SHOT_FIELDS = ["framing", "depth", "performance"] as const;
export type ShotField = (typeof SHOT_FIELDS)[number];

export const SHOT_FIELD_LABELS: Record<ShotField, string> = {
  framing: "Framing",
  depth: "Focus",
  performance: "Performance",
};

/**
 * Directing choices a shot makes. Each was checked to make a visible
 * difference on FLUX 3 (see docs/project-direction.md); camera moves are a
 * separate preset set.
 */
export const SHOT_OPTIONS: Record<ShotField, readonly DirectionOption[]> = {
  framing: [
    {
      id: "extreme-wide",
      label: "Extreme wide",
      phrase:
        "extreme wide establishing shot, the subject small in a vast environment",
      hint: "Place and scale",
    },
    {
      id: "wide",
      label: "Wide",
      phrase: "wide shot showing the full figure and surroundings",
      hint: "Body and setting",
    },
    {
      id: "medium",
      label: "Medium",
      phrase: "medium shot framed from the waist up",
      hint: "Gesture and expression",
    },
    {
      id: "close-up",
      label: "Close-up",
      phrase: "close-up shot, the face filling the frame",
      hint: "Emotion",
    },
    {
      id: "detail",
      label: "Detail",
      phrase: "extreme close-up detail shot",
      hint: "Texture, a telling object",
    },
  ],
  depth: [
    {
      id: "deep",
      label: "Deep focus",
      phrase: "deep focus, everything from foreground to background sharp",
      hint: "Everything readable",
    },
    {
      id: "shallow",
      label: "Shallow",
      phrase:
        "very shallow depth of field, the subject sharp against a creamy blurred background",
      hint: "Isolate the subject",
    },
  ],
  performance: [
    {
      id: "restrained",
      label: "Restrained",
      phrase: "a restrained, understated performance with subtle expression",
      hint: "Less is more",
    },
    {
      id: "natural",
      label: "Natural",
      phrase: "a natural, unposed performance",
      hint: "Caught in the moment",
    },
    {
      id: "heightened",
      label: "Heightened",
      phrase: "a heightened, expressive performance with strong emotion",
      hint: "Big feeling",
    },
  ],
};

export const shotDirectionSchema = z.object({
  framing: z.string().trim().max(160).optional(),
  depth: z.string().trim().max(160).optional(),
  performance: z.string().trim().max(160).optional(),
});
export type ShotDirection = z.infer<typeof shotDirectionSchema>;

/**
 * The direction a generation was made with, stored with its inputs so a result
 * records the project look at that moment, what this shot overrode, and the
 * recipe it came from.
 */
export const directionSnapshotSchema = z.object({
  project: z
    .object({
      id: z.string().min(1),
      name: z.string().max(120),
      look: lookSchema,
    })
    .optional(),
  /** Per-shot changes to the project look; an empty value turns a field off. */
  overrides: lookSchema.default({}),
  shot: shotDirectionSchema.default({}),
  recipe: z
    .object({
      id: z.string().min(1),
      version: z.number().int().positive(),
      name: z.string().max(120),
    })
    .optional(),
});
export type DirectionSnapshot = z.infer<typeof directionSnapshotSchema>;
export type DirectionSnapshotInput = z.input<typeof directionSnapshotSchema>;

/** The project look with this shot's overrides applied. */
export function effectiveLook(
  snapshot: Pick<DirectionSnapshotInput, "project" | "overrides">,
): Look {
  const look: Look = { ...(snapshot.project?.look ?? {}) };
  for (const [key, value] of Object.entries(snapshot.overrides ?? {}))
    look[key as keyof Look] = value;
  return look;
}

function optionFor(
  options: readonly DirectionOption[],
  value: string | undefined,
): DirectionOption | null {
  return value ? (options.find((o) => o.id === value) ?? null) : null;
}

/** An option's label, or the creator's own words. */
export function directionLabel(
  options: readonly DirectionOption[],
  value: string | undefined,
): string {
  if (!value) return "";
  return optionFor(options, value)?.label ?? value;
}

function phrase(
  options: readonly DirectionOption[],
  value: string | undefined,
  medium: "image" | "video",
) {
  const v = value?.trim();
  if (!v) return null;
  const option = optionFor(options, v);
  if (!option) return v;
  return (medium === "video" && option.video) || option.phrase;
}

/**
 * Words LTX renders as a lens mask, vignette or film gate rather than as a
 * look. No video phrase from a preset may contain them; the creator's own
 * words are passed through as written.
 */
export const LTX_FRAME_ARTEFACT =
  /\b(lens|lenses|vignett\w*|halation|anamorphic|fisheye|shot on|\d+\s?mm)\b/i;

/**
 * The direction as prompt language. Shot choices come first because framing
 * decides composition; the look follows. Pacing and performance only apply
 * where something moves or performs.
 */
export function directionPrompt(
  snapshot: DirectionSnapshotInput | undefined,
  medium: "image" | "video",
): string {
  if (!snapshot) return "";
  const look = effectiveLook(snapshot);
  const shot = snapshot.shot ?? {};
  const parts = [
    phrase(SHOT_OPTIONS.framing, shot.framing, medium),
    phrase(SHOT_OPTIONS.depth, shot.depth, medium),
    phrase(SHOT_OPTIONS.performance, shot.performance, medium),
    phrase(LOOK_OPTIONS.palette, look.palette, medium),
    phrase(LOOK_OPTIONS.lighting, look.lighting, medium),
    phrase(LOOK_OPTIONS.lens, look.lens, medium),
    phrase(LOOK_OPTIONS.texture, look.texture, medium),
    medium === "video"
      ? phrase(LOOK_OPTIONS.pacing, look.pacing, medium)
      : null,
    look.notes?.trim() || null,
  ].filter((p): p is string => !!p);
  if (!parts.length) return "";
  return `${parts.map((p) => p.replace(/[.\s]+$/, "")).join("; ")}.`;
}

/** Appends direction to a prompt, keeping the creator's words first. */
export function withDirection(
  prompt: string,
  snapshot: DirectionSnapshotInput | undefined,
  medium: "image" | "video",
): string {
  const direction = directionPrompt(snapshot, medium);
  if (!direction) return prompt;
  const base = prompt.trim().replace(/\s+$/, "");
  return `${base}${/[.!?]$/.test(base) ? "" : "."} ${direction[0]!.toUpperCase()}${direction.slice(1)}`;
}

/**
 * For a selective revision only the look of what is regenerated can follow the
 * project: framing, lens and pacing belong to the source take.
 */
export function revisionDirectionPrompt(
  snapshot: DirectionSnapshotInput | undefined,
): string {
  if (!snapshot) return "";
  const look = effectiveLook(snapshot);
  const parts = [
    phrase(LOOK_OPTIONS.palette, look.palette, "video"),
    phrase(LOOK_OPTIONS.lighting, look.lighting, "video"),
    phrase(LOOK_OPTIONS.texture, look.texture, "video"),
  ].filter((p): p is string => !!p);
  return parts.length
    ? `Match the project's look in the new setting: ${parts.join("; ")}.`
    : "";
}
