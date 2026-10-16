/** Browser-safe Element vocabulary shared by the Element pages and `@` mentions.
 * Mirrors the planned contracts; the data adapter maps persistence records onto it. */
export type ElementType = "character" | "location" | "thing";
export type ReferenceStatus = "exploration" | "approved" | "rejected";

export type ReferenceSource =
  | { kind: "upload"; url: string; fileName: string }
  | { kind: "generated"; jobId: string; prompt: string };

export interface ElementReference {
  id: string;
  /** null belongs to the Element's identity; otherwise to one named state. */
  stateId: string | null;
  status: ReferenceStatus;
  /** A guidance slot id, such as `profile` or `landmark`. */
  view: string | null;
  source: ReferenceSource;
  createdAt: string;
}

export interface ElementState {
  id: string;
  name: string;
  /** Mention token, e.g. `smiling` in `@Mara:smiling`. */
  handle: string;
  description: string;
  createdAt: string;
}

export interface CreativeElement {
  id: string;
  type: ElementType;
  name: string;
  /** Mention token, e.g. `RedCoat` in `@RedCoat`. */
  handle: string;
  description: string;
  references: ElementReference[];
  states: ElementState[];
  createdAt: string;
  updatedAt: string;
}

export interface GuidanceSlot {
  id: string;
  label: string;
  /** What the creator is establishing with this view. */
  hint: string;
  required: boolean;
  /** Framing appended to the identity description for complementary views. */
  framing: string;
}

export interface ElementTypeInfo {
  type: ElementType;
  label: string;
  plural: string;
  establishes: string;
  placeholderName: string;
  placeholderThought: string;
  stateExamples: string[];
  slots: GuidanceSlot[];
}

export const elementTypes: Record<ElementType, ElementTypeInfo> = {
  character: {
    type: "character",
    label: "Character",
    plural: "Characters",
    establishes:
      "A recognizable face, body proportions and distinguishing features, seen from every side.",
    placeholderName: "Mara",
    placeholderThought:
      "A lighthouse keeper in her late thirties, weathered olive skin, short salt-and-pepper hair, a thin scar through her left eyebrow, wears a heavy wool sweater.",
    stateExamples: ["Smiling", "Exhausted", "Rain-soaked", "Formal wear"],
    slots: [
      {
        id: "face",
        label: "Face close-up",
        hint: "Facial structure, eyes, skin and distinguishing marks in detail.",
        required: true,
        framing:
          "tight close-up portrait, neutral expression, looking at camera, soft even studio light, plain light gray background, sharp facial detail",
      },
      {
        id: "full-body",
        label: "Full body",
        hint: "Height, proportions, posture and complete outfit.",
        required: true,
        framing:
          "full body shot from head to toe, standing in a relaxed neutral pose, front view, plain light gray background, even studio light",
      },
      {
        id: "three-quarter",
        label: "Three-quarter view",
        hint: "How the face and body turn between front and profile.",
        required: true,
        framing:
          "three-quarter view from the waist up, body turned 45 degrees, plain light gray background, even studio light",
      },
      {
        id: "profile",
        label: "Profile",
        hint: "Silhouette of the nose, jaw and hairline from the side.",
        required: true,
        framing:
          "strict side profile from the chest up, facing left, plain light gray background, even studio light",
      },
      {
        id: "rear",
        label: "Rear view",
        hint: "Hair, back of clothing and posture from behind.",
        required: false,
        framing:
          "full body seen from directly behind, plain light gray background, even studio light",
      },
      {
        id: "expression",
        label: "Expressions",
        hint: "Emotion that still reads as the same person.",
        required: false,
        framing:
          "close-up portrait showing a strong, natural emotional expression, plain light gray background, soft studio light",
      },
    ],
  },
  location: {
    type: "location",
    label: "Location",
    plural: "Locations",
    establishes:
      "Spatial layout, landmarks, materials, scale and atmosphere of one coherent place.",
    placeholderName: "Harbor",
    placeholderThought:
      "A small working fishing harbor on a rocky northern coast, a red-and-white lighthouse at the end of a stone breakwater, weathered timber boathouses, moored wooden boats.",
    stateExamples: ["Dawn", "Storm", "Winter night", "Abandoned"],
    slots: [
      {
        id: "establishing",
        label: "Establishing view",
        hint: "The overall layout and scale of the place.",
        required: true,
        framing:
          "wide establishing shot showing the complete layout and scale, eye level, clear daylight",
      },
      {
        id: "landmark",
        label: "Landmarks",
        hint: "The features that make this place recognizable.",
        required: true,
        framing:
          "medium shot centered on the most distinctive landmark, clear daylight, sharp architectural detail",
      },
      {
        id: "atmosphere",
        label: "Atmosphere and materials",
        hint: "Surfaces, textures, light and mood up close.",
        required: true,
        framing:
          "close detail of surfaces and materials, natural light, rich texture",
      },
      {
        id: "viewpoint",
        label: "Alternate viewpoint",
        hint: "The same place from another side, so a camera can move.",
        required: true,
        framing:
          "wide view of the same place from the opposite side, reverse angle, eye level, clear daylight",
      },
      {
        id: "aerial",
        label: "High angle",
        hint: "How the parts of the place relate from above.",
        required: false,
        framing: "high angle overview from above, clear daylight",
      },
    ],
  },
  thing: {
    type: "thing",
    label: "Thing",
    plural: "Things",
    establishes:
      "Shape, proportions, materials, construction and distinctive details, from enough angles to use it again.",
    placeholderName: "RedCoat",
    placeholderThought:
      "A knee-length double-breasted wool coat in deep crimson, brass buttons, wide notched lapels, a slightly frayed left cuff.",
    stateExamples: ["Doors open", "Worn", "Damaged", "Folded"],
    slots: [
      {
        id: "hero",
        label: "Hero view",
        hint: "The overall shape and proportions in one clear image.",
        required: true,
        framing:
          "product photograph, front three-quarter view, isolated on a plain light gray background, soft studio light",
      },
      {
        id: "side",
        label: "Side and back",
        hint: "The silhouette from another angle.",
        required: true,
        framing:
          "product photograph, side view, isolated on a plain light gray background, soft studio light",
      },
      {
        id: "material",
        label: "Materials",
        hint: "Surface finish, texture and color under good light.",
        required: true,
        framing:
          "macro close-up of the material and surface texture, soft raking light",
      },
      {
        id: "detail",
        label: "Distinctive details",
        hint: "Marks, hardware and construction that make it this one.",
        required: true,
        framing:
          "close-up of the most distinctive detail and construction, plain background, soft studio light",
      },
      {
        id: "in-use",
        label: "In use",
        hint: "Scale against a person or its surroundings.",
        required: false,
        framing: "shown in use in a simple natural setting for scale",
      },
    ],
  },
};

