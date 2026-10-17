import { createServerFn } from "@tanstack/react-start";
import {
  commandResultSchema,
  workflowCommandSchema,
} from "@open-cinema/contracts";
import { getCoordinator } from "./jobs";
import { requireSameOrigin, requireSession } from "./session";

/**
 * Submits any registered workflow kind, e.g. `image.flux-reference` with
 * `references: AssetRef[]` and `mentions`, or `video.ltx` with a `firstFrame`.
 * The coordinator owner-checks every ref and resolves media only at submission.
 */
export const submitWorkflow = createServerFn({ method: "POST" })
  .validator(workflowCommandSchema)
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    using result = await getCoordinator(session.userId).submit(
      { ownerId: session.userId },
      data,
    );
    return commandResultSchema.parse(result);
  });
