import { z } from "zod";
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
  "establishing",
  "alternate-angle",
  "landmark",
  // Things
  "side",
  "top",
  "detail",
]);
export type ReferenceView = z.infer<typeof referenceViewSchema>;

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
  location: ["establishing", "alternate-angle", "landmark", "detail"],
  thing: ["front", "side", "rear", "top", "three-quarter", "detail"],
} as const satisfies Record<ElementType, readonly ReferenceView[]>;

/** Views a reference sheet should cover before it reads as complete. */
export const RECOMMENDED_VIEWS_BY_TYPE = {
  character: ["face-closeup", "smile", "sheet"],
  location: ["establishing", "alternate-angle"],
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

export const elementStateSchema = z.object({
  id: z.string(),
  elementId: z.string(),
  name: z.string(),
  description: z.string().default(""),
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

/** A mention carries identity and references, not just a name in the prompt. */
export const elementMentionSchema = z.object({
  elementId: z.string().min(1),
  stateId: z.string().min(1).optional(),
});
export type ElementMention = z.infer<typeof elementMentionSchema>;

export const MENTION_PATTERN = /@([A-Za-z][A-Za-z0-9_]{0,39})/g;

export function parseMentionHandles(prompt: string): string[] {
  return [...new Set([...prompt.matchAll(MENTION_PATTERN)].map((m) => m[1]!))];
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
});
export type CreateElementStateInput = z.infer<
  typeof createElementStateInputSchema
>;

/**
 * Approved references for a mention: the selected state's, then the base
 * sheet's. A state is its own asset, so where it has approved a view (its
 * own sheet, its own close portrait) the base reference for that view is left
 * out: wet Cal does not also bring dry Cal's jacket.
 */
export function approvedReferences(
  element: Pick<Element, "references">,
  stateId?: string,
): ElementReference[] {
  const approved = element.references.filter(
    (ref) => ref.status === "approved",
  );
  const own = stateId ? approved.filter((ref) => ref.stateId === stateId) : [];
  const overridden = new Set(
    own.flatMap((ref) => (ref.view ? [ref.view] : [])),
  );
  const base = approved.filter(
    (ref) => ref.stateId === null && !(ref.view && overridden.has(ref.view)),
  );
  const bySortOrder = (a: ElementReference, b: ElementReference) =>
    a.sortOrder - b.sortOrder;
  return [...own.sort(bySortOrder), ...base.sort(bySortOrder)];
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
