import {
  readWorldManifest,
  WORLD_MANIFEST_PATH,
  WorldFormatError,
  type WorldManifest,
  type WorldMedia,
} from "@open-cinema/contracts";
import { readZip, ZipError, type ZipEntry } from "@/lib/zip";

/** A world bundle opened in the browser, ready to bring in. */
export interface OpenedWorld {
  manifest: WorldManifest;
  /** The manifest as written in the file; the server reads it again. */
  raw: unknown;
  files: Map<string, ZipEntry>;
  bytes: number;
}

export async function openWorld(file: File): Promise<OpenedWorld> {
  try {
    const entries = await readZip(file);
    const files = new Map(entries.map((e) => [e.name, e]));
    const index = files.get(WORLD_MANIFEST_PATH);
    if (!index)
      throw new WorldFormatError(
        "This archive has no world.json, so it is not an Open Cinema world.",
      );
    let raw: unknown;
    try {
      raw = JSON.parse(await (await index.blob()).text());
    } catch {
      throw new WorldFormatError("This world's world.json is not readable.");
    }
    const manifest = readWorldManifest(raw);
    const missing = manifest.media.find((m) => !files.has(m.path));
    if (missing)
      throw new WorldFormatError(
        `This world lists ${missing.path} but the archive does not carry it.`,
      );
    return {
      manifest,
      raw,
      files,
      bytes: manifest.media.reduce(
        (n, m) => n + (files.get(m.path)?.size ?? 0),
        0,
      ),
    };
  } catch (error) {
    if (error instanceof WorldFormatError || error instanceof ZipError)
      throw error;
    throw new WorldFormatError("This file could not be opened as a world.");
  }
}

function filenameFor(media: WorldMedia) {
  return media.origin.type === "upload"
    ? media.origin.filename
    : media.path.slice("media/".length);
}

/** Uploads one media file through the ordinary upload route; its new id. */
async function upload(
  media: WorldMedia,
  entry: ZipEntry,
  signal: AbortSignal,
): Promise<string> {
  const body = await entry.blob();
  const headers: Record<string, string> = {
    "Content-Type": media.mediaType,
    "X-Media-Filename": encodeURIComponent(filenameFor(media)),
  };
  if (media.width) headers["X-Media-Width"] = String(media.width);
  if (media.height) headers["X-Media-Height"] = String(media.height);
  if (media.durationMs)
    headers["X-Media-Duration"] = String(media.durationMs / 1000);
  const response = await fetch("/api/media/upload", {
    method: "POST",
    headers,
    body,
    signal,
  });
  const result = (await response.json().catch(() => null)) as {
    id?: string;
    error?: string;
  } | null;
  if (!response.ok || !result?.id)
    throw new Error(
      result?.error ?? `${filenameFor(media)} could not be uploaded.`,
    );
  return result.id;
}

/**
 * Uploads every media file in turn, reporting bytes sent, and returns the
 * path → upload map the import needs. One at a time keeps memory flat and
 * leaves bandwidth for the rest of the studio.
 */
export async function uploadWorldMedia(
  world: OpenedWorld,
  onProgress: (sent: number) => void,
  signal: AbortSignal,
): Promise<Record<string, string>> {
  const media: Record<string, string> = {};
  let sent = 0;
  for (const item of world.manifest.media) {
    const entry = world.files.get(item.path)!;
    media[item.path] = await upload(item, entry, signal);
    sent += entry.size;
    onProgress(sent);
  }
  return media;
}
