import {
  sequenceSchema,
  sequenceSummarySchema,
  shotSchema,
  shotTakeSchema,
  type AssetRef,
  type OwnerScope,
  type Sequence,
  type SequenceSummary,
  type Shot,
  type ShotTake,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import type {
  SequenceModel,
  ShotModel,
  ShotTakeModel,
} from "../generated/prisma/models";
import { assetRefFromColumns, timestamps } from "../rows";

export function takeAsset(row: ShotTakeModel): AssetRef | null {
  if (!row.assetType) return null;
  return assetRefFromColumns({
    assetType: row.assetType,
    mediaAssetId: row.mediaAssetId,
    jobId: row.assetJobId,
    outputId: row.outputId,
  });
}

export function toTake(row: ShotTakeModel): ShotTake {
  return shotTakeSchema.parse({
    ...row,
    ...timestamps(row),
    asset: takeAsset(row),
  });
}

export function toShot(row: ShotModel & { takes: ShotTakeModel[] }): Shot {
  return shotSchema.parse({
    ...row,
    ...timestamps(row),
    takes: [...row.takes]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(toTake),
  });
}

export function toSequence(
  row: SequenceModel & { shots: (ShotModel & { takes: ShotTakeModel[] })[] },
): Sequence {
  return sequenceSchema.parse({
    ...row,
    ...timestamps(row),
    shots: [...row.shots].sort((a, b) => a.sortOrder - b.sortOrder).map(toShot),
  });
}

const withShots = { shots: { include: { takes: true } } } as const;

export async function listSequences(
  db: DatabaseContext,
  scope: OwnerScope,
): Promise<SequenceSummary[]> {
  const rows = await getClient(db).sequence.findMany({
    where: { ownerId: scope.ownerId },
    include: withShots,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return rows.map((row) => {
    const sequence = toSequence(row);
    const approved = (shot: Shot, role: "keyframe" | "motion") =>
      shot.takes.find((t) => t.role === role && t.status === "approved");
    const first = sequence.shots.find(
      (shot) => approved(shot, "keyframe")?.asset,
    );
    return sequenceSummarySchema.parse({
      ...sequence,
      shotCount: sequence.shots.length,
      approvedCount: sequence.shots.filter((shot) => approved(shot, "motion"))
        .length,
      poster: first ? approved(first, "keyframe")!.asset : null,
    });
  });
}

export async function getSequence(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<Sequence | null> {
  const row = await getClient(db).sequence.findFirst({
    where: { id, ownerId: scope.ownerId },
    include: withShots,
  });
  return row ? toSequence(row) : null;
}

/** The sequence a shot belongs to, owner-checked; null when not the caller's. */
export async function getSequenceForShot(
  db: DatabaseContext,
  scope: OwnerScope,
  shotId: string,
): Promise<Sequence | null> {
  const shot = await getClient(db).shot.findFirst({
    where: { id: shotId, sequence: { ownerId: scope.ownerId } },
    select: { sequenceId: true },
  });
  return shot ? getSequence(db, scope, shot.sequenceId) : null;
}
