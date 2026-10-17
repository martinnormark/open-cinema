/// <reference lib="webworker" />
import "./shot-checks.worker-globals";
import { ShotDetector } from "./shot-detector";
import type { FrameDetections } from "./shot-checks";

/**
 * Runs face, pose and descriptor models off the main thread so marking a
 * person and reviewing a result stay at 60 fps while a clip is analysed.
 */
export type ShotWorkerRequest =
  | {
      id: number;
      type: "frames";
      frames: { bitmap: ImageBitmap; timeMs: number }[];
    }
  | { id: number; type: "references"; images: ImageBitmap[] };

export type ShotWorkerResponse =
  | {
      id: number;
      ok: true;
      frames?: FrameDetections[];
      embeddings?: number[][];
    }
  | { id: number; ok: false; error: string };

const detector = new ShotDetector();
let queue: Promise<unknown> = Promise.resolve();

async function handle(request: ShotWorkerRequest): Promise<ShotWorkerResponse> {
  try {
    if (request.type === "frames") {
      const frames: FrameDetections[] = [];
      for (const { bitmap, timeMs } of request.frames) {
        frames.push(await detector.frame(bitmap, timeMs));
        bitmap.close();
      }
      return { id: request.id, ok: true, frames };
    }
    const embeddings = await detector.references(request.images);
    for (const image of request.images) image.close();
    return { id: request.id, ok: true, embeddings };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

self.onmessage = (event: MessageEvent<ShotWorkerRequest>) => {
  // One model run at a time; Human is not re-entrant.
  queue = queue.then(async () => self.postMessage(await handle(event.data)));
};
