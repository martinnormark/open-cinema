import { useSyncExternalStore } from "react";
import {
  checkResult,
  sampleTimes,
  type ResultChecks,
  type ShotScan,
} from "./shot-checks";
import type {
  ShotWorkerRequest,
  ShotWorkerResponse,
} from "./shot-checks.worker";

/**
 * Main-thread side of the recast checks: seeks a detached video to a few
 * moments, hands the frames to the checks worker, and keeps one scan per clip.
 * Only seeking and `createImageBitmap` run here, both asynchronous.
 */
export const SAMPLE_FRAMES = 10;
/** Detection runs at this width; faces under ~20 px are re-checked closer. */
const SAMPLE_WIDTH = 960;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (response: ShotWorkerResponse) => void>();

type Unsent<T> = T extends unknown ? Omit<T, "id"> : never;

function call(request: Unsent<ShotWorkerRequest>, transfer: Transferable[]) {
  worker ??= (() => {
    const w = new Worker(new URL("./shot-checks.worker.ts", import.meta.url), {
      type: "module",
      name: "shot-checks",
    });
    w.onmessage = (event: MessageEvent<ShotWorkerResponse>) => {
      pending.get(event.data.id)?.(event.data);
      pending.delete(event.data.id);
    };
    w.onerror = () => {
      for (const [id, resolve] of pending)
        resolve({ id, ok: false, error: "The checks worker stopped." });
      pending.clear();
      worker = null;
    };
    return w;
  })();
  const id = nextId++;
  return new Promise<ShotWorkerResponse>((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ ...request, id }, transfer);
  });
}

function once(target: HTMLVideoElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
      reject(new Error("This clip could not be decoded for checking."));
    };
    target.addEventListener(event, done);
    target.addEventListener("error", fail);
  });
}

type Times = readonly number[] | ((durationMs: number) => readonly number[]);

/** Frames at `times` (ms), or evenly spaced when omitted. */
export async function sampleFrames(url: string, times?: Times) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await once(video, "loadeddata");
    const durationMs = Math.round(video.duration * 1000);
    const at =
      typeof times === "function"
        ? times(durationMs)
        : (times ?? sampleTimes(durationMs, SAMPLE_FRAMES));
    const scale = Math.min(1, SAMPLE_WIDTH / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);
    const frames: { bitmap: ImageBitmap; timeMs: number }[] = [];
    for (const timeMs of at) {
      const seeked = once(video, "seeked");
      video.currentTime = Math.min(video.duration, timeMs / 1000);
      await seeked;
      frames.push({
        timeMs,
        bitmap: await createImageBitmap(video, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: "medium",
        }),
      });
    }
    return { frames, width, height, durationMs };
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export async function scanClip(url: string, times?: Times): Promise<ShotScan> {
  const sampled = await sampleFrames(url, times);
  const response = await call(
    { type: "frames", frames: sampled.frames },
    sampled.frames.map((f) => f.bitmap),
  );
  if (!response.ok) throw new Error(response.error);
  return {
    width: sampled.width,
    height: sampled.height,
    durationMs: sampled.durationMs,
    frames: response.frames ?? [],
  };
}

export async function referenceEmbeddings(urls: readonly string[]) {
  const images = await Promise.all(
    urls.map(async (url) => createImageBitmap(await (await fetch(url)).blob())),
  );
  const response = await call({ type: "references", images }, images);
  if (!response.ok) throw new Error(response.error);
  return response.embeddings ?? [];
}

/** One scan per clip URL, shared by every component that asks. */
export type ScanState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "ready"; scan: ShotScan }
  | { status: "failed"; error: string };

const IDLE: ScanState = { status: "idle" };
const scans = new Map<string, ScanState>();
const listeners = new Set<() => void>();

function set(url: string, next: ScanState) {
  scans.set(url, next);
  for (const listener of listeners) listener();
}

/** Starts scanning a clip unless it is already scanned or under way. */
export function requestScan(url: string) {
  const current = scans.get(url);
  if (current && current.status !== "failed") return;
  set(url, { status: "scanning" });
  scanClip(url).then(
    (scan) => set(url, { status: "ready", scan }),
    (error: unknown) =>
      set(url, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      }),
  );
}

export function useShotScan(url: string | null): ScanState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (url ? (scans.get(url) ?? IDLE) : IDLE),
    () => IDLE,
  );
}

/** Post-run checks per revision; one run per result, then persisted. */
export type ResultCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready"; checks: ResultChecks }
  | { status: "failed"; error: string };

const results = new Map<string, ResultCheckState>();

function setResult(id: string, next: ResultCheckState) {
  results.set(id, next);
  for (const listener of listeners) listener();
}

export function requestResultChecks(o: {
  revisionId: string;
  sourceUrl: string;
  resultUrl: string;
  mark: { x: number; y: number; timeMs: number };
  referenceUrls: readonly string[];
  save: (checks: ResultChecks) => Promise<unknown>;
}) {
  const current = results.get(o.revisionId);
  if (current && current.status !== "failed") return;
  setResult(o.revisionId, { status: "checking" });
  (async () => {
    const [source, character] = await Promise.all([
      scanClip(o.sourceUrl),
      referenceEmbeddings(o.referenceUrls),
    ]);
    // Providers retime clips; compare the same proportional moments.
    const result = await scanClip(o.resultUrl, (durationMs) =>
      source.frames.map((f) =>
        Math.round((f.timeMs / source.durationMs) * durationMs),
      ),
    );
    const checks = checkResult(source, result, o.mark, character);
    setResult(o.revisionId, { status: "ready", checks });
    await o.save(checks).catch(() => undefined);
  })().catch((error: unknown) =>
    setResult(o.revisionId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}

export function useResultChecks(revisionId: string): ResultCheckState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => results.get(revisionId) ?? IDLE_RESULT,
    () => IDLE_RESULT,
  );
}
const IDLE_RESULT: ResultCheckState = { status: "idle" };
