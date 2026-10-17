import { useSyncExternalStore } from "react";
import { deleteMedia, listMedia } from "@/server/media";
import { probeMedia } from "./media-probe";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  mediaItemSchema,
  UPLOAD_ACCEPT,
  type MediaItem,
} from "./model";

export type UploadPhase = "preparing" | "uploading" | "finishing" | "failed";
export interface UploadEntry {
  key: string;
  file: File;
  name: string;
  kind: "image" | "video";
  phase: UploadPhase;
  /** 0–1 while uploading. */
  progress: number;
  previewUrl: string | null;
  error: string | null;
  /** False when the file itself can never be accepted. */
  retryable: boolean;
}
export interface LibraryState {
  status: "idle" | "loading" | "ready" | "signed-out" | "error";
  items: readonly MediaItem[];
  uploads: readonly UploadEntry[];
  /** Last mutation failure for an item action, shown once. */
  notice: string | null;
}

const initial: LibraryState = {
  status: "idle",
  items: [],
  uploads: [],
  notice: null,
};
let state = initial;
const listeners = new Set<() => void>();
const requests = new Map<string, XMLHttpRequest>();
const waiters = new Map<string, (item: MediaItem | null) => void>();
function settle(key: string, item: MediaItem | null) {
  waiters.get(key)?.(item);
  waiters.delete(key);
}
const CONCURRENCY = 2;

function update(patch: Partial<LibraryState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
function patchUpload(key: string, patch: Partial<UploadEntry>) {
  update({
    uploads: state.uploads.map((u) => (u.key === key ? { ...u, ...patch } : u)),
  });
}

let loadEpoch = 0;
export async function refreshLibrary() {
  const epoch = ++loadEpoch;
  if (state.status !== "ready") update({ status: "loading" });
  try {
    const result = await listMedia();
    if (epoch !== loadEpoch) return;
    loadedAt = Date.now();
    update(
      result.signedIn
        ? { status: "ready", items: result.items }
        : { status: "signed-out", items: [] },
    );
  } catch {
    if (epoch === loadEpoch) update({ status: "error" });
  }
}

let loadedAt = 0;
function subscribe(listener: () => void) {
  listeners.add(listener);
  // Revisits pick up generations that finished elsewhere since the last load.
  if (
    state.status === "idle" ||
    (listeners.size === 1 && Date.now() - loadedAt > 5000)
  )
    void refreshLibrary();
  return () => listeners.delete(listener);
}

export function useLibrary<T>(select: (state: LibraryState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(initial),
  );
}

const accepted = new Set(UPLOAD_ACCEPT.split(","));
function validate(file: File): string | null {
  if (!accepted.has(file.type))
    return "Use a PNG, JPEG, or WebP image, or an MP4, WebM, or MOV video.";
  const limit = file.type.startsWith("video/")
    ? MAX_VIDEO_BYTES
    : MAX_IMAGE_BYTES;
  if (file.size > limit)
    return `Files of this type can be up to ${limit / 1024 / 1024} MB.`;
  if (file.size === 0) return "This file is empty.";
  return null;
}

/** Queues files; their tiles show progress wherever the library is rendered. */
export function addUploads(files: Iterable<File>): string[] {
  const entries: UploadEntry[] = [];
  for (const file of files) {
    const error = validate(file);
    entries.push({
      key: crypto.randomUUID(),
      file,
      name: file.name || "Untitled",
      kind: file.type.startsWith("video/") ? "video" : "image",
      phase: error ? "failed" : "preparing",
      progress: 0,
      previewUrl: null,
      error,
      retryable: !error,
    });
  }
  if (!entries.length) return [];
  update({ uploads: [...entries, ...state.uploads] });
  pump();
  return entries.map((e) => e.key);
}

/**
 * For embedding features: uploads files and resolves with each stored item,
 * or null where an upload failed (its tile keeps the error and a retry).
 */
export function uploadFiles(
  files: Iterable<File>,
): Promise<(MediaItem | null)[]> {
  const keys = addUploads(files);
  return Promise.all(
    keys.map((key) => {
      const entry = state.uploads.find((u) => u.key === key);
      if (!entry || entry.phase === "failed") return Promise.resolve(null);
      return new Promise<MediaItem | null>((resolve) =>
        waiters.set(key, resolve),
      );
    }),
  );
}

function pump() {
  const running = state.uploads.filter((u) => requests.has(u.key)).length;
  const waiting = state.uploads
    .filter((u) => u.phase === "preparing" && !requests.has(u.key))
    .reverse();
  for (const entry of waiting.slice(0, Math.max(0, CONCURRENCY - running)))
    void run(entry);
}

function send(
  key: string,
  file: File,
  headers: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    // XHR is the only browser API that reports upload progress.
    const xhr = new XMLHttpRequest();
    requests.set(key, xhr);
    xhr.open("POST", "/api/media/upload");
    for (const [name, value] of Object.entries(headers))
      xhr.setRequestHeader(name, value);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        patchUpload(key, { progress: event.loaded / event.total });
    };
    xhr.upload.onload = () => patchUpload(key, { phase: "finishing" });
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.response });
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.send(file);
  });
}

