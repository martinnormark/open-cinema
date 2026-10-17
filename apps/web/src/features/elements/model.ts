/** Element authoring vocabulary on top of the shared contracts: per-type
 * guidance, sheet review and prompts for complementary views. */
import type {
  AssetRef,
  Element,
  ElementReference,
  ElementState,
  ElementType,
  GenerationRequest,
  ReferenceView,
} from "@open-cinema/contracts";
import {
  approvedMotionReferences,
  approvedReferences,
  generationRequestSchema,
  isMovingView,
  LOCATION_MOVES,
  toStateHandle,
  type MovingView,
} from "@open-cinema/contracts";
import type {
  ImageAspectRatio,
  ImageResolution,
  StateKind,
} from "@open-cinema/contracts";
import { characterShotPrompt, type CharacterShot } from "./sheet-prompt";

export type {
  Element,
  ElementReference,
  ElementState,
  ElementType,
  ReferenceView,
} from "@open-cinema/contracts";
export {
  isMovingView,
  toElementHandle as toHandle,
  toStateHandle,
} from "@open-cinema/contracts";

export interface GuidanceSlot {
  id: ReferenceView;
  label: string;
  /** What the creator is establishing with this view. */
  hint: string;
  required: boolean;
  /** Framing appended to the identity description for complementary views. */
  framing: string;
  /** Character views follow the sheet rules in sheet-prompt.ts instead. */
  shot?: CharacterShot;
  /** A Location's moving reference: a short clip of the empty place. */
  move?: MovingView;
  /** Approved views that guide this one; all approved views when unset. */
  guidedBy?: readonly ReferenceView[];
  aspectRatio?: ImageAspectRatio;
  resolution?: ImageResolution;
}

