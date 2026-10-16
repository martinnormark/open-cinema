import type { AssetRef } from "@open-cinema/contracts";

/** ISO timestamps for contract parsing; Prisma returns Date objects. */
export function timestamps(row: { createdAt: Date; updatedAt: Date }) {
  return {
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function assetRefColumns(ref: AssetRef) {
  return ref.type === "media-asset"
    ? {
        assetType: ref.type,
        mediaAssetId: ref.assetId,
        jobId: null,
        outputId: null,
      }
    : {
        assetType: ref.type,
        mediaAssetId: null,
        jobId: ref.jobId,
        outputId: ref.outputId,
      };
}

export function assetRefFromColumns(row: {
  assetType: string;
  mediaAssetId: string | null;
  jobId: string | null;
  outputId: string | null;
}): AssetRef {
  if (row.assetType === "media-asset" && row.mediaAssetId)
    return { type: "media-asset", assetId: row.mediaAssetId };
  if (row.assetType === "job-output" && row.jobId && row.outputId)
    return { type: "job-output", jobId: row.jobId, outputId: row.outputId };
  throw new Error("Stored asset reference is incomplete");
}
