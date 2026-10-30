import "@tanstack/react-start/server-only";
import type { DatabaseContext } from "@open-cinema/database";
import { getRecipe } from "@open-cinema/database/queries";
import { recordRecipeUse } from "@open-cinema/database/mutations";
import {
  generationRequestSchema,
  requestDirection,
  type OwnerScope,
  type WorkflowCommand,
} from "@open-cinema/contracts";

export const BUILTIN_RECIPE_PREFIX = "builtin:";

type Stamped =
  { ok: true; command: WorkflowCommand } | { ok: false; error: string };

/**
 * Records the direction a command carries: the shot's look, its directing
 * choices and the recipe it came from, checked against SQLite. A legacy
 * project look sent by the browser is dropped.
 */
export async function stampDirection(
  db: DatabaseContext,
  scope: OwnerScope,
  command: WorkflowCommand,
): Promise<Stamped> {
  const current = requestDirection(command.request);
  if (!current) return { ok: true, command };
  // A recast replaces a person, not the look; it carries no direction.
  if (command.request.workflowKind === "video.character-replace")
    return { ok: true, command };
  const recipe = current?.recipe;
  if (
    recipe &&
    !recipe.id.startsWith(BUILTIN_RECIPE_PREFIX) &&
    !(await getRecipe(db, scope, recipe.id))
  )
    return { ok: false, error: "That recipe is no longer available." };
  const direction = {
    overrides: current?.overrides ?? {},
    shot: current?.shot ?? {},
    ...(recipe ? { recipe } : {}),
  };
  return {
    ok: true,
    command: {
      ...command,
      request: generationRequestSchema.parse({
        ...command.request,
        inputs: { ...command.request.inputs, direction },
      }),
    },
  };
}

/** Counts a generation against the personal recipe it came from. */
export async function countRecipeUse(
  db: DatabaseContext,
  scope: OwnerScope,
  command: WorkflowCommand,
) {
  const id = requestDirection(command.request)?.recipe?.id;
  if (id && !id.startsWith(BUILTIN_RECIPE_PREFIX))
    await recordRecipeUse(db, scope, id).catch(() => {});
}
