import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  addShotInputSchema,
  addTakeInputSchema,
  createSequenceInputSchema,
  moveShotInputSchema,
  planSequenceInputSchema,
  sequencePlanSchema,
  setTakeStatusInputSchema,
  updateSequenceInputSchema,
  updateShotInputSchema,
  approvedTake,
  type Revision,
  type Sequence,
} from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import {
  getProject,
  getSequence,
  listRevisions,
  listProjects,
  listSequences,
} from "@open-cinema/database/queries";
import {
  addShot,
  addTake,
  createSequence,
  deleteSequence,
  deleteShot,
  moveShot,
  setTakeStatus,
  updateSequence,
  updateShot,
} from "@open-cinema/database/mutations";
import { getCoordinator } from "./jobs";
import { requireSameOrigin, requireSession } from "./session";

const db = () => createDatabase(env.DB);

async function optionalSession() {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof Response && error.status === 401) return null;
    throw error;
  }
}

async function mutate() {
  requireSameOrigin();
  const session = await requireSession();
  return { ownerId: session.userId };
}

function found(sequence: Sequence | null): Sequence {
  if (!sequence) throw new Error("This sequence is no longer available.");
  return sequence;
}

function failure(error: unknown): never {
  if (error instanceof Response) throw error;
  throw new Error(
    error instanceof Error && error.message
      ? error.message
      : "The sequence could not be saved. Try again.",
  );
}

export const getSequencesHome = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await optionalSession();
    if (!session) return { signedIn: false as const };
    const scope = { ownerId: session.userId };
    const [sequences, projects] = await Promise.all([
      listSequences(db(), scope),
      listProjects(db(), scope),
    ]);
    return { signedIn: true as const, sequences, projects };
  },
);

export const getSequenceView = createServerFn({ method: "GET" })
  .validator(z.object({ sequenceId: z.string().min(1).max(100) }))
  .handler(async ({ data }) => {
    const session = await optionalSession();
    if (!session) return { signedIn: false as const };
    const scope = { ownerId: session.userId };
    const sequence = await getSequence(db(), scope, data.sequenceId);
    if (!sequence) return { signedIn: true as const, sequence: null };
    const project = sequence.projectId
      ? await getProject(db(), scope, sequence.projectId)
      : null;
    // Revisions of each shot's approved take, so a kept background swap or
    // recast can replace that one shot without touching the others.
    const sources = sequence.shots.flatMap((shot) => {
      const asset = approvedTake(shot, "motion")?.asset;
      return asset ? [asset] : [];
    });
    const revisions: Revision[] = (
      await Promise.all(
        sources.map((source) => listRevisions(db(), scope, { source })),
      )
    ).flat();
    return { signedIn: true as const, sequence, project, revisions };
  });

export const planMySequence = createServerFn({ method: "POST" })
  .validator(planSequenceInputSchema)
  .handler(async ({ data }) => {
    const scope = await mutate();
    using plan = await getCoordinator(scope.ownerId).planSequence(scope, data);
    return sequencePlanSchema.parse(plan);
  });

export const createMySequence = createServerFn({ method: "POST" })
  .validator(createSequenceInputSchema)
  .handler(async ({ data }) =>
    createSequence(db(), await mutate(), data).catch(failure),
  );

export const updateMySequence = createServerFn({ method: "POST" })
  .validator(updateSequenceInputSchema)
  .handler(async ({ data }) =>
    found(await updateSequence(db(), await mutate(), data).catch(failure)),
  );

export const deleteMySequence = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => ({
    deleted: await deleteSequence(db(), await mutate(), data.id),
  }));

export const addMyShot = createServerFn({ method: "POST" })
  .validator(addShotInputSchema)
  .handler(async ({ data }) =>
    found(await addShot(db(), await mutate(), data).catch(failure)),
  );

export const updateMyShot = createServerFn({ method: "POST" })
  .validator(updateShotInputSchema)
  .handler(async ({ data }) =>
    found(await updateShot(db(), await mutate(), data).catch(failure)),
  );

export const moveMyShot = createServerFn({ method: "POST" })
  .validator(moveShotInputSchema)
  .handler(async ({ data }) =>
    found(await moveShot(db(), await mutate(), data).catch(failure)),
  );

export const deleteMyShot = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) =>
    found(await deleteShot(db(), await mutate(), data.id).catch(failure)),
  );

export const addMyTake = createServerFn({ method: "POST" })
  .validator(addTakeInputSchema)
  .handler(async ({ data }) =>
    found(await addTake(db(), await mutate(), data).catch(failure)),
  );

export const setMyTakeStatus = createServerFn({ method: "POST" })
  .validator(setTakeStatusInputSchema)
  .handler(async ({ data }) =>
    found(await setTakeStatus(db(), await mutate(), data).catch(failure)),
  );
