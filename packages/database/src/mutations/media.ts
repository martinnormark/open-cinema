import {
  createMediaAssetInputSchema,
  mediaKindFor,
  MAX_UPLOAD_BYTES,
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

/** Display metadata measured client-side after upload (dimensions, duration). */
export async function updateMediaAssetMetadata(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
  metadata: {
    width?: number;
    height?: number;
    durationMs?: number;
    fps?: number;
  },
): Promise<void> {
  await getClient(db).mediaAsset.updateMany({
    where: { id, ownerId: scope.ownerId },
    data: metadata,
  });
}
