import { createServerFn } from "@tanstack/react-start";
import { env } from "@open-cinema/runtime";
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
  deleteShot,
  moveShot,
  setTakeStatus,
  updateSequence,
  updateShot,
} from "@open-cinema/database/mutations";
import { getCoordinator } from "./jobs";
import { saveFailure, mutationScope } from "./scope";
import { optionalSession } from "./session";

const db = () => createDatabase(env.DB);

function found(sequence: Sequence | null): Sequence {
  if (!sequence) throw new Error("This sequence is no longer available.");
  return sequence;
}

function failure(error: unknown): never {
  return saveFailure(error, "The sequence could not be saved. Try again.");
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
    const scope = await mutationScope();
    const plan = await getCoordinator(scope.ownerId).planSequence(scope, data);
    return sequencePlanSchema.parse(plan);
  });

export const createMySequence = createServerFn({ method: "POST" })
  .validator(createSequenceInputSchema)
  .handler(async ({ data }) =>
    createSequence(db(), await mutationScope(), data).catch(failure),
  );

export const updateMySequence = createServerFn({ method: "POST" })
  .validator(updateSequenceInputSchema)
  .handler(async ({ data }) =>
    found(
      await updateSequence(db(), await mutationScope(), data).catch(failure),
    ),
  );

export const addMyShot = createServerFn({ method: "POST" })
  .validator(addShotInputSchema)
  .handler(async ({ data }) =>
    found(await addShot(db(), await mutationScope(), data).catch(failure)),
  );

export const updateMyShot = createServerFn({ method: "POST" })
  .validator(updateShotInputSchema)
  .handler(async ({ data }) =>
    found(await updateShot(db(), await mutationScope(), data).catch(failure)),
  );

export const moveMyShot = createServerFn({ method: "POST" })
  .validator(moveShotInputSchema)
  .handler(async ({ data }) =>
    found(await moveShot(db(), await mutationScope(), data).catch(failure)),
  );

export const deleteMyShot = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) =>
    found(
      await deleteShot(db(), await mutationScope(), data.id).catch(failure),
    ),
  );

export const addMyTake = createServerFn({ method: "POST" })
  .validator(addTakeInputSchema)
  .handler(async ({ data }) =>
    found(await addTake(db(), await mutationScope(), data).catch(failure)),
  );

export const setMyTakeStatus = createServerFn({ method: "POST" })
  .validator(setTakeStatusInputSchema)
  .handler(async ({ data }) =>
    found(
      await setTakeStatus(db(), await mutationScope(), data).catch(failure),
    ),
  );
