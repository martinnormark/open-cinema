import { createServerFn } from "@tanstack/react-start";
import { env } from "@open-cinema/runtime";
import {
  commandResultSchema,
  workflowCommandSchema,
} from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import { countRecipeUse, stampDirection } from "./direction";
import { getCoordinator } from "./jobs";
import { requireSameOrigin, requireSession } from "./session";

/**
 * Submits any registered workflow kind, e.g. `image.flux-reference` with
 * `references: AssetRef[]` and `mentions`, or `video.ltx` with a `firstFrame`.
 * The coordinator owner-checks every ref and resolves media only at submission.
 * A command with a project is filed under it with the project's current look.
 */
export const submitWorkflow = createServerFn({ method: "POST" })
  .validator(workflowCommandSchema)
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    const scope = { ownerId: session.userId };
    const db = createDatabase(env.DB);
    const stamped = await stampDirection(db, scope, data);
    if (!stamped.ok)
      return commandResultSchema.parse({ ok: false, error: stamped.error });
    const result = await getCoordinator(session.userId).submit(
      scope,
      stamped.command,
    );
    const parsed = commandResultSchema.parse(result);
    if (parsed.ok) await countRecipeUse(db, scope, stamped.command);
    return parsed;
  });
