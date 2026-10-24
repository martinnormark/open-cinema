import type { ReframeAspect, VfxEffect } from "@open-cinema/contracts";
import type { ReplacementKind, WardrobeIntent } from "./model";

/**
 * Change presets: tested starting points for each way of changing a take.
 *
 * A preset is content, not a workflow. It runs on the mode's own Comfy graph
 * (`replacementKinds[kind].workflowKind`) and only fills the studio's fields:
 * the words, the object that is replaced, an effect or a wardrobe choice.
 * The creator's own words go into one or two short slots, never into a
 * rewritten prompt, so what they typed stays visible and editable.
 *
 * Many are adapted from the 36 presets in Scenario's ALTER skill
 * (scenario-labs, MIT licence), whose wording was tested on Seedance 2.5 edit
 * mode; `from` names the original. The lessons carried over: say what changes
 * and what stays in one line, describe a restyle's background as art, and keep
 * text, logos and plate numbers out. Presets without `from` are our own.
 */
export interface PresetSlot {
  key: string;
  label: string;
  /** Shown as the placeholder, and used until the creator writes their own. */
  example: string;
}

export interface ChangePreset {
  id: string;
  kind: ReplacementKind;
  name: string;
  /** The result in one sentence, shown once the preset is chosen. */
  result: string;
  slots: readonly PresetSlot[];
  /** The studio's words field. `{key}` is a slot. */
  direction: string;
  /**
   * Swap an object: an example of what is in the shot now, for the studio's
   * own field. Never filled in: the swap looks for it in every frame.
   */
  replaced?: string;
  /** Recast: what they wear. */
  wardrobe?: Exclude<WardrobeIntent, "keep">;
  wardrobeNote?: string;
  effect?: VfxEffect;
  aspect?: ReframeAspect;
  /** The reference that makes it work, when one matters. */
  reference?: string;
  /** The ALTER preset it is adapted from. */
  from?: string;
}

