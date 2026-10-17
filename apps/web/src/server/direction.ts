import "@tanstack/react-start/server-only";
import type { DatabaseContext } from "@open-cinema/database";
import { getProject, getRecipe } from "@open-cinema/database/queries";
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
 * Files a command under its project and records the project look as it is
 * now, read from D1 rather than trusted from the browser. A shot's overrides
 * and directing choices stay in the command; the project itself is unchanged.
 */
export async function stampDirection(
  db: DatabaseContext,
  scope: OwnerScope,
  command: WorkflowCommand,
): Promise<Stamped> {
  const current = requestDirection(command.request);
  if (!command.projectId && !current) return { ok: true, command };
  const project = command.projectId
    ? await getProject(db, scope, command.projectId)
    : null;
  if (command.projectId && !project)
    return {
      ok: false,
      error: "That project is no longer available. Choose another.",
    };
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
    ...(project
      ? { project: { id: project.id, name: project.name, look: project.look } }
      : {}),
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
