import {
  createMediaAssetInputSchema,
  mediaKindFor,
  MAX_UPLOAD_BYTES,
  type AssetRef,
  type CreateMediaAssetInput,
  type MediaAsset,
  type OwnerScope,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import { toMediaAsset } from "../queries/media";
import { ensureUser } from "./users";

/**
 * Records an upload before its bytes land in R2. The caller chooses the
 * object key (see packages/assets) and finishes with markMediaAssetReady.
 */
export async function createPendingMediaAsset(
  db: DatabaseContext,
  scope: OwnerScope,
  input: CreateMediaAssetInput & { id: string; r2Key: string },
): Promise<MediaAsset> {
  const data = createMediaAssetInputSchema.parse(input);
  const kind = mediaKindFor(data.mediaType);
  if (!kind) throw new Error(`Unsupported media type: ${data.mediaType}`);
  if (data.sizeBytes > MAX_UPLOAD_BYTES[kind])
    throw new Error("This file is larger than the studio accepts");
  await ensureUser(db, scope);
  const row = await getClient(db).mediaAsset.create({
    data: {
      id: input.id,
      ownerId: scope.ownerId,
      projectId: data.projectId ?? null,
      kind,
      status: "pending",
      mediaType: data.mediaType,
      filename: data.filename,
      r2Key: input.r2Key,
      sizeBytes: data.sizeBytes,
      width: data.width ?? null,
      height: data.height ?? null,
      durationMs: data.durationMs ?? null,
      fps: data.fps ?? null,
      pixelAspect: data.pixelAspect ?? null,
      hasAudio: data.hasAudio ?? null,
    },
  });
  return toMediaAsset(row);
}

/** Only a pending upload can become ready; stored metadata comes from R2, not the client. */
export async function markMediaAssetReady(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
  stored: { sizeBytes: number; etag: string },
): Promise<MediaAsset | null> {
  const client = getClient(db);
  await client.mediaAsset.updateMany({
    where: { id, ownerId: scope.ownerId, status: "pending" },
    data: { status: "ready", sizeBytes: stored.sizeBytes, etag: stored.etag },
  });
  const row = await client.mediaAsset.findFirst({
    where: { id, ownerId: scope.ownerId },
  });
  return row ? toMediaAsset(row) : null;
}

export async function markMediaAssetFailed(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<void> {
  await getClient(db).mediaAsset.updateMany({
    where: { id, ownerId: scope.ownerId, status: "pending" },
    data: { status: "failed" },
  });
}

/**
 * Removes the record; the caller deletes the R2 bytes. Element references and
 * revisions hold typed refs, not foreign keys, so they resolve to null after.
 */
export async function deleteMediaAsset(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<MediaAsset | null> {
  const client = getClient(db);
  const row = await client.mediaAsset.findFirst({
    where: { id, ownerId: scope.ownerId },
  });
  if (!row) return null;
  await client.mediaAsset.deleteMany({ where: { id, ownerId: scope.ownerId } });
  return toMediaAsset(row);
}

/**
 * Records a stored poster still with its upload or job output. Measurements
 * fill only what is unknown: an upload keeps what the browser measured.
 */
export async function recordPoster(
  db: DatabaseContext,
  scope: OwnerScope,
  ref: AssetRef,
  poster: {
    posterKey: string;
    width?: number | undefined;
    height?: number | undefined;
    durationMs?: number | undefined;
  },
): Promise<void> {
  const client = getClient(db);
  const measured = {
    width: poster.width ?? null,
    height: poster.height ?? null,
    durationMs: poster.durationMs ?? null,
  };
  if (ref.type === "media-asset") {
    const where = { id: ref.assetId, ownerId: scope.ownerId };
    const row = await client.mediaAsset.findFirst({ where });
    if (!row) return;
    await client.mediaAsset.updateMany({
      where,
      data: {
        posterKey: poster.posterKey,
        width: row.width ?? measured.width,
        height: row.height ?? measured.height,
        durationMs: row.durationMs ?? measured.durationMs,
      },
    });
    return;
  }
  await client.jobOutput.updateMany({
    where: {
      id: ref.outputId,
      jobId: ref.jobId,
      job: { ownerId: scope.ownerId },
    },
    data: { posterKey: poster.posterKey, ...measured },
  });
}
