import type {
  Look,
  RecipeSpecInput,
  ShotDirection,
} from "@open-cinema/contracts";

/**
 * The starter collection: a few treatments that hold up across subjects,
 * each shown on an example subject with the same subject under alternative
 * treatments, so a creator can see what the recipe does before using it.
 * Example images live in `public/recipes/` and were made with exactly the
 * prompt the recipe builds (`scripts/recipe-examples.ts`).
 */
export interface RecipeExample {
  /** File under /recipes/. */
  image: string;
  /** What each slot was filled with for the example. */
  subjects: Record<string, string>;
}

export interface RecipeAlternative {
  id: string;
  label: string;
  /** What changes against the recipe's own treatment. */
  look?: Look;
  shot?: ShotDirection;
  image: string;
}

export interface BuiltinRecipe {
  id: `builtin:${string}`;
  name: string;
  summary: string;
  spec: RecipeSpecInput;
  example: RecipeExample;
  alternatives: RecipeAlternative[];
}

export const BUILTIN_RECIPES: readonly BuiltinRecipe[] = [
  {
    id: "builtin:window-light-portrait",
    name: "Window-light portrait",
    summary:
      "A quiet close-up in soft daylight. Faces read clearly, so it suits a Character's first scenes.",
    spec: {
      medium: "image",
      template:
        "{character} sits by a tall window[ holding {thing}], looking just past the camera in a quiet moment",
      slots: [
        {
          key: "character",
          type: "character",
          label: "Character",
          hint: "Whose face this is about.",
        },
        {
          key: "thing",
          type: "thing",
          label: "Thing",
          optional: true,
          hint: "Something small they hold.",
        },
      ],
      look: {
        palette: "natural",
        lighting: "soft-daylight",
        lens: "portrait-85",
        texture: "film-35",
      },
      shot: {
        framing: "close-up",
        depth: "shallow",
        performance: "restrained",
      },
      aspectRatio: "4:3",
      capabilities: ["flux-image", "flux-references", "character-sheets"],
      notes:
        "Close framing keeps the face large, which is where Element references hold best.",
    },
    example: {
      image: "window-light-portrait.webp",
      subjects: {
        character:
          "a weathered lighthouse keeper in his sixties with a grey beard and a navy wool sweater",
      },
    },
    alternatives: [
      {
        id: "low-key",
        label: "Low key, black and white",
        look: { palette: "monochrome", lighting: "low-key" },
        image: "window-light-portrait-low-key.webp",
      },
      {
        id: "golden",
        label: "Golden hour",
        look: { palette: "warm-amber", lighting: "golden-hour" },
        image: "window-light-portrait-golden.webp",
      },
    ],
  },
  {
    id: "builtin:figure-in-landscape",
    name: "Figure in the landscape",
    summary:
      "One small figure in a vast place. Establishes a Location and puts a Character in it.",
    spec: {
      medium: "image",
      template:
        "{character} stands alone in {location}, seen from far away, the land dwarfing them",
      slots: [
        {
          key: "character",
          type: "character",
          label: "Character",
          hint: "Read by silhouette and clothing at this size.",
        },
        {
          key: "location",
          type: "location",
          label: "Location",
          hint: "The place does most of the talking.",
        },
      ],
      look: {
        palette: "cool-muted",
        lighting: "overcast",
        lens: "wide-24",
        texture: "film-16",
      },
      shot: { framing: "extreme-wide", depth: "deep" },
      aspectRatio: "21:9",
      capabilities: ["flux-image", "flux-references"],
      notes:
        "Faces are tiny here, so identity rests on silhouette and wardrobe; use a closer recipe for the face.",
    },
    example: {
      image: "figure-in-landscape.webp",
      subjects: {
        character: "a woman in a long red wool coat",
        location: "a windswept moor of heather and grey stone under low cloud",
      },
    },
    alternatives: [
      {
        id: "golden",
        label: "Golden hour, warm",
        look: { palette: "warm-amber", lighting: "golden-hour" },
        image: "figure-in-landscape-golden.webp",
      },
      {
        id: "blue-hour",
        label: "Blue hour",
        look: { palette: "cool-muted", lighting: "blue-hour" },
        image: "figure-in-landscape-blue-hour.webp",
      },
    ],
  },
  {
    id: "builtin:rain-noir",
    name: "Rain noir",
    summary:
      "Night, rain and neon on wet streets. A mood for suspense that works for any Character.",
    spec: {
      medium: "image",
      template:
        "{character} waits under the rain at night[ in {location}], neon signs reflected in the wet ground, steam rising from a grate",
      slots: [
        {
          key: "character",
          type: "character",
          label: "Character",
          hint: "Who is waiting.",
        },
        {
          key: "location",
          type: "location",
          label: "Location",
          optional: true,
          hint: "A street or doorway; left empty, the city is invented.",
        },
      ],
      look: {
        palette: "neon",
        lighting: "low-key",
        lens: "anamorphic",
        texture: "film-35",
      },
      shot: { framing: "medium", depth: "shallow", performance: "restrained" },
      aspectRatio: "21:9",
      capabilities: ["flux-image", "flux-references"],
      notes:
        "Strong colored light can shift skin and wardrobe colors away from the references.",
    },
    example: {
      image: "rain-noir.webp",
      subjects: {
        character:
          "a young man in a dark raincoat with close-cropped black hair",
      },
    },
    alternatives: [
      {
        id: "monochrome",
        label: "Black and white",
        look: { palette: "monochrome" },
        image: "rain-noir-monochrome.webp",
      },
      {
        id: "teal-orange",
        label: "Teal and orange, practical lamps",
        look: { palette: "teal-orange", lighting: "practicals" },
        image: "rain-noir-teal-orange.webp",
      },
    ],
  },
  {
    id: "builtin:hero-object",
    name: "Hero object",
    summary:
      "A Thing alone on a set, lit like a product shot. Good for props that will matter later.",
    spec: {
      medium: "image",
      template:
        "{thing} on a simple plinth[ in {location}], centered, nothing else in the frame",
      slots: [
        {
          key: "thing",
          type: "thing",
          label: "Thing",
          hint: "The object that has to be recognizable later.",
        },
        {
          key: "location",
          type: "location",
          label: "Location",
          optional: true,
          hint: "Left empty, a clean studio set.",
        },
      ],
      look: {
        palette: "natural",
        lighting: "soft-daylight",
        lens: "portrait-85",
        texture: "glossy",
      },
      shot: { framing: "detail", depth: "shallow" },
      aspectRatio: "1:1",
      capabilities: ["flux-image", "flux-references"],
      notes:
        "Approved front and three-quarter references keep shape and material; text on objects can still drift.",
    },
    example: {
      image: "hero-object.webp",
      subjects: {
        thing:
          "an antique brass ship's compass with a cracked glass face and a leather strap",
      },
    },
    alternatives: [
      {
        id: "pastel",
        label: "Pastel",
        look: { palette: "pastel" },
        image: "hero-object-pastel.webp",
      },
      {
        id: "low-key",
        label: "Low key",
        look: { palette: "warm-amber", lighting: "low-key" },
        image: "hero-object-low-key.webp",
      },
    ],
  },
  {
    id: "builtin:arrival",
    name: "Arrival",
    summary:
      "A Character walks into a Location and stops to take it in. A short LTX 2.5 clip.",
    spec: {
      medium: "video",
      template:
        "{character} walks into {location} and slows to a stop, looking around, taking it all in",
      slots: [
        {
          key: "character",
          type: "character",
          label: "Character",
          hint: "LTX reads who they are from the Character's description.",
        },
        {
          key: "location",
          type: "location",
          label: "Location",
          hint: "Described in words; LTX on Router takes no reference images.",
        },
      ],
      look: {
        palette: "teal-orange",
        lighting: "golden-hour",
        lens: "wide-24",
        texture: "film-35",
        pacing: "measured",
      },
      shot: { framing: "wide", performance: "natural" },
      durationSeconds: 4,
      capabilities: ["ltx-video", "project-look"],
      notes:
        "Text-to-video: Elements carry by their descriptions, not their images. For a recognizable face, start from a still.",
    },
    example: {
      image: "arrival.webp",
      subjects: {
        character:
          "a lighthouse keeper in his sixties with a grey beard, navy wool sweater and yellow oilskin",
        location: "a white stone lighthouse courtyard on a cliff above the sea",
      },
    },
    alternatives: [],
  },
];

export function builtinRecipe(id: string) {
  return BUILTIN_RECIPES.find((r) => r.id === id) ?? null;
}
