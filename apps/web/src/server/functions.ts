import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { createDatabase } from "@open-cinema/database";
import { listJobs } from "@open-cinema/database/queries";
import { requireSession } from "./session";
import { getCoordinator } from "./jobs";
import { snapshotSchema } from "@open-cinema/contracts";

export const getJobHistory = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await requireSession();
    return listJobs(createDatabase(env.DB), { ownerId: session.userId });
  },
);

export const getJobSnapshot = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await requireSession();
    using result = await getCoordinator(session.userId).getSnapshot({
      ownerId: session.userId,
    });
    return result === null ? null : snapshotSchema.parse(result);
  },
);

export const beginLocalSession = createServerFn({ method: "POST" }).handler(
  async () => {
    requireSameOrigin();
    await startLocalSession();
    return { ok: true };
  },
);
export const submitGeneration = createServerFn({ method: "POST" })
  .validator(promptCommandSchema)
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    using result = await getCoordinator(session.userId).submit(
      { ownerId: session.userId },
      data,
    );
    return commandResultSchema.parse(result);
  });
export const cancelGeneration = createServerFn({ method: "POST" })
  .validator(z.object({ jobId: z.string().uuid() }))
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    using result = await getCoordinator(session.userId).cancel(
      { ownerId: session.userId },
      data.jobId,
    );
    return commandResultSchema.parse(result);
  });
export const reconcileGeneration = createServerFn({ method: "POST" })
  .validator(z.object({ jobId: z.string().uuid() }))
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    using result = await getCoordinator(session.userId).reconcile(
      { ownerId: session.userId },
      data.jobId,
    );
    return commandResultSchema.parse(result);
  });
import { startLocalSession, requireSameOrigin } from "./session";
import {
  promptCommandSchema,
  commandResultSchema,
} from "@open-cinema/contracts";
import { z } from "zod";