async function run(entry: UploadEntry) {
  requests.set(entry.key, new XMLHttpRequest());
  const probe = await probeMedia(entry.file);
  if (!state.uploads.some((u) => u.key === entry.key)) {
    requests.delete(entry.key);
    return;
  }
  if (
    probe.durationSeconds !== null &&
    probe.durationSeconds > MAX_VIDEO_SECONDS
  ) {
    requests.delete(entry.key);
    patchUpload(entry.key, {
      phase: "failed",
      retryable: false,
      error: `Videos can be up to ${MAX_VIDEO_SECONDS / 60} minutes. Trim it and try again.`,
    });
    settle(entry.key, null);
    pump();
    return;
  }
  const previewUrl = probe.poster
    ? URL.createObjectURL(probe.poster)
    : entry.kind === "image"
      ? URL.createObjectURL(entry.file)
      : null;
  patchUpload(entry.key, { phase: "uploading", progress: 0, previewUrl });
  try {
    const headers: Record<string, string> = {
      "Content-Type": entry.file.type,
      "X-Media-Filename": encodeURIComponent(entry.name),
    };
    if (probe.width) headers["X-Media-Width"] = String(probe.width);
    if (probe.height) headers["X-Media-Height"] = String(probe.height);
    if (probe.durationSeconds)
      headers["X-Media-Duration"] = String(probe.durationSeconds);
    const response = await send(entry.key, entry.file, headers);
    if (response.status !== 201) {
      const message =
        typeof response.body === "object" &&
        response.body &&
        "error" in response.body
          ? String(response.body.error)
          : response.status === 401
            ? "Your session ended. Start a new one and try again."
            : "The upload did not finish. Try again.";
      throw new Error(message);
    }
    const item = mediaItemSchema.parse(response.body);
    if (probe.poster) {
      await fetch(`${item.url}?variant=poster`, {
        method: "PUT",
        headers: { "Content-Type": probe.poster.type },
        body: probe.poster,
        // A missing poster only costs the thumbnail; keep the upload.
      }).catch(() => null);
    }
    requests.delete(entry.key);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    update({
      items: [item, ...state.items],
      uploads: state.uploads.filter((u) => u.key !== entry.key),
      status: "ready",
    });
    settle(entry.key, item);
  } catch (error) {
    requests.delete(entry.key);
    if (!state.uploads.some((u) => u.key === entry.key)) return;
    const message = error instanceof Error ? error.message : "";
    patchUpload(entry.key, {
      phase: "failed",
      error:
        message === "network"
          ? "The connection dropped during upload. Try again."
          : message === "aborted"
            ? "Upload cancelled."
            : message || "The upload did not finish. Try again.",
    });
    settle(entry.key, null);
  } finally {
    pump();
  }
}

export function cancelUpload(key: string) {
  const entry = state.uploads.find((u) => u.key === key);
  const request = requests.get(key);
  if (entry?.phase === "uploading" && request) {
    request.abort();
    return;
  }
  dismissUpload(key);
}
export function dismissUpload(key: string) {
  const entry = state.uploads.find((u) => u.key === key);
  if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  requests.get(key)?.abort();
  requests.delete(key);
  settle(key, null);
  update({ uploads: state.uploads.filter((u) => u.key !== key) });
  pump();
}
export function retryUpload(key: string) {
  const entry = state.uploads.find((u) => u.key === key);
  if (!entry || validate(entry.file)) return;
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
  patchUpload(key, {
    phase: "preparing",
    progress: 0,
    error: null,
    previewUrl: null,
  });
  pump();
}

export async function removeItem(id: string) {
  const previous = state.items;
  update({ items: previous.filter((item) => item.id !== id), notice: null });
  try {
    const result = await deleteMedia({ data: { id } });
    if (!result.ok) throw new Error();
    return true;
  } catch {
    update({
      items: previous,
      notice: "That file could not be deleted. Try again.",
    });
    return false;
  }
}

export function clearNotice() {
  update({ notice: null });
}
