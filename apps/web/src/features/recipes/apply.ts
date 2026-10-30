import {
  CAPABILITIES,
  missingSlots,
  renderRecipe,
  type DirectionSnapshot,
  type Element,
  type ElementState,
  type Look,
  type RecipeSpec,
} from "@open-cinema/contracts";
import { stateHandle } from "@/features/elements/model";

/** An Element chosen for a slot, with the states combined for this shot. */
export interface SlotChoice {
  element: Element;
  states: ElementState[];
}
export type SlotChoices = Partial<Record<string, SlotChoice>>;

export function mentionToken(choice: SlotChoice) {
  return choice.states.length
    ? `@${choice.element.handle}:${choice.states.map(stateHandle).join("+")}`
    : `@${choice.element.handle}`;
}

export function recipePrompt(spec: RecipeSpec, choices: SlotChoices) {
  const bindings: Record<string, string> = {};
  for (const [key, choice] of Object.entries(choices))
    if (choice) bindings[key] = mentionToken(choice);
  return renderRecipe(spec.template, bindings);
}

/** The direction a recipe applies with: its look and its shot choices. */
export function recipeDirection(
  recipe: { id: string; version: number; name: string },
  spec: RecipeSpec,
): DirectionSnapshot {
  const overrides: Look = Object.fromEntries(
    Object.entries(spec.look).filter(([, v]) => v),
  );
  return {
    overrides,
    shot: spec.shot,
    recipe,
  };
}

export interface CompatibilityNote {
  level: "blocker" | "warning" | "info";
  text: string;
}

/**
 * What to expect before generating: required slots, capabilities the studio
 * cannot run yet, and how each chosen Element will be carried by the model.
 */
export function compatibility(
  spec: RecipeSpec,
  choices: SlotChoices,
): CompatibilityNote[] {
  const notes: CompatibilityNote[] = [];
  const bindings = Object.fromEntries(
    Object.entries(choices).map(([k, c]) => [k, c ? "x" : undefined]),
  );
  for (const slot of missingSlots(spec, bindings))
    notes.push({
      level: "blocker",
      text: `Choose a ${slot.type} for ${slot.label}.`,
    });
  for (const id of spec.capabilities) {
    const capability = CAPABILITIES[id];
    if (capability.status === "planned")
      notes.push({
        level: "blocker",
        text: `${capability.name} is not in the studio yet.`,
      });
  }
  const chosen = Object.values(choices).filter((c): c is SlotChoice => !!c);
  if (spec.medium === "video") {
    for (const { element } of chosen)
      notes.push(
        element.description.trim()
          ? {
              level: "info",
              text: `LTX reads @${element.handle} from its description; its reference images are not used.`,
            }
          : {
              level: "warning",
              text: `@${element.handle} has no description, so LTX reads only the name.`,
            },
      );
  } else {
    for (const { element, states } of chosen) {
      const approved = element.references.filter(
        (r) =>
          r.status === "approved" &&
          (r.stateId === null || states.some((s) => s.id === r.stateId)),
      );
      if (!approved.length)
        notes.push({
          level: "warning",
          text: `@${element.handle} has no approved references, so it is carried by its description only and may not look like your ${element.type}.`,
        });
      else {
        const unseen = states.filter(
          (s) => !approved.some((r) => r.stateId === s.id),
        );
        notes.push({
          level: "info",
          text: `@${element.handle} brings ${approved.length} approved ${approved.length === 1 ? "reference" : "references"}${unseen.length ? `; ${unseen.map((s) => s.name.toLowerCase()).join(" and ")} ${unseen.length === 1 ? "comes" : "come"} from ${unseen.length === 1 ? "its description" : "their descriptions"}` : ""}.`,
        });
      }
    }
    const far =
      spec.shot.framing === "extreme-wide" || spec.shot.framing === "wide";
    if (far && chosen.some((c) => c.element.type === "character"))
      notes.push({
        level: "info",
        text: "Faces are small in this framing; identity holds mostly in silhouette and clothing.",
      });
  }
  return notes;
}
