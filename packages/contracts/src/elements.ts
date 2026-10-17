import { z } from "zod";
import type { CameraMove } from "./camera";
import { assetRefSchema } from "./media";

export const elementTypeSchema = z.enum(["character", "location", "thing"]);
export type ElementType = z.infer<typeof elementTypeSchema>;

/** Approval is deliberate: only `approved` references condition future generations. */
export const referenceStatusSchema = z.enum([
  "approved",
  "experiment",
  "rejected",
]);
export type ReferenceStatus = z.infer<typeof referenceStatusSchema>;

/** The view a reference shows, per GOALS.md section 3. */
export const referenceViewSchema = z.enum([
  // Characters
  /** Three panels: headless front and back full body, large 3/4 portrait. */
  "sheet",
  /** The 3/4 close portrait with a smile, so teeth are never invented. */
  "smile",
  "front",
  "profile",
  "rear",
  "three-quarter",
  "face-closeup",
  "expression",
  "full-body",
  // Locations
  /** Moving references: short empty-location clips, see `LOCATION_MOVES`. */
  "push-in",
  "drift",
  "rise",
  "establishing",
  "alternate-angle",
  "landmark",
  // Things
  "side",
  "top",
  "detail",
]);
export type ReferenceView = z.infer<typeof referenceViewSchema>;

/**
 * A Location's moving references: a few seconds of the empty place with the
 * camera travelling through it. A still shows one face of a room; a move
 * shows how its walls, openings and depth sit around the camera, so a later
 * shot that moves keeps the same architecture. Each view is one move.
 */
export const LOCATION_MOVES = {
  "push-in": {
    move: "dolly-in",
    label: "Push in",
    prompt:
      "The camera glides slowly forward into the space at walking height, revealing depth and what lies ahead.",
  },
  drift: {
    move: "truck-right",
    label: "Lateral drift",
    prompt:
      "The camera drifts slowly sideways to the right at eye level, so nearer features slide past farther ones.",
  },
  rise: {
    move: "crane-up",
    label: "Rise",
    prompt:
      "The camera rises slowly and steadily, revealing the layout of the place from above.",
  },
} as const satisfies Record<
  string,
  { move: CameraMove; label: string; prompt: string }
>;
export type MovingView = keyof typeof LOCATION_MOVES;

export function isMovingView(
  view: ReferenceView | null | undefined,
): view is MovingView {
  return !!view && view in LOCATION_MOVES;
}

export const REFERENCE_VIEWS_BY_TYPE = {
  character: [
    "sheet",
    "face-closeup",
    "smile",
    "front",
    "profile",
    "rear",
    "three-quarter",
    "expression",
    "full-body",
  ],
  location: [
    "push-in",
    "drift",
    "rise",
    "establishing",
    "alternate-angle",
    "landmark",
    "detail",
  ],
  thing: ["front", "side", "rear", "top", "three-quarter", "detail"],
} as const satisfies Record<ElementType, readonly ReferenceView[]>;

/** Views a reference sheet should cover before it reads as complete. */
export const RECOMMENDED_VIEWS_BY_TYPE = {
  character: ["face-closeup", "smile", "sheet"],
  location: ["push-in", "establishing"],
  thing: ["front", "side", "three-quarter", "detail"],
} as const satisfies Record<ElementType, readonly ReferenceView[]>;

/** What a reference contributes when it conditions a generation. */
export const referenceRoleSchema = z.enum([
  "identity",
  "appearance",
  "wardrobe",
  "pose",
  "material",
  "layout",
  "lighting",
  "style",
]);
export type ReferenceRole = z.infer<typeof referenceRoleSchema>;

