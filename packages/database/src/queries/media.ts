import {
  mediaAssetSchema,
  type AssetRef,
  type MediaAsset,
  type MediaKind,
  type OwnerScope,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import type { MediaAssetModel } from "../generated/prisma/models";
import { timestamps } from "../rows";

type MediaAssetRow = MediaAssetModel;
export function toMediaAsset(row: MediaAssetRow): MediaAsset {
  return mediaAssetSchema.parse({ ...row, ...timestamps(row) });
}

export async function listMediaAssets(
  db: DatabaseContext,
  scope: OwnerScope,
  filter: { kind?: MediaKind; projectId?: string } = {},
): Promise<MediaAsset[]> {
  const rows = await getClient(db).mediaAsset.findMany({
    where: {
      ownerId: scope.ownerId,
      status: "ready",
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(toMediaAsset);
}

/** Includes pending uploads so the upload flow can finish or fail them. */
export async function getMediaAsset(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<MediaAsset | null> {
  const row = await getClient(db).mediaAsset.findFirst({
    where: { id, ownerId: scope.ownerId },
  });
  return row ? toMediaAsset(row) : null;
}

/**
 * Storage metadata for any ref the owner may use. Job outputs authorize through
 * the owning job; uploads must be `ready`. Returns null for anything else.
 */
export async function resolveAssetRef(
  db: DatabaseContext,
  scope: OwnerScope,
  ref: AssetRef,
): Promise<{
  r2Key: string;
  mediaType: string;
  sizeBytes: number | null;
  /** Uploads only: the measured pixel aspect, null when square or unknown. */
  pixelAspect?: number | null;
} | null> {
  const client = getClient(db);
  if (ref.type === "media-asset") {
    const row = await client.mediaAsset.findFirst({
      where: { id: ref.assetId, ownerId: scope.ownerId, status: "ready" },
    });
    return row
      ? {
          r2Key: row.r2Key,
          mediaType: row.mediaType,
          sizeBytes: row.sizeBytes,
          pixelAspect: row.pixelAspect,
        }
      : null;
  }
  const output = await client.jobOutput.findFirst({
    where: {
      id: ref.outputId,
      jobId: ref.jobId,
      job: { ownerId: scope.ownerId },
    },
  });
  return output?.r2Key
    ? {
        r2Key: output.r2Key,
        mediaType: output.mediaType,
        sizeBytes: output.sizeBytes,
      }
    : null;
}
