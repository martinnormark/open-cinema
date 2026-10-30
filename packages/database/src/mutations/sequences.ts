import {
  addShotInputSchema,
  addTakeInputSchema,
  createSequenceInputSchema,
  moveShotInputSchema,
  setTakeStatusInputSchema,
  MAX_SEQUENCE_SHOTS,
  updateSequenceInputSchema,
  updateShotInputSchema,
  type AddShotInput,
  type AddTakeInput,
  type AssetRef,
  type CreateSequenceInput,
  type MoveShotInput,
  type OwnerScope,
  type Sequence,
  type SetTakeStatusInput,
  type UpdateSequenceInput,
  type UpdateShotInput,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import { resolveAssetRef } from "../queries/media";
import { getSequence, getSequenceForShot } from "../queries/sequences";
import { ensureUser } from "./users";

/** Drops unset fields; Prisma rejects explicit undefined under exactOptionalPropertyTypes. */
function defined<T extends object>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/** Shots are spaced so an insert rarely renumbers its neighbours. */
const STEP = 1024;

function takeColumns(ref: AssetRef) {
  return ref.type === "media-asset"
    ? {
        assetType: ref.type,
        mediaAssetId: ref.assetId,
        assetJobId: null,
        outputId: null,
      }
    : {
        assetType: ref.type,
        mediaAssetId: null,
        assetJobId: ref.jobId,
        outputId: ref.outputId,
      };
}

export async function createSequence(
  db: DatabaseContext,
  scope: OwnerScope,
  input: CreateSequenceInput,
): Promise<Sequence> {
  const data = createSequenceInputSchema.parse(input);
  await ensureUser(db, scope);
  const client = getClient(db);
  const id = crypto.randomUUID();
  await client.sequence.create({
    data: {
      id,
      ownerId: scope.ownerId,
      title: data.title,
      idea: data.idea,
      shots: {
        create: data.shots.map((shot, index) => ({
          id: crypto.randomUUID(),
          sortOrder: (index + 1) * STEP,
          ...shot,
        })),
      },
    },
  });
  return (await getSequence(db, scope, id))!;
}

export async function updateSequence(
  db: DatabaseContext,
  scope: OwnerScope,
  input: UpdateSequenceInput,
): Promise<Sequence | null> {
  const { id, ...changes } = updateSequenceInputSchema.parse(input);
  const { count } = await getClient(db).sequence.updateMany({
    where: { id, ownerId: scope.ownerId },
    data: defined(changes),
  });
  return count ? getSequence(db, scope, id) : null;
}

export async function deleteSequence(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<boolean> {
  const { count } = await getClient(db).sequence.deleteMany({
    where: { id, ownerId: scope.ownerId },
  });
  return count > 0;
}

async function touch(db: DatabaseContext, sequenceId: string) {
  await getClient(db).sequence.update({
    where: { id: sequenceId },
    data: { updatedAt: new Date() },
  });
}

export async function addShot(
  db: DatabaseContext,
  scope: OwnerScope,
  input: AddShotInput,
): Promise<Sequence | null> {
  const { sequenceId, afterShotId, ...shot } = addShotInputSchema.parse(input);
  const sequence = await getSequence(db, scope, sequenceId);
  if (!sequence) return null;
  const shots = sequence.shots;
  // The same ceiling a new or imported sequence has, so every sequence can
  // travel in a world bundle.
  if (shots.length >= MAX_SEQUENCE_SHOTS)
    throw new Error(
      `A sequence holds at most ${MAX_SEQUENCE_SHOTS} shots. Start another for the next scene.`,
    );
  const index = afterShotId
    ? shots.findIndex((s) => s.id === afterShotId)
    : shots.length - 1;
  const before = shots[index]?.sortOrder ?? 0;
  const after = shots[index + 1]?.sortOrder;
  const client = getClient(db);
  let sortOrder =
    after === undefined ? before + STEP : Math.floor((before + after) / 2);
  if (after !== undefined && (sortOrder === before || sortOrder === after)) {
    // No gap left: renumber everything once, then insert into the new gap.
    await Promise.all(
      shots.map((s, i) =>
        client.shot.update({
          where: { id: s.id },
          data: { sortOrder: (i + 1) * STEP },
        }),
      ),
    );
    sortOrder = (index + 1) * STEP + STEP / 2;
  }
  await client.shot.create({
    data: { id: crypto.randomUUID(), sequenceId, sortOrder, ...shot },
  });
  await touch(db, sequenceId);
  return getSequence(db, scope, sequenceId);
}

export async function updateShot(
  db: DatabaseContext,
  scope: OwnerScope,
  input: UpdateShotInput,
): Promise<Sequence | null> {
  const { id, ...changes } = updateShotInputSchema.parse(input);
  const sequence = await getSequenceForShot(db, scope, id);
  if (!sequence) return null;
  await getClient(db).shot.update({ where: { id }, data: defined(changes) });
  await touch(db, sequence.id);
  return getSequence(db, scope, sequence.id);
}

export async function deleteShot(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<Sequence | null> {
  const sequence = await getSequenceForShot(db, scope, id);
  if (!sequence) return null;
  await getClient(db).shot.delete({ where: { id } });
  await touch(db, sequence.id);
  return getSequence(db, scope, sequence.id);
}

/** Swaps a shot with its neighbour; the ends stay where they are. */
export async function moveShot(
  db: DatabaseContext,
  scope: OwnerScope,
  input: MoveShotInput,
): Promise<Sequence | null> {
  const { id, direction } = moveShotInputSchema.parse(input);
  const sequence = await getSequenceForShot(db, scope, id);
  if (!sequence) return null;
  const index = sequence.shots.findIndex((s) => s.id === id);
  const other = sequence.shots[direction === "earlier" ? index - 1 : index + 1];
  const shot = sequence.shots[index]!;
  if (other) {
    const client = getClient(db);
    await client.shot.update({
      where: { id: shot.id },
      data: { sortOrder: other.sortOrder },
    });
    await client.shot.update({
      where: { id: other.id },
      data: { sortOrder: shot.sortOrder },
    });
    await touch(db, sequence.id);
  }
  return getSequence(db, scope, sequence.id);
}

/**
 * Records a take on a shot. A job's take is added at submission, before its
 * output exists; the asset is filled in when the creator decides on it.
 */
export async function addTake(
  db: DatabaseContext,
  scope: OwnerScope,
  input: AddTakeInput,
): Promise<Sequence | null> {
  const take = addTakeInputSchema.parse(input);
  const sequence = await getSequenceForShot(db, scope, take.shotId);
  if (!sequence) return null;
  if (take.asset && !(await resolveAssetRef(db, scope, take.asset)))
    throw new Error("That media is not available");
  const client = getClient(db);
  if (take.approve)
    await client.shotTake.updateMany({
      where: { shotId: take.shotId, role: take.role, status: "approved" },
      data: { status: "candidate" },
    });
  await client.shotTake.create({
    data: {
      id: crypto.randomUUID(),
      shotId: take.shotId,
      role: take.role,
      origin: take.origin,
      status: take.approve ? "approved" : "candidate",
      jobId: take.jobId ?? null,
      prompt: take.prompt,
      ...(take.asset ? takeColumns(take.asset) : {}),
    },
  });
  await touch(db, sequence.id);
  return getSequence(db, scope, sequence.id);
}

/**
 * Approving a take demotes the shot's other approved take for that role, so a
 * shot always stands on at most one keyframe and one motion take.
 */
export async function setTakeStatus(
  db: DatabaseContext,
  scope: OwnerScope,
  input: SetTakeStatusInput,
): Promise<Sequence | null> {
  const { id, status, asset } = setTakeStatusInputSchema.parse(input);
  const client = getClient(db);
  const row = await client.shotTake.findFirst({
    where: { id, shot: { sequence: { ownerId: scope.ownerId } } },
    include: { shot: { select: { sequenceId: true } } },
  });
  if (!row) return null;
  if (asset) {
    if (!(await resolveAssetRef(db, scope, asset)))
      throw new Error("That media is not available");
    if (asset.type === "job-output" && row.jobId && asset.jobId !== row.jobId)
      throw new Error("That output belongs to another job");
  }
  if (status === "approved" && !row.assetType && !asset)
    throw new Error("Wait for the take to finish before approving it");
  if (status === "approved")
    await client.shotTake.updateMany({
      where: {
        shotId: row.shotId,
        role: row.role,
        status: "approved",
        NOT: { id },
      },
      data: { status: "candidate" },
    });
  await client.shotTake.update({
    where: { id },
    data: { status, ...(asset ? takeColumns(asset) : {}) },
  });
  await touch(db, row.shot.sequenceId);
  return getSequence(db, scope, row.shot.sequenceId);
}