export const elementTypeOrder: ElementType[] = [
  "character",
  "location",
  "thing",
];

/** `Red coat` → `RedCoat`; keeps letters, digits, `-` and `_`. */
export function toHandle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("")
    .slice(0, 40);
}

/** `Rain soaked` → `rain-soaked`. */
export function toStateHandle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join("-")
    .slice(0, 40);
}

export function referenceImageUrl(
  reference: ElementReference,
  outputs: ReadonlyMap<string, string>,
): string | null {
  return reference.source.kind === "upload"
    ? reference.source.url
    : (outputs.get(reference.source.jobId) ?? null);
}

export interface SheetReview {
  slots: {
    slot: GuidanceSlot;
    approved: ElementReference[];
    exploring: number;
  }[];
  missingRequired: GuidanceSlot[];
  warnings: string[];
  approvedCount: number;
  /** Required slots covered by at least one approved reference. */
  coverage: { done: number; total: number };
}

/** Guidance for one reference sheet: the identity sheet or one state's sheet. */
export function reviewSheet(
  element: CreativeElement,
  stateId: string | null,
): SheetReview {
  const info = elementTypes[element.type];
  const references = element.references.filter((r) => r.stateId === stateId);
  const approved = references.filter((r) => r.status === "approved");
  const slots = info.slots.map((slot) => ({
    slot,
    approved: approved.filter((r) => r.view === slot.id),
    exploring: references.filter(
      (r) => r.status === "exploration" && r.view === slot.id,
    ).length,
  }));
  const warnings: string[] = [];
  const required = slots.filter((s) => s.slot.required);
  const missingRequired = required
    .filter((s) => s.approved.length === 0)
    .map((s) => s.slot);
  if (stateId === null) {
    for (const s of slots)
      if (s.approved.length > 2)
        warnings.push(
          `${s.approved.length} approved ${s.slot.label.toLowerCase()} references may disagree. Keep the clearest two so later generations do not drift.`,
        );
  }
  const untagged = approved.filter((r) => r.view === null).length;
  if (untagged)
    warnings.push(
      `${untagged} approved ${untagged === 1 ? "reference does" : "references do"} not say what ${untagged === 1 ? "it shows" : "they show"}. Tag the view so it is used for the right shots.`,
    );
  return {
    slots,
    missingRequired: stateId === null ? missingRequired : [],
    warnings,
    approvedCount: approved.length,
    coverage: {
      done: required.length - missingRequired.length,
      total: required.length,
    },
  };
}

/** Prompt for a complementary reference view of the Element or one of its states. */
export function viewPrompt(
  element: CreativeElement,
  slot: GuidanceSlot,
  state: ElementState | null,
): string {
  const subject =
    element.description.trim() ||
    `${elementTypes[element.type].label} ${element.name}`;
  const stateText = state ? ` ${state.description.trim() || state.name}.` : "";
  return `${subject}.${stateText} ${slot.framing}. Reference sheet image, consistent identity, photorealistic.`
    .replace(/\.\./g, ".")
    .slice(0, 2000);
}
