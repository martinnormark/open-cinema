/** Element authoring vocabulary on top of the shared contracts: per-type
 * guidance, sheet review and prompts for complementary views. */
import type {
  AssetRef,
  Element,
  ElementReference,
  ElementState,
  ElementType,
  ReferenceView,
} from "@open-cinema/contracts";

export type {
  Element,
  ElementReference,
  ElementState,
  ElementType,
  ReferenceView,
} from "@open-cinema/contracts";
export { toElementHandle as toHandle } from "@open-cinema/contracts";

export interface GuidanceSlot {
  id: ReferenceView;
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
        id: "face-closeup",
        label: "Face close-up",
        hint: "Facial structure, eyes, skin and distinguishing marks in detail.",
        required: true,
        framing:
          "tight close-up portrait, neutral expression, looking at camera, soft even studio light, plain light gray background, sharp facial detail",
      },
      {
        id: "front",
        label: "Front, full body",
        hint: "Height, proportions, posture and the complete outfit.",
        required: true,
        framing:
          "full body shot from head to toe, facing the camera, standing in a relaxed neutral pose, plain light gray background, even studio light",
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
        required: true,
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
        id: "detail",
        label: "Atmosphere and materials",
        hint: "Surfaces, textures, light and mood up close.",
        required: true,
        framing:
          "close detail of surfaces and materials, natural light, rich texture",
      },
      {
        id: "alternate-angle",
        label: "Alternate viewpoint",
        hint: "The same place from another side, so a camera can move.",
        required: true,
        framing:
          "wide view of the same place from the opposite side, reverse angle, eye level, clear daylight",
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
        id: "three-quarter",
        label: "Hero view",
        hint: "The overall shape and proportions in one clear image.",
        required: true,
        framing:
          "product photograph, front three-quarter view, isolated on a plain light gray background, soft studio light",
      },
      {
        id: "front",
        label: "Front",
        hint: "The face it shows the camera, square on.",
        required: true,
        framing:
          "product photograph, straight-on front view, isolated on a plain light gray background, soft studio light",
      },
      {
        id: "side",
        label: "Side",
        hint: "The silhouette and depth from the side.",
        required: true,
        framing:
          "product photograph, side view, isolated on a plain light gray background, soft studio light",
      },
      {
        id: "detail",
        label: "Materials and details",
        hint: "Surface finish, marks, hardware and construction up close.",
        required: true,
        framing:
          "macro close-up of the materials, surface texture and most distinctive details, soft raking light",
      },
      {
        id: "rear",
        label: "Back",
        hint: "What the camera sees from behind.",
        required: false,
        framing:
          "product photograph, rear view, isolated on a plain light gray background, soft studio light",
      },
      {
        id: "top",
        label: "Top",
        hint: "Its footprint seen from above.",
        required: false,
        framing:
          "product photograph, top-down view from directly above, plain light gray background, soft studio light",
      },
    ],
  },
};

export const elementTypeOrder: ElementType[] = [
  "character",
  "location",
  "thing",
];

/** `Rain soaked` → `rain-soaked`. */
export function toStateHandle(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join("-")
    .slice(0, 40);
}

/** Where the browser loads an owned image; providers get signed URLs server-side. */
export function assetUrl(asset: AssetRef): string {
  return asset.type === "media-asset"
    ? `/api/media/${encodeURIComponent(asset.assetId)}`
    : `/api/jobs/output?job=${encodeURIComponent(asset.jobId)}&output=${encodeURIComponent(asset.outputId)}`;
}

export function stateHandle(state: Pick<ElementState, "name">): string {
  return toStateHandle(state.name);
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
  element: Element,
  stateId: string | null,
): SheetReview {
  const info = elementTypes[element.type];
  const references = element.references.filter((r) => r.stateId === stateId);
  const approved = references.filter((r) => r.status === "approved");
  const slots = info.slots.map((slot) => ({
    slot,
    approved: approved.filter((r) => r.view === slot.id),
    exploring: references.filter(
      (r) => r.status === "experiment" && r.view === slot.id,
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
  element: Element,
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

const viewHints: [RegExp, ReferenceView][] = [
  [/face|close-?up|portrait|headshot/, "face-closeup"],
  [/expression|smil|laugh|angry|sad|cry/, "expression"],
  [/three-?quarter|3-?4|34|3q/, "three-quarter"],
  [/profile/, "profile"],
  [/back|rear|behind/, "rear"],
  [/establish|wide|overview/, "establishing"],
  [/landmark/, "landmark"],
  [/reverse|alternate|other-?side|angle/, "alternate-angle"],
  [/detail|material|texture|macro/, "detail"],
  [/side/, "side"],
  [/top|above/, "top"],
  [/front|full/, "front"],
];

/** Best guess at what an uploaded file shows from its name, e.g. `mara-profile.jpg`. */
export function guessView(
  type: ElementType,
  fileName: string,
): ReferenceView | null {
  const name = fileName.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const allowed = new Set(elementTypes[type].slots.map((s) => s.id));
  for (const [pattern, view] of viewHints)
    if (pattern.test(name) && allowed.has(view)) return view;
  return null;
}
