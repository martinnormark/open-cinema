import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { commandResultSchema, snapshotSchema } from "@open-cinema/contracts";
import {
  requireSameOrigin,
  requireSession,
  startLocalSession,
} from "./session";
import { getCoordinator } from "./jobs";

export const getJobSnapshot = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await requireSession();
    const result = await getCoordinator(session.userId).getSnapshot({
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

export const cancelGeneration = createServerFn({ method: "POST" })
  .validator(z.object({ jobId: z.string().uuid() }))
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    const result = await getCoordinator(session.userId).cancel(
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
    const result = await getCoordinator(session.userId).reconcile(
      { ownerId: session.userId },
      data.jobId,
    );
    return commandResultSchema.parse(result);
  });
