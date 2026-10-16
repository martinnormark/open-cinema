import "@tanstack/react-start/server-only";
import { z } from "zod";
import { uploadObjectKey } from "@open-cinema/assets";
import {
  mediaAttachmentSchema,
  mediaKindSchema,
} from "@/features/library/model";

/**
 * Upload metadata. Until the D1 MediaAsset model lands this lives in a JSON
 * sidecar next to the bytes in R2. Swap `r2SidecarStore` for database queries;
 * callers only depend on `MediaStore`.
 */
export const uploadRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string(),
  kind: mediaKindSchema,
  mediaType: z.string(),
  filename: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  etag: z.string(),
  r2Key: z.string(),
  posterKey: z.string().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationSeconds: z.number().positive().nullable(),
  createdAt: z.string(),
  attachments: z.array(mediaAttachmentSchema),
});
export type UploadRecord = z.infer<typeof uploadRecordSchema>;

export interface MediaStore {
  list(ownerId: string): Promise<UploadRecord[]>;
  get(ownerId: string, id: string): Promise<UploadRecord | null>;
  put(record: UploadRecord): Promise<void>;
  delete(ownerId: string, id: string): Promise<void>;
}

const MAX_LISTED = 500;
function recordKey(ownerId: string, id: string) {
  return uploadObjectKey(ownerId, id, "original").replace(
    /original$/,
    "record.json",
  );
}

export function r2SidecarStore(bucket: R2Bucket): MediaStore {
  async function read(key: string) {
    const object = await bucket.get(key);
    if (!object) return null;
    const parsed = uploadRecordSchema.safeParse(await object.json());
    return parsed.success ? parsed.data : null;
  }
  return {
    async list(ownerId) {
      const prefix = recordKey(ownerId, "x").replace(/x\/record\.json$/, "");
      const keys: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await bucket.list({
          prefix,
          limit: 1000,
          ...(cursor ? { cursor } : {}),
        });
        for (const object of page.objects)
          if (object.key.endsWith("/record.json")) keys.push(object.key);
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor && keys.length < MAX_LISTED);
      const records = await Promise.all(keys.slice(0, MAX_LISTED).map(read));
      return records
        .filter((r): r is UploadRecord => r?.ownerId === ownerId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async get(ownerId, id) {
      if (!z.string().uuid().safeParse(id).success) return null;
      const record = await read(recordKey(ownerId, id));
      return record?.ownerId === ownerId ? record : null;
    },
    async put(record) {
      await bucket.put(
        recordKey(record.ownerId, record.id),
        JSON.stringify(uploadRecordSchema.parse(record)),
        { httpMetadata: { contentType: "application/json" } },
      );
    },
    async delete(ownerId, id) {
      await bucket.delete(recordKey(ownerId, id));
    },
  };
}