export const CHANGE_PRESETS: readonly ChangePreset[] = [
  // Swap an object: the Thing is the new object; Things include clothing.
  {
    id: "product-in-hand",
    kind: "object",
    name: "Product in hand",
    result:
      "Your product in their hand, held the same way and lit like the shot.",
    replaced: "the white paper coffee cup",
    slots: [],
    direction:
      "Held exactly the same way at the same size, printed and lit like a real object in this light, the highlights running over it",
    reference:
      "A Thing with a view close to the shot's angle reads as photographed, not pasted on.",
    from: "product-swap",
  },
  {
    id: "prop",
    kind: "object",
    name: "Prop",
    result: "A new prop, the same size, moving exactly as the old one did.",
    replaced: "the black umbrella",
    slots: [],
    direction: "The same size in the hand, moving exactly as the original does",
    from: "prop-swap",
  },
  {
    id: "device",
    kind: "object",
    name: "Device",
    result: "A new phone, tablet or camera with the same grip.",
    replaced: "the phone in her hand",
    slots: [
      {
        key: "screen",
        label: "Its screen shows",
        example: "a plain dark screen",
      },
    ],
    direction: "The same grip and screen angle; the screen shows {screen}",
    from: "device-swap",
  },
  {
    id: "food-drink",
    kind: "object",
    name: "Food or drink",
    result: "A new dish or drink, eaten or drunk the same way.",
    replaced: "the bowl of noodles",
    slots: [],
    direction:
      "The same portion size, the same steam or condensation, eaten the same way",
    from: "food-drink-swap",
  },
  {
    id: "vehicle",
    kind: "object",
    name: "Vehicle",
    result: "A new car or bike on the same path at the same speed.",
    replaced: "the grey hatchback",
    slots: [],
    direction:
      "The same path, speed, lane and reflections; no badges and no plate text",
    reference: "A Thing seen from a similar angle to the shot.",
    from: "vehicle-swap",
  },
  {
    id: "shoes",
    kind: "object",
    name: "Shoes",
    result: "New shoes, with the same steps and ground contact.",
    replaced: "the white trainers",
    slots: [],
    direction:
      "Plain uppers with no logos, stripes or patches; the same steps and ground contact",
    from: "shoe-swap",
  },
  {
    id: "accessory",
    kind: "object",
    name: "Accessory",
    result: "Glasses, a hat or a bag that sits naturally and moves with them.",
    replaced: "the sunglasses",
    slots: [],
    direction: "Sitting naturally and moving with the body",
    from: "accessory-swap",
  },
  {
    id: "outfit",
    kind: "object",
    name: "Outfit",
    result: "A Thing from your wardrobe, worn through every movement.",
    replaced: "the olive hoodie",
    slots: [],
    direction:
      "The same fit to the body, the fabric moving and creasing naturally with every movement",
    reference: "A clothing Thing photographed worn, front and back.",
    from: "outfit",
  },
  {
    id: "costume",
    kind: "object",
    name: "Costume",
    result: "Armour, a uniform or a period costume, worn naturally.",
    replaced: "his jacket and jeans",
    slots: [],
    direction: "Worn naturally, with the same movement",
    from: "costume",
  },

  // Fix an area: painted on the frame, described in words.
  {
    id: "colourway",
    kind: "area",
    name: "Colourway",
    result: "What you paint, in a new colour; the material stays.",
    slots: [
      { key: "object", label: "What you paint", example: "the sneakers" },
      { key: "colour", label: "The new colour", example: "matte forest green" },
    ],
    direction:
      "{object} in {colour}, the same material, finish and reflections",
    from: "colourway",
  },
  {
    id: "de-logo",
    kind: "area",
    name: "Remove a logo",
    result: "Plain surfaces where a logo, word or number was.",
    slots: [{ key: "object", label: "What you paint", example: "the t-shirt" }],
    direction:
      "{object} with every logo, brand mark, word and number removed; plain surfaces in the same material and colour",
    from: "de-logo",
  },
  {
    id: "hair",
    kind: "area",
    name: "Hair",
    result: "A new cut or colour; the face stays theirs.",
    slots: [{ key: "hair", label: "The new hair", example: "a platinum bob" }],
    direction:
      "Their hair as {hair}; the face, expression and identity unchanged",
    from: "hair-makeup",
  },

  // Recast a character.
  {
    id: "recast",
    kind: "character",
    name: "Your Character in the role",
    result: "Your Character plays it, in their own look.",
    slots: [],
    wardrobe: "character",
    direction:
      "The same movements, expressions and lip movements; the set and the light stay as shot",
    from: "recast",
  },
  {
    id: "recast-wardrobe",
    kind: "character",
    name: "Recast in new clothes",
    result: "Your Character plays it, dressed for this shot.",
    slots: [
      {
        key: "outfit",
        label: "What they wear",
        example: "a long camel wool overcoat, open, over a white t-shirt",
      },
    ],
    wardrobe: "describe",
    wardrobeNote: "{outfit}",
    direction:
      "The same movements, expressions and lip movements; the set and the light stay as shot",
  },
  {
    id: "creature",
    kind: "character",
    name: "Creature",
    result: "A creature performs it, with real weight and anatomy.",
    slots: [],
    wardrobe: "character",
    direction:
      "Real anatomy and weight, matching every movement and its timing",
    reference: "A Character made as the creature, full body.",
    from: "creature",
  },

  // Copy the moves.
  {
    id: "recurring",
    kind: "moves",
    name: "Recurring character",
    result: "The same face and outfit in every video of a series.",
    slots: [],
    direction:
      "The identical face and outfit from the references, the same performance",
    reference: "The same Character state in every video of the series.",
    from: "my-character",
  },
  {
    id: "mascot-3d",
    kind: "moves",
    name: "3D mascot",
    result: "A feature-film 3D character gives the same performance.",
    slots: [],
    direction:
      "A 3D animated character with feature-film rendering, the same performance",
    reference: "A Character drawn as the 3D figure, full body.",
    from: "mascot-3d",
  },
  {
    id: "game-character",
    kind: "moves",
    name: "Game character",
    result: "A game character performs the clip in its exact costume.",
    slots: [],
    direction:
      "The exact costume, colours and proportions of the character sheet, performing exactly the same movements",
    reference: "The character sheet, full body.",
    from: "game-character",
  },

  // Replace background.
  {
    id: "new-place",
    kind: "background",
    name: "Somewhere else",
    result: "The same take in a new place, lit by it.",
    slots: [
      {
        key: "place",
        label: "The new place",
        example: "a snowy alpine village path at blue hour",
      },
    ],
    direction:
      "{place}: new ground, walls, sky and background, the light motivated by the new place",
    from: "new-location",
  },
  {
    id: "era",
    kind: "background",
    name: "Another era",
    result: "The setting moves to another decade or century.",
    slots: [
      {
        key: "era",
        label: "The era",
        example: "a 1970s city street on film stock",
      },
    ],
    direction:
      "{era}, with the buildings, street furniture and passing details of the period; no signs or text",
    from: "era",
  },
  {
    id: "sci-fi",
    kind: "background",
    name: "Another world",
    result: "A science-fiction or fantasy world around the take.",
    slots: [
      {
        key: "world",
        label: "The world",
        example: "a starship corridor in cold blue panel light",
      },
    ],
    direction: "{world}, the light coming from the new world",
    from: "sci-fi",
  },
  {
    id: "game-level",
    kind: "background",
    name: "Game level",
    result: "The take inside a game environment.",
    slots: [
      {
        key: "world",
        label: "The level",
        example: "a sunlit low-poly harbour town",
      },
    ],
    direction:
      "The game environment of {world}, its exact architecture and palette, seen from the same camera height",
    from: "game-level",
  },
  {
    id: "local-market",
    kind: "background",
    name: "Local version",
    result: "The same ad, set somewhere that belongs to another market.",
    slots: [
      {
        key: "setting",
        label: "The setting",
        example: "a small Tokyo apartment kitchen",
      },
    ],
    direction: "{setting}; no signs, posters or text",
    from: "market-variant",
  },

  // Add an effect.
  {
    id: "night",
    kind: "effect",
    name: "Night",
    result: "The same take at night.",
    slots: [
      {
        key: "light",
        label: "The night light",
        example: "cool moonlight with warm street lamps along the wall",
      },
    ],
    effect: "night",
    direction: "{light}",
    from: "time-of-day",
  },
  {
    id: "rain",
    kind: "effect",
    name: "Rain",
    result: "Rain on every surface, the people included.",
    slots: [
      {
        key: "rain",
        label: "The rain",
        example: "a heavy downpour, streaks of rain through the frame",
      },
    ],
    effect: "water",
    direction:
      "{rain}, wet surfaces and reflections, the clothes reacting to it",
    from: "weather",
  },
  {
    id: "empty-set",
    kind: "effect",
    name: "Empty the set",
    result: "Passers-by gone, and what was behind them rebuilt.",
    slots: [
      {
        key: "who",
        label: "Who goes",
        example: "the people walking in the background",
      },
    ],
    effect: "clean-plate",
    direction: "{who}",
  },

  // Restyle. The background is named as art, or it stays a photograph.
  {
    id: "anime",
    kind: "restyle",
    name: "Anime",
    result: "A hand-drawn anime feature, background and all.",
    slots: [
      {
        key: "place",
        label: "The place as seen",
        example: "the seaside promenade, the sea and the sky",
      },
    ],
    direction:
      "A hand-drawn 2D anime feature film: clean ink lines, flat cel shading with one shadow tone. The people are hand-drawn anime characters with the same hair and clothes; the background, {place}, is hand-painted anime background art with flat colour areas and painted clouds. Nothing stays photographic",
    from: "anime",
  },
  {
    id: "3d-feature",
    kind: "restyle",
    name: "3D feature",
    result: "A stylised 3D animated film of the same take.",
    slots: [
      {
        key: "place",
        label: "The place as seen",
        example: "the street and the shopfronts",
      },
    ],
    direction:
      "A 3D animated feature film: stylised characters with slightly larger heads and hands, smooth skin and sculpted hair, soft global illumination. The background, {place}, is a stylised 3D set of soft rounded shapes and clean simple surfaces",
    from: "3d-feature",
  },
  {
    id: "claymation",
    kind: "restyle",
    name: "Claymation",
    result: "Plasticine puppets on a handmade miniature set.",
    slots: [
      {
        key: "place",
        label: "The place as seen",
        example: "the kitchen and the window",
      },
    ],
    direction:
      "Stop-motion claymation: the people are plasticine puppets with thumbprints and the same hair and clothes; the background, {place}, is a handmade miniature set of clay, card and felt",
    reference:
      "Holds best with a style image of a clay frame; from words alone it can stay photographic.",
    from: "clay",
  },
  {
    id: "painterly",
    kind: "restyle",
    name: "Painting",
    result: "A moving painting with strokes that follow the motion.",
    slots: [
      { key: "medium", label: "The paint", example: "watercolour" },
      {
        key: "place",
        label: "The place as seen",
        example: "the harbour and the boats",
      },
    ],
    direction:
      "A moving {medium} painting on textured paper: visible brush strokes that follow the motion, the people painted with soft edges and a little underdrawing, {place} in loose {medium} washes and a few confident strokes",
    from: "painterly",
  },
  {
    id: "comic",
    kind: "restyle",
    name: "Comic ink",
    result: "Inked comic-book art with halftone shading.",
    slots: [
      {
        key: "place",
        label: "The place as seen",
        example: "the rooftop and the skyline",
      },
    ],
    direction:
      "Inked comic-book art: bold outlines, halftone shading and flat colour, the people and {place} inked alike; no speech bubbles or lettering",
    from: "comic-ink",
  },
  {
    id: "pixel",
    kind: "restyle",
    name: "Retro game",
    result: "Crisp pixels or early console 3D.",
    slots: [
      { key: "retro", label: "The style", example: "16-bit pixel art" },
      {
        key: "place",
        label: "The place as seen",
        example: "the park path and the trees",
      },
    ],
    direction:
      "{retro} with crisp pixels and a limited palette, the people and {place} drawn alike",
    from: "pixel-retro",
  },
  {
    id: "noir",
    kind: "restyle",
    name: "Film noir",
    result: "1940s black and white with hard light and deep shadow.",
    slots: [],
    direction:
      "1940s black-and-white film noir: hard key light, deep shadows, venetian-blind light and heavy grain, the people in the same clothes lit like a studio picture",
    from: "noir",
  },
  {
    id: "live-action",
    kind: "restyle",
    name: "Animation to live action",
    result: "Animated footage made photoreal.",
    slots: [],
    direction:
      "Photoreal live action: real people with the same hair and clothes, real materials and real light on every surface",
    from: "animation-to-live",
  },
  {
    id: "film-crew",
    kind: "restyle",
    name: "Shot by a crew",
    result: "Phone footage that looks shot on a cinema camera.",
    slots: [],
    direction:
      "Shot by a film crew: clean motivated light, a cinema lens and graded colour, the same people and framing",
    from: "phone-to-studio",
  },

  // Reframe.
  {
    id: "vertical",
    kind: "reframe",
    name: "Vertical for social",
    result: "A 9:16 version, the new edges drawn in.",
    slots: [
      {
        key: "around",
        label: "Above and below them",
        example: "more of the street and the sky",
      },
    ],
    aspect: "9:16",
    direction: "{around}",
  },
];

export function presetsFor(kind: ReplacementKind) {
  return CHANGE_PRESETS.filter((p) => p.kind === kind);
}

export function presetById(id: string | null | undefined) {
  return id ? (CHANGE_PRESETS.find((p) => p.id === id) ?? null) : null;
}

export type SlotValues = Record<string, string>;

/**
 * A template with its slots filled. An empty slot falls back to its example,
 * so a chosen preset can run before anything is typed.
 */
export function fillPreset(
  template: string,
  preset: ChangePreset,
  values: SlotValues,
) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key]?.trim();
    return value || (preset.slots.find((s) => s.key === key)?.example ?? "");
  });
}

/** A slot at the start of a sentence reads as one. */
export function sentenceCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The studio's fields as the preset writes them. */
export function presetFields(preset: ChangePreset, values: SlotValues) {
  return {
    direction: sentenceCase(fillPreset(preset.direction, preset, values)),
    wardrobeNote: preset.wardrobeNote
      ? fillPreset(preset.wardrobeNote, preset, values)
      : null,
  };
}
