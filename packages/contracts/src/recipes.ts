import { z } from "zod";
import { capabilityIdSchema, type CapabilityId } from "./capabilities";
import { effectiveLook, lookSchema, shotDirectionSchema } from "./direction";
import { elementTypeSchema, type ElementType } from "./elements";
import { assetRefSchema } from "./media";
import {
  imageAspectRatioSchema,
  type GenerationRequest,
  type ResolvedMention,
} from "./workflows";

/**
 * A creative recipe keeps direction that worked so it can be applied to other
 * Elements: a prompt template whose `{slot}` placeholders take Characters,
 * Locations and Things, plus the look, shot choices and capabilities it needs.
 * Text in `[square brackets]` is left out when a slot inside it is empty.
 */

export const recipeSlotSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9]{0,19}$/),
  type: elementTypeSchema,
  label: z.string().trim().min(1).max(40),
  optional: z.boolean().default(false),
  /** What this slot is for, shown when choosing an Element. */
  hint: z.string().trim().max(160).default(""),
});
export type RecipeSlot = z.infer<typeof recipeSlotSchema>;

export const recipeSpecSchema = z.object({
  medium: z.enum(["image", "video"]),
  template: z.string().trim().min(3).max(1500),
  slots: z.array(recipeSlotSchema).max(4).default([]),
  look: lookSchema.default({}),
  shot: shotDirectionSchema.default({}),
  aspectRatio: imageAspectRatioSchema.default("16:9"),
  durationSeconds: z.literal([4, 5, 6, 8, 10]).default(6),
  capabilities: z.array(capabilityIdSchema).max(6).default([]),
  /** What to expect and where it struggles, in the creator's words. */
  notes: z.string().trim().max(1000).default(""),
});
export type RecipeSpec = z.infer<typeof recipeSpecSchema>;
export type RecipeSpecInput = z.input<typeof recipeSpecSchema>;

export const recipeVersionSchema = z.object({
  version: z.number().int().positive(),
  name: z.string(),
  spec: recipeSpecSchema,
  note: z.string().default(""),
  savedAt: z.string(),
});
export type RecipeVersion = z.infer<typeof recipeVersionSchema>;

export const recipeSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  summary: z.string().default(""),
  spec: recipeSpecSchema,
  version: z.number().int().positive(),
  /** The built-in or personal recipe this one was adapted from. */
  parentId: z.string().nullable().default(null),
  /** A result that shows the treatment. */
  cover: assetRefSchema.nullable().default(null),
  /** Earlier versions, newest first. */
  history: z.array(recipeVersionSchema).default([]),
  uses: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Recipe = z.infer<typeof recipeSchema>;

export const createRecipeInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  summary: z.string().trim().max(300).optional(),
  spec: recipeSpecSchema,
  parentId: z.string().min(1).max(80).optional(),
  cover: assetRefSchema.optional(),
});
export type CreateRecipeInput = z.input<typeof createRecipeInputSchema>;

export const updateRecipeInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  summary: z.string().trim().max(300).optional(),
  spec: recipeSpecSchema.optional(),
  cover: assetRefSchema.nullable().optional(),
  /** Why this version changed, kept in its history. */
  note: z.string().trim().max(300).optional(),
});
export type UpdateRecipeInput = z.input<typeof updateRecipeInputSchema>;

const PLACEHOLDER = /\{([a-z][a-z0-9]{0,19})\}/g;