export interface ElementTypeInfo {
  type: ElementType;
  label: string;
  plural: string;
  establishes: string;
  placeholderName: string;
  placeholderThought: string;
  /** Suggested states, each with the kind of change it is. */
  stateExamples: { name: string; kind: StateKind }[];
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
    stateExamples: [
      { name: "Wet", kind: "condition" },
      { name: "Injured", kind: "condition" },
      { name: "Frightened", kind: "emotion" },
      { name: "Joyful", kind: "emotion" },
      { name: "Formal wear", kind: "wardrobe" },
      { name: "Disguised", kind: "wardrobe" },
      { name: "Aged 70", kind: "era" },
    ],
    slots: [
      {
        id: "face-closeup",
        label: "Close portrait",
        hint: "The face every shot copies: three-quarter view, large and sharp, mouth closed. Make it first.",
        required: true,
        framing: "",
        shot: "portrait",
        guidedBy: ["face-closeup"],
        aspectRatio: "3:4",
      },
      {
        id: "smile",
        label: "Smiling close-up",
        hint: "The same face smiling, so a laugh never arrives with somebody else's teeth.",
        required: true,
        framing: "",
        shot: "smile",
        guidedBy: ["face-closeup"],
        aspectRatio: "3:4",
      },
      {
        id: "sheet",
        label: "Character sheet",
        hint: "Front and back full body beside a large portrait. The bodies lose their heads, so the face only comes from the portrait.",
        required: true,
        framing: "",
        shot: "sheet",
        guidedBy: ["face-closeup", "sheet"],
        aspectRatio: "21:9",
        resolution: "1.5k",
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
    stateExamples: [
      { name: "Dawn", kind: "time" },
      { name: "Night", kind: "time" },
      { name: "Storm", kind: "weather" },
      { name: "Fog", kind: "weather" },
      { name: "Deep winter", kind: "season" },
      { name: "Abandoned", kind: "condition" },
      { name: "1920s", kind: "era" },
    ],
    slots: [
      {
        id: "push-in",
        label: "Moving reference",
        hint: "A few seconds of the empty place with the camera pushing in. It shows the space around the camera, so shots that move keep the same architecture. Make it first.",
        required: true,
        framing: "",
        move: "push-in",
      },
      {
        id: "drift",
        label: "Lateral drift",
        hint: "The camera slides sideways, so near and far features separate and the depth reads.",
        required: false,
        framing: "",
        move: "drift",
      },
      {
        id: "rise",
        label: "Rising view",
        hint: "The camera rises, showing how the place is laid out.",
        required: false,
        framing: "",
        move: "rise",
      },
      {
        id: "establishing",
        label: "Establishing view",
        hint: "The overall layout and scale of the place, as one still.",
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
        hint: "The same place from the other side, for reverse angles.",
        required: false,
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
    stateExamples: [
      { name: "Doors open", kind: "use" },
      { name: "Lit", kind: "use" },
      { name: "Worn", kind: "condition" },
      { name: "Damaged", kind: "condition" },
      { name: "Brand new", kind: "era" },
    ],
    slots: [
      {
        id: "three-quarter",
        label: "Hero view",
        hint: "The overall shape and proportions in one clear image.",
        required: true,
        framing:
          "product photograph, front three-quarter view, isolated on a plain light grey background, soft even light, no studio, no equipment",
      },
      {
        id: "front",
        label: "Front",
        hint: "The face it shows the camera, square on.",
        required: true,
        framing:
          "product photograph, straight-on front view, isolated on a plain light grey background, soft even light, no studio, no equipment",
      },
      {
        id: "side",
        label: "Side",
        hint: "The silhouette and depth from the side.",
        required: true,
        framing:
          "product photograph, side view, isolated on a plain light grey background, soft even light, no studio, no equipment",
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
          "product photograph, rear view, isolated on a plain light grey background, soft even light, no studio, no equipment",
      },
      {
        id: "top",
        label: "Top",
        hint: "Its footprint seen from above.",
        required: false,
        framing:
          "product photograph, top-down view from directly above, plain light grey background, soft even light, no studio, no equipment",
      },
    ],
  },
};

export const elementTypeOrder: ElementType[] = [
  "character",
  "location",
  "thing",
];

export { assetUrl } from "@/lib/media-url";

export function stateHandle(state: Pick<ElementState, "name">): string {
  return toStateHandle(state.name);
}

/** Labels for views earlier sheets were tagged with. */
const legacyViewLabels: Partial<Record<ReferenceView, string>> = {
  front: "Front, full body",
  rear: "Rear view",
  profile: "Profile",
  "three-quarter": "Three-quarter view",
  expression: "Expression",
  "full-body": "Full body",
};

export function viewLabel(
  type: ElementType,
  view: ReferenceView | null,
): string {
  return (
    elementTypes[type].slots.find((s) => s.id === view)?.label ??
    (view && legacyViewLabels[view]) ??
    "Untagged reference"
  );
}

export interface StateSheet {
  /** Null for the Character's base look. */
  state: ElementState | null;
  sheet: ElementReference | null;
  portrait: ElementReference | null;
  smile: ElementReference | null;
}

/**
 * One row per look a Character has in the film, base first: the approved
 * sheet and the two close portraits that belong to it.
 */
export function stateSheets(element: Element): StateSheet[] {
  const pick = (stateId: string | null, view: ReferenceView) =>
    element.references
      .filter(
        (r) =>
          r.status === "approved" && r.stateId === stateId && r.view === view,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
  return [null, ...element.states].map((state) => {
    const id = state?.id ?? null;
    return {
      state,
      sheet: pick(id, "sheet"),
      portrait: pick(id, "face-closeup"),
      smile: pick(id, "smile"),
    };
  });
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
  if (element.type === "location") {
    const stills = approved.filter((r) => !isMovingView(r.view)).length;
    const moving = approved.length - stills;
    const ownSheet = stateId === null;
    if (stills > 0 && moving === 0 && (ownSheet || !hasBaseMove(element)))
      warnings.push(
        `Only still ${stills === 1 ? "frame" : "frames"} so far. A still shows one face of the place, so a shot whose camera moves has to invent the rest. Add a moving reference.`,
      );
  }
  const untagged = approved.filter((r) => r.view === null).length;
  if (untagged)
    warnings.push(
      `${untagged} approved ${untagged === 1 ? "reference does" : "references do"} not say what ${untagged === 1 ? "it shows" : "they show"}. Tag the view so it is used for the right shots.`,
    );
  // A Character's states are full sheets of their own; other types' states
  // only add the views where the change shows.
  const ownSheet = stateId === null || element.type === "character";
  return {
    slots,
    missingRequired: ownSheet ? missingRequired : [],
    warnings,
    approvedCount: approved.length,
    coverage: {
      done: required.length - missingRequired.length,
      total: required.length,
    },
  };
}

function hasBaseMove(element: Element) {
  return approvedMotionReferences(element).length > 0;
}

/** Prompt for a complementary reference view of the Element or one of its states. */
export function viewPrompt(
  element: Element,
  slot: GuidanceSlot,
  state: ElementState | null,
  guided = false,
): string {
  if (slot.shot)
    return characterShotPrompt(slot.shot, {
      identity: element.description.trim() || `A person called ${element.name}`,
      state,
      guided,
    });
  const subject =
    element.description.trim() ||
    `${elementTypes[element.type].label} ${element.name}`;
  const stateText = state ? ` ${state.description.trim() || state.name}.` : "";
  if (slot.move)
    return locationMovePrompt(subject, stateText, slot.move, guided);
  return `${subject}.${stateText} ${slot.framing}. Reference sheet image, consistent identity, photorealistic.`
    .replace(/\.\./g, ".")
    .slice(0, 2000);
}

/**
 * An empty-location clip. Nobody is in it, so the reference carries only the
 * place; the move is said plainly, without lens or camera-gear words, which
 * LTX draws as a frame artefact (see LTX_FRAME_ARTEFACT).
 */
export function locationMovePrompt(
  subject: string,
  stateText: string,
  move: MovingView,
  fromStill: boolean,
): string {
  const opening = fromStill
    ? "The same place as the image, continuing from it."
    : "";
  return `${opening} ${subject}.${stateText} The place is completely empty: no people, no animals, nothing moving except light, weather and foliage. ${LOCATION_MOVES[move].prompt} One continuous, steady take with realistic scale and consistent architecture.`
    .replace(/\.\./g, ".")
    .trim()
    .slice(0, 2000);
}

const viewHints: [RegExp, ReferenceView][] = [
  [/push|dolly|walk-?in|forward/, "push-in"],
  [/drift|slide|lateral|truck|pan/, "drift"],
  [/rise|crane|jib|aerial|drone/, "rise"],
  [/sheet|turnaround|model-?sheet/, "sheet"],
  [/smil|laugh|grin/, "smile"],
  [/face|close-?up|portrait|headshot/, "face-closeup"],
  [/expression|angry|sad|cry/, "expression"],
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
  kind: "image" | "video" = "image",
): ReferenceView | null {
  const name = fileName.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const slots = elementTypes[type].slots.filter(
    (s) => !!s.move === (kind === "video"),
  );
  const allowed = new Set(slots.map((s) => s.id));
  for (const [pattern, view] of viewHints)
    if (pattern.test(name) && allowed.has(view)) return view;
  // A clip of a place is a moving reference even when its name says nothing.
  return kind === "video" ? (slots[0]?.id ?? null) : null;
}

/** Views that show the clothing; a state never borrows them from the base. */
const WARDROBE_VIEWS: ReadonlySet<ReferenceView | null> = new Set([
  "sheet",
  "front",
  "rear",
  "full-body",
  "three-quarter",
]);

/**
 * Approved references that guide a new view; a state's own views lead. A
 * state's sheet is guided by the face, never by the base outfit, which would
 * otherwise come back in place of the state's.
 */
export function conditioningReferences(
  element: Element,
  state: ElementState | null,
  limit = 6,
  slot?: GuidanceSlot,
): AssetRef[] {
  return approvedReferences(element, state?.id)
    .filter(
      (r) =>
        (!slot?.guidedBy || (r.view && slot.guidedBy.includes(r.view))) &&
        !(
          slot?.shot &&
          state &&
          r.stateId === null &&
          WARDROBE_VIEWS.has(r.view)
        ),
    )
    .slice(0, limit)
    .map((r) => r.asset);
}

/**
 * A new view is conditioned on the approved sheet, so it keeps the same face,
 * place or object. Without approved references it starts from the description.
 */
export function viewRequest(
  element: Element,
  slot: GuidanceSlot,
  state: ElementState | null,
): GenerationRequest {
  if (slot.move) return moveRequest(element, slot, state);
  const references = conditioningReferences(element, state, 6, slot);
  const guided = references.length > 0;
  const prompt = viewPrompt(element, slot, state, guided);
  const size = {
    aspectRatio: slot.aspectRatio ?? "1:1",
    resolution: slot.resolution ?? "1k",
  };
  return guided
    ? generationRequestSchema.parse({
        workflowKind: "image.flux-reference",
        inputs: {
          prompt: slot.shot
            ? prompt
            : `Same ${elementTypes[element.type].label.toLowerCase()} as the reference images. ${prompt}`.slice(
                0,
                2000,
              ),
          ...size,
          references,
        },
      })
    : generationRequestSchema.parse({
        workflowKind: "image.flux",
        inputs: { prompt, ...size },
      });
}

/** Stills that can open a moving reference: the establishing view first. */
const OPENING_VIEWS: readonly ReferenceView[] = [
  "establishing",
  "alternate-angle",
  "landmark",
];

/**
 * A moving reference is a 5 s, 720p clip with no sound, long and large enough
 * for a reference video. With an approved still of the place it continues
 * from that still (FLUX 3 Video, since Router's LTX reads text only);
 * otherwise LTX 2.5 makes it from the description.
 */
function moveRequest(
  element: Element,
  slot: GuidanceSlot,
  state: ElementState | null,
): GenerationRequest {
  const stills = approvedReferences(element, state?.id);
  const opening = OPENING_VIEWS.map((view) =>
    stills.find((r) => r.view === view),
  ).find(Boolean);
  return generationRequestSchema.parse({
    workflowKind: "video.ltx",
    inputs: {
      prompt: viewPrompt(element, slot, state, !!opening),
      durationSeconds: 5,
      resolution: "1280x720",
      fps: 24,
      generateAudio: false,
      quality: "fast",
      ...(opening ? { firstFrame: opening.asset } : {}),
    },
  });
}
