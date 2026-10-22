/// <reference lib="webworker" />
import {
  convertToSquarePixels,
  trimClip,
  readVideo,
  type PosterFrame,
  type VideoFacts,
} from "./video-frames";

/**
 * Runs Mediabunny off the main thread: demuxing, decoding, resizing and
 * muxing a clip would otherwise cost frames while an upload's tile animates.
 */
export type VideoWorkerRequest =
  | { id: number; type: "read"; source: Blob | string }
  | { id: number; type: "square"; file: File }
  | {
      id: number;
      type: "trim";
      source: Blob | string;
      start: number;
      end: number;
      name: string;
    };

export type VideoWorkerResponse =
  | {
      id: number;
      ok: true;
      type: "read";
      facts: VideoFacts;
      poster: PosterFrame | null;
    }
  | {
      id: number;
      ok: true;
      type: "square";
      bytes: ArrayBuffer;
      name: string;
      width: number;
      height: number;
    }
  | { id: number; ok: true; type: "trim"; bytes: ArrayBuffer; name: string }
  | { id: number; type: "progress"; progress: number }
  | { id: number; ok: false; type: "error"; error: string };

async function handle(request: VideoWorkerRequest) {
  try {
    if (request.type === "read") {
      const { poster, ...facts } = await readVideo(request.source);
      self.postMessage({
        id: request.id,
        ok: true,
        type: "read",
        facts,
        poster,
      } satisfies VideoWorkerResponse);
      return;
    }
    const progress = (progress: number) =>
      self.postMessage({
        id: request.id,
        type: "progress",
        progress,
      } satisfies VideoWorkerResponse);
    if (request.type === "trim") {
      const file = await trimClip(
        request.source,
        request.start,
        request.end,
        request.name,
        progress,
      );
      const bytes = await file.arrayBuffer();
      self.postMessage(
        {
          id: request.id,
          ok: true,
          type: "trim",
          bytes,
          name: file.name,
        } satisfies VideoWorkerResponse,
        [bytes],
      );
      return;
    }
    const squared = await convertToSquarePixels(request.file, progress);
    const bytes = await squared.file.arrayBuffer();
    self.postMessage(
      {
        id: request.id,
        ok: true,
        type: "square",
        bytes,
        name: squared.file.name,
        width: squared.width,
        height: squared.height,
      } satisfies VideoWorkerResponse,
      [bytes],
    );
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    } satisfies VideoWorkerResponse);
  }
}

self.onmessage = (event: MessageEvent<VideoWorkerRequest>) =>
  void handle(event.data);