/** Slot keys a template uses, in order of first appearance. */
export function templateSlotKeys(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

/** Problems that stop a spec from being saved. */
export function recipeSpecProblems(spec: RecipeSpecInput): string[] {
  const problems: string[] = [];
  const declared = new Set((spec.slots ?? []).map((s) => s.key));
  for (const key of templateSlotKeys(spec.template))
    if (!declared.has(key))
      problems.push(`The template uses {${key}}, which is not a slot.`);
  for (const slot of spec.slots ?? [])
    if (!templateSlotKeys(spec.template).includes(slot.key))
      problems.push(`The ${slot.label} slot is not used in the template.`);
  return problems;
}

/** A slot filled with an Element's mention token, e.g. `@Cal:wet+frightened`. */
export type RecipeBindings = Partial<Record<string, string>>;

/**
 * The prompt a recipe makes with these bindings. Optional groups in square
 * brackets drop out when a slot inside them is empty; required slots must be
 * bound by the caller (see `missingSlots`).
 */
export function renderRecipe(
  template: string,
  bindings: RecipeBindings,
): string {
  const fill = (text: string) =>
    text.replace(PLACEHOLDER, (token, key: string) => bindings[key] ?? token);
  const withGroups = template.replace(/\[([^\]]*)\]/g, (_, group: string) =>
    templateSlotKeys(group).every((key) => bindings[key]) ? group : "",
  );
  return fill(withGroups)
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function missingSlots(
  spec: Pick<RecipeSpec, "slots">,
  bindings: RecipeBindings,
) {
  return spec.slots.filter((slot) => !slot.optional && !bindings[slot.key]);
}

/** Slot keys for a generation turned into a recipe: `character`, `character2`, … */
export function slotKeyFor(type: ElementType, taken: readonly string[]) {
  let n = 1;
  while (taken.includes(n === 1 ? type : `${type}${n}`)) n++;
  return n === 1 ? type : `${type}${n}`;
}

const TYPE_LABELS: Record<ElementType, string> = {
  character: "Character",
  location: "Location",
  thing: "Thing",
};

/**
 * A recipe draft from a generation that worked: each mentioned Element becomes
 * a slot of its type, and the look it was made with (project look plus shot
 * overrides) becomes the recipe's own, so it travels to other projects.
 */
export function recipeFromGeneration(
  request: GenerationRequest,
  mentions: readonly Pick<
    ResolvedMention,
    "handle" | "name" | "type" | "references"
  >[],
): RecipeSpec | null {
  if (
    request.workflowKind !== "image.flux" &&
    request.workflowKind !== "image.flux-reference" &&
    request.workflowKind !== "video.ltx"
  )
    return null;
  const slots: RecipeSlot[] = [];
  const keys = new Map<string, string>();
  const template = request.inputs.prompt.replace(
    /@([A-Za-z][A-Za-z0-9_]{0,39})(?::[A-Za-z0-9-]+(?:\+[A-Za-z0-9-]+)*)?/g,
    (token, handle: string) => {
      const mention = mentions.find((m) => m.handle === handle);
      if (!mention) return token;
      let key = keys.get(handle);
      if (!key) {
        key = slotKeyFor(
          mention.type,
          slots.map((s) => s.key),
        );
        keys.set(handle, key);
        const n = slots.filter((s) => s.type === mention.type).length;
        slots.push({
          key,
          type: mention.type,
          label: `${TYPE_LABELS[mention.type]}${n ? ` ${n + 1}` : ""}`,
          optional: false,
          hint: `First made with ${mention.name}.`,
        });
      }
      return `{${key}}`;
    },
  );
  const direction = request.inputs.direction;
  const look = direction ? effectiveLook(direction) : {};
  const video = request.workflowKind === "video.ltx";
  const references =
    request.workflowKind === "image.flux-reference" ||
    (!video && mentions.some((m) => m.references.length));
  const capabilities: CapabilityId[] = video
    ? ["ltx-video"]
    : references
      ? ["flux-image", "flux-references"]
      : ["flux-image"];
  if (
    !video &&
    mentions.some((m) => m.references.some((r) => r.view === "sheet"))
  )
    capabilities.push("character-sheets");
  if (Object.values(look).some(Boolean)) capabilities.push("project-look");
  return recipeSpecSchema.parse({
    medium: video ? "video" : "image",
    template: template.slice(0, 1500),
    slots: slots.slice(0, 4),
    look: Object.fromEntries(Object.entries(look).filter(([, v]) => v)),
    shot: direction?.shot ?? {},
    aspectRatio:
      !video && request.inputs.aspectRatio !== "auto"
        ? request.inputs.aspectRatio
        : "16:9",
    durationSeconds:
      video && [4, 5, 6, 8, 10].includes(request.inputs.durationSeconds)
        ? request.inputs.durationSeconds
        : 6,
    capabilities,
  });
}
