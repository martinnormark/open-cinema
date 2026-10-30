import {
  revisionSchema,
  type AssetRef,
  type OwnerScope,
  type Revision,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import type { RevisionModel } from "../generated/prisma/models";
import { assetRefFromColumns, timestamps } from "../rows";

type RevisionRow = RevisionModel;

export function toRevision(row: RevisionRow): Revision {
  return revisionSchema.parse({
    ...row,
    ...timestamps(row),
    source: assetRefFromColumns({
      assetType: row.sourceType,
      mediaAssetId: row.sourceAssetId,
      jobId: row.sourceJobId,
      outputId: row.sourceOutputId,
    }),
    result:
      row.resultJobId && row.resultOutputId
        ? {
            type: "job-output",
            jobId: row.resultJobId,
            outputId: row.resultOutputId,
          }
        : null,
  });
}

export async function listRevisions(
  db: DatabaseContext,
  scope: OwnerScope,
  filter: { source?: AssetRef } = {},
): Promise<Revision[]> {
  const source = filter.source;
  const rows = await getClient(db).revision.findMany({
    where: {
      ownerId: scope.ownerId,
      ...(source?.type === "media-asset"
        ? { sourceAssetId: source.assetId }
        : source?.type === "job-output"
          ? { sourceJobId: source.jobId, sourceOutputId: source.outputId }
          : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(toRevision);
}

export async function getRevision(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<Revision | null> {
  const row = await getClient(db).revision.findFirst({
    where: { id, ownerId: scope.ownerId },
  });
  return row ? toRevision(row) : null;
}

export async function getRevisionForJob(
  db: DatabaseContext,
  scope: OwnerScope,
  jobId: string,
): Promise<Revision | null> {
  const row = await getClient(db).revision.findFirst({
    where: { jobId, ownerId: scope.ownerId },
  });
  return row ? toRevision(row) : null;
}