export const elementReferenceSchema = z.object({
  id: z.string(),
  elementId: z.string(),
  /** Null for the Element's base identity; set when it belongs to a state. */
  stateId: z.string().nullable().default(null),
  asset: assetRefSchema,
  status: referenceStatusSchema,
  view: referenceViewSchema.nullable().default(null),
  roles: z.array(referenceRoleSchema).default([]),
  note: z.string().default(""),
  sortOrder: z.number().int().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ElementReference = z.infer<typeof elementReferenceSchema>;

/**
 * What a state changes. One state per kind can combine in a mention, so wet
 * and frightened Cal is `@Cal:wet+frightened`, but wet and dry is a conflict.
 */
export const stateKindSchema = z.enum([
  "emotion",
  "wardrobe",
  "condition",
  "weather",
  "time",
  "season",
  "era",
  "use",
  "other",
]);
export type StateKind = z.infer<typeof stateKindSchema>;

export const STATE_KIND_LABELS: Record<StateKind, string> = {
  emotion: "Emotion",
  wardrobe: "Wardrobe",
  condition: "Condition",
  weather: "Weather",
  time: "Time of day",
  season: "Season",
  era: "Era",
  use: "In use",
  other: "Other",
};

/** Kinds offered first for each Element type, with an example of each. */
export const STATE_KINDS_BY_TYPE = {
  character: [
    { kind: "emotion", example: "Frightened" },
    { kind: "wardrobe", example: "Winter coat" },
    { kind: "condition", example: "Wet, injured" },
    { kind: "era", example: "Aged 70" },
  ],
  location: [
    { kind: "weather", example: "Heavy rain" },
    { kind: "time", example: "Night" },
    { kind: "season", example: "Deep winter" },
    { kind: "era", example: "1920s" },
    { kind: "condition", example: "Abandoned" },
  ],
  thing: [
    { kind: "condition", example: "Broken, rusted" },
    { kind: "use", example: "Lit, switched on" },
    { kind: "era", example: "Brand new in 1960" },
  ],
} as const satisfies Record<
  ElementType,
  readonly { kind: StateKind; example: string }[]
>;

/** The highest number of states one mention may combine. */
export const MAX_COMBINED_STATES = 3;

export const elementStateSchema = z.object({
  id: z.string(),
  elementId: z.string(),
  name: z.string(),
  description: z.string().default(""),
  kind: stateKindSchema.default("other"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ElementState = z.infer<typeof elementStateSchema>;

export const elementSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  projectId: z.string().nullable().default(null),
  type: elementTypeSchema,
  name: z.string(),
  /** The `@` mention token, unique per owner. */
  handle: z.string(),
  /** Identity: what makes this Element recognizable. */
  description: z.string().default(""),
  /** Increments whenever identity or approved references change. */
  version: z.number().int().positive(),
  references: z.array(elementReferenceSchema).default([]),
  states: z.array(elementStateSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Element = z.infer<typeof elementSchema>;

/** Handles are ASCII words so `@Mara` and `@RedCoat` parse unambiguously in prompts. */
export const elementHandleSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);

export function toElementHandle(name: string): string {
  const words = name
    .normalize("NFKD")
    // "Keeper's Cottage" is @KeepersCottage, not @KeeperSCottage.
    .replace(/['\u2019]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1));
  const handle = words.join("").replace(/^[0-9]+/, "");
  return (handle || "Element").slice(0, 40);
}

/**
 * States combined in one mention, or the reason they cannot combine: an
 * unknown state, two of the same kind, or more than the limit.
 */
export function combineStates(
  element: Pick<Element, "name" | "states">,
  stateIds: readonly string[],
): { states: ElementState[]; problem: string | null } {
  const states: ElementState[] = [];
  for (const id of stateIds) {
    const state = element.states.find((s) => s.id === id);
    if (!state)
      return { states, problem: `${element.name} no longer has that state.` };
    if (states.some((s) => s.id === id)) continue;
    const clash = states.find(
      (s) => s.kind !== "other" && s.kind === state.kind,
    );
    if (clash)
      return {
        states,
        problem: `${clash.name} and ${state.name} are both ${STATE_KIND_LABELS[state.kind].toLowerCase()} states of ${element.name}; choose one.`,
      };
    states.push(state);
  }
  if (states.length > MAX_COMBINED_STATES)
    return {
      states,
      problem: `Combine at most ${MAX_COMBINED_STATES} states of ${element.name}.`,
    };
  return { states, problem: null };
}

/** Every state a mention selects, primary first. */
export function mentionStateIds(mention: {
  stateId?: string | undefined;
  stateIds?: readonly string[] | undefined;
}): string[] {
  return [
    ...(mention.stateId ? [mention.stateId] : []),
    ...(mention.stateIds ?? []),
  ];
}

/** A mention carries identity and references, not just a name in the prompt. */
export const elementMentionSchema = z.object({
  elementId: z.string().min(1),
  stateId: z.string().min(1).optional(),
  /** Further states combined with `stateId`, one per kind. */
  stateIds: z
    .array(z.string().min(1))
    .max(MAX_COMBINED_STATES - 1)
    .optional(),
});
export type ElementMention = z.infer<typeof elementMentionSchema>;

/**
 * `@Handle`, `@Handle:state` or `@Handle:state+state`, where the `@` starts a
 * word: "ana@Mara" is an address, not a mention. Element handles are ASCII;
 * state handles keep any letter, as `toStateHandle` makes them.
 */
const MENTION_TOKEN =
  /(?<![\p{L}\p{N}_@])@([A-Za-z][A-Za-z0-9_]{0,39})(?::([\p{L}\p{N}-]+(?:\+[\p{L}\p{N}-]+)*))?/gu;

export interface MentionToken {
  /** Offset of the `@`. */
  start: number;
  end: number;
  raw: string;
  handle: string;
  /** Every state named after the `:`, in order. */
  stateHandles: string[];
}

/** Every mention token in `text`, in order. */
export function mentionTokens(text: string): MentionToken[] {
  return [...text.matchAll(MENTION_TOKEN)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    raw: match[0],
    handle: match[1]!,
    stateHandles: match[2] ? match[2].split("+") : [],
  }));
}

/** Rewrites each mention token; returning `token.raw` leaves it as written. */
export function replaceMentions(
  text: string,
  replace: (token: MentionToken) => string,
): string {
  let out = "";
  let at = 0;
  for (const token of mentionTokens(text)) {
    out += text.slice(at, token.start) + replace(token);
    at = token.end;
  }
  return out + text.slice(at);
}

export function parseMentionHandles(prompt: string): string[] {
  return [...new Set(mentionTokens(prompt).map((t) => t.handle))];
}

/** `Rain soaked` → `rain-soaked`: how a state is written after `@Handle:`. */
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

export const createElementInputSchema = z.object({
  type: elementTypeSchema,
  name: z.string().trim().min(1).max(80),
  handle: elementHandleSchema.optional(),
  description: z.string().trim().max(4000).optional(),
  projectId: z.string().min(1).optional(),
});
export type CreateElementInput = z.infer<typeof createElementInputSchema>;

export const updateElementInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  handle: elementHandleSchema.optional(),
  description: z.string().trim().max(4000).optional(),
});
export type UpdateElementInput = z.infer<typeof updateElementInputSchema>;

export const addElementReferenceInputSchema = z.object({
  elementId: z.string().min(1),
  stateId: z.string().min(1).optional(),
  asset: assetRefSchema,
  status: referenceStatusSchema.default("experiment"),
  view: referenceViewSchema.optional(),
  roles: z.array(referenceRoleSchema).max(8).optional(),
  note: z.string().trim().max(500).optional(),
});
export type AddElementReferenceInput = z.input<
  typeof addElementReferenceInputSchema
>;

export const updateElementReferenceInputSchema = z.object({
  id: z.string().min(1),
  status: referenceStatusSchema.optional(),
  view: referenceViewSchema.nullable().optional(),
  roles: z.array(referenceRoleSchema).max(8).optional(),
  note: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateElementReferenceInput = z.infer<
  typeof updateElementReferenceInputSchema
>;

export const createElementStateInputSchema = z.object({
  elementId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional(),
  kind: stateKindSchema.optional(),
});
export type CreateElementStateInput = z.infer<
  typeof createElementStateInputSchema
>;

export const updateElementStateInputSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().max(2000).optional(),
  kind: stateKindSchema.optional(),
});
export type UpdateElementStateInput = z.infer<
  typeof updateElementStateInputSchema
>;

/**
 * Approved still references for a mention: the selected state's, then the base
 * sheet's. A state is its own asset, so where it has approved a view (its
 * own sheet, its own close portrait) the base reference for that view is left
 * out: wet Cal does not also bring dry Cal's jacket.
 */
export function approvedReferences(
  element: Pick<Element, "references">,
  stateId?: string | readonly string[],
): ElementReference[] {
  return approvedOf(element, stateId, false);
}

/**
 * Approved moving references (videos), with the same state rules. They are
 * kept apart from `approvedReferences` because most models only take images.
 */
export function approvedMotionReferences(
  element: Pick<Element, "references">,
  stateId?: string | readonly string[],
): ElementReference[] {
  return approvedOf(element, stateId, true);
}

function approvedOf(
  element: Pick<Element, "references">,
  stateId: string | readonly string[] | undefined,
  moving: boolean,
): ElementReference[] {
  const approved = element.references.filter(
    (ref) => ref.status === "approved" && isMovingView(ref.view) === moving,
  );
  const stateIds =
    stateId === undefined
      ? []
      : typeof stateId === "string"
        ? [stateId]
        : stateId;
  // With combined states the first one that shows a view wins it: a wardrobe
  // state's sheet over a mood's, in the order the creator wrote them.
  const own: ElementReference[] = [];
  const overridden = new Set<string>();
  for (const id of stateIds) {
    const refs = approved
      .filter((ref) => ref.stateId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const claimed: string[] = [];
    for (const ref of refs) {
      if (ref.view && overridden.has(ref.view)) continue;
      own.push(ref);
      if (ref.view) claimed.push(ref.view);
    }
    for (const view of claimed) overridden.add(view);
  }
  const base = approved.filter(
    (ref) => ref.stateId === null && !(ref.view && overridden.has(ref.view)),
  );
  const bySortOrder = (a: ElementReference, b: ElementReference) =>
    a.sortOrder - b.sortOrder;
  return [...own, ...base.sort(bySortOrder)];
}

export function missingViews(
  element: Pick<Element, "type" | "references">,
): ReferenceView[] {
  const covered = new Set(
    element.references
      .filter((ref) => ref.status === "approved" && ref.stateId === null)
      .map((ref) => ref.view),
  );
  return RECOMMENDED_VIEWS_BY_TYPE[element.type].filter(
    (view) => !covered.has(view),
  );
}
