import { createHash } from "node:crypto";
import { mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";

export interface StoredObject {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}
export interface ObjectBody extends StoredObject {
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
export interface UploadedPart {
  partNumber: number;
  etag: string;
}
export interface MultipartUpload {
  uploadPart(partNumber: number, bytes: Uint8Array): Promise<UploadedPart>;
  complete(parts: UploadedPart[]): Promise<StoredObject>;
  abort(): Promise<void>;
}
type Metadata = Pick<StoredObject, "httpMetadata" | "customMetadata">;
export interface AssetStore {
  head(key: string): Promise<StoredObject | null>;
  get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<ObjectBody | null>;
  put(
    key: string,
    value: string | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    metadata?: Metadata,
  ): Promise<StoredObject>;
  delete(keys: string | string[]): Promise<void>;
  createMultipartUpload(
    key: string,
    metadata?: Metadata,
  ): Promise<MultipartUpload>;
}
const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";

/** A single atomic file contains bytes followed by metadata and its uint32 length.
 * Keys are hashed, so user-controlled paths can never escape the private directory.
 * Incomplete writes stay in staging; rename publishes bytes and ownership together.
 */
export class FileAssetStore implements AssetStore {
  constructor(private readonly directory: string) {}
  private path(key: string) {
    return join(
      this.directory,
      createHash("sha256").update(key).digest("hex") + ".object",
    );
  }
  private async metadata(file: FileHandle): Promise<StoredObject> {
    const { size } = await file.stat();
    const tail = Buffer.alloc(4);
    await file.read(tail, 0, 4, size - 4);
    const length = tail.readUInt32BE();
    if (length > 1024 * 1024 || length > size - 4)
      throw new Error("Invalid asset metadata");
    const data = Buffer.alloc(length);
    await file.read(data, 0, length, size - 4 - length);
    return JSON.parse(data.toString());
  }
  async head(key: string): Promise<StoredObject | null> {
    let file: FileHandle;
    try {
      file = await open(this.path(key), "r");
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
    try {
      return await this.metadata(file);
    } finally {
      await file.close();
    }
  }
  async get(
    key: string,
    options?: { range?: { offset: number; length: number } },
  ): Promise<ObjectBody | null> {
    let file: FileHandle;
    try {
      file = await open(this.path(key), "r");
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
    try {
      const metadata = await this.metadata(file);
      const start = options?.range?.offset ?? 0;
      const length = Math.min(
        options?.range?.length ?? metadata.size,
        metadata.size - start,
      );
      let body: ReadableStream<Uint8Array>;
      if (length <= 0) {
        await file.close();
        body = new Blob([]).stream();
      } else
        body = Readable.toWeb(
          file.createReadStream({
            start,
            end: start + length - 1,
            autoClose: true,
          }),
        ) as unknown as ReadableStream<Uint8Array>;
      return {
        ...metadata,
        body,
        arrayBuffer: () => new Response(body).arrayBuffer(),
        text: () => new Response(body).text(),
        json: () => new Response(body).json(),
      };
    } catch (error) {
      await file.close();
      throw error;
    }
  }
  async createMultipartUpload(
    key: string,
    metadata: Metadata = {},
  ): Promise<MultipartUpload> {
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `${crypto.randomUUID()}.partial`);
    const file = await open(temporary, "wx", 0o600);
    const hash = createHash("sha256");
    const receipts: UploadedPart[] = [];
    let size = 0;
    let closed = false;
    const write = async (bytes: Uint8Array) => {
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesWritten } = await file.write(
          bytes,
          offset,
          bytes.length - offset,
        );
        if (!bytesWritten) throw new Error("Asset write failed");
        offset += bytesWritten;
      }
    };
    return {
      uploadPart: async (partNumber, bytes) => {
        if (closed || partNumber !== receipts.length + 1)
          throw new Error("Invalid upload part order");
        await write(bytes);
        hash.update(bytes);
        size += bytes.byteLength;
        const receipt = {
          partNumber,
          etag: createHash("sha256").update(bytes).digest("hex"),
        };
        receipts.push(receipt);
        return receipt;
      },
      complete: async (parts) => {
        if (closed || JSON.stringify(parts) !== JSON.stringify(receipts))
          throw new Error("Incomplete upload");
        const etag = hash.digest("hex");
        const result: StoredObject = {
          ...metadata,
          key,
          size,
          etag,
          httpEtag: `"${etag}"`,
        };
        const encoded = Buffer.from(JSON.stringify(result));
        const tail = Buffer.alloc(4);
        tail.writeUInt32BE(encoded.length);
        await write(encoded);
        await write(tail);
        await file.sync();
        await file.close();
        closed = true;
        await rename(temporary, this.path(key));
        const directory = await open(this.directory, "r");
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
        return result;
      },
      abort: async () => {
        if (!closed) {
          await file.close();
          closed = true;
        }
        await unlink(temporary).catch((error) => {
          if (!missing(error)) throw error;
        });
      },
    };
  }
  async put(
    key: string,
    value: string | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    metadata: Metadata = {},
  ) {
    const upload = await this.createMultipartUpload(key, metadata);
    const parts: UploadedPart[] = [];
    const body =
      value instanceof ReadableStream
        ? value
        : new Blob([
            typeof value === "string"
              ? value
              : new Uint8Array(value as ArrayBuffer),
          ]).stream();
    const reader = body.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parts.push(await upload.uploadPart(parts.length + 1, value));
      }
      return await upload.complete(parts);
    } catch (error) {
      await upload.abort();
      throw error;
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  async delete(keys: string | string[]) {
    await Promise.all(
      (Array.isArray(keys) ? keys : [keys]).map((key) =>
        unlink(this.path(key)).catch((error) => {
          if (!missing(error)) throw error;
        }),
      ),
    );
  }
  /** Called before accepting requests; only one application process owns a volume. */
  async cleanupStaging() {
    const names = await readdir(this.directory).catch((error) => {
      if (missing(error)) return [];
      throw error;
    });
    await Promise.all(
      names
        .filter((n) => n.endsWith(".partial"))
        .map((n) => unlink(join(this.directory, n))),
    );
  }
}
