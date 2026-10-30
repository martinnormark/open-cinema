import { Human, type Config, type FaceResult } from "@vladmandic/human";
import {
  facingFromKeypoints,
  faceOf,
  type Box,
  type FaceDetection,
  type FrameDetections,
  type PersonDetection,
} from "./shot-checks";

/**
 * Detection for the recast checks with Human (MIT; models:
 * BlazeFace, FaceMesh, FaceRes descriptors, MoveNet MultiPose). Runs where an
 * OffscreenCanvas exists: the checks worker, or a page in the offline harness.
 * Models are served from the app (scripts/human-models.ts), never a CDN.
 */
export const MODEL_BASE = "/models/human/";

const off = { enabled: false };
const fresh = { skipFrames: 0, skipTime: 0 };

function baseConfig(modelBasePath: string): Partial<Config> {
  return {
    modelBasePath,
    backend: "humangl",
    warmup: "none",
    cacheSensitivity: 0,
    debug: false,
    filter: { enabled: false } as Config["filter"],
    gesture: off,
    hand: off as Config["hand"],
    segmentation: off as Config["segmentation"],
    face: {
      enabled: true,
      detector: {
        ...fresh,
        enabled: true,
        modelPath: "blazeface.json",
        rotation: false,
        maxDetected: 12,
        minConfidence: 0.35,
        minSize: 0,
        iouThreshold: 0.1,
        scale: 1.4,
        square: false,
        mask: false,
        return: false,
      },
      mesh: {
        ...fresh,
        enabled: true,
        modelPath: "facemesh.json",
        keepInvalid: false,
      },
      attention: off as Config["face"]["attention"],
      iris: off as Config["face"]["iris"],
      description: {
        ...fresh,
        enabled: true,
        modelPath: "faceres.json",
        minConfidence: 0.1,
      },
      emotion: off as Config["face"]["emotion"],
      antispoof: off as Config["face"]["antispoof"],
      liveness: off as Config["face"]["liveness"],
    } as Config["face"],
    // MoveNet MultiPose: up to six people, each with a box and keypoints.
    body: {
      ...fresh,
      enabled: true,
      modelPath: "movenet-multipose.json",
      maxDetected: 6,
      minConfidence: 0.2,
    } as Config["body"],
    object: off as Config["object"],
  };
}

type Canvas = OffscreenCanvas;
type Source = ImageBitmap | OffscreenCanvas;

function crop(source: Source, box: Box, size: number): Canvas {
  const w = source.width;
  const h = source.height;
  const sx = Math.max(0, box.x * w);
  const sy = Math.max(0, box.y * h);
  const sw = Math.min(w - sx, box.w * w);
  const sh = Math.min(h - sy, box.h * h);
  const scale = size / Math.max(sw, sh);
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(sw * scale)),
    Math.max(1, Math.round(sh * scale)),
  );
  canvas
    .getContext("2d")!
    .drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBox = ([x, y, w, h]: [number, number, number, number]): Box => ({
  x,
  y,
  w,
  h,
});

/** Maps a crop-relative 0..1 box back to frame space. */
const unCrop = (inner: Box, region: Box): Box => ({
  x: region.x + inner.x * region.w,
  y: region.y + inner.y * region.h,
  w: inner.w * region.w,
  h: inner.h * region.h,
});

function face(result: FaceResult, region?: Box): FaceDetection {
  const box = toBox(result.boxRaw);
  return {
    box: region ? unCrop(box, region) : box,
    score: result.boxScore,
    embedding: result.embedding?.length ? Array.from(result.embedding) : null,
  };
}

export class ShotDetector {
  private human: Human;
  private ready: Promise<void> | null = null;

  constructor(modelBasePath = MODEL_BASE) {
    this.human = new Human(baseConfig(modelBasePath));
  }

  load() {
    this.ready ??= (async () => {
      try {
        await this.human.load();
      } catch {
        // No WebGL in this context: fall back to the CPU backend.
        this.human.config.backend = "cpu";
        await this.human.load();
      }
    })();
    return this.ready;
  }

  /** People with facing, and faces with descriptors, on one frame. */
  async frame(source: Source, timeMs: number): Promise<FrameDetections> {
    await this.load();
    // Human merges per-call options into its config, so every call sets both.
    const full = await this.human.detect(source, { body: { enabled: true } });
    const people: PersonDetection[] = [];
    const faces: FaceDetection[] = full.face.map((f) => face(f));
    for (const body of full.body) {
      const box = toBox(body.boxRaw);
      const keypoints = body.keypoints.map((k) => ({
        part: k.part,
        x: k.positionRaw[0],
        y: k.positionRaw[1],
        score: k.score,
      }));
      const { facing, headHeight, head } = facingFromKeypoints(keypoints);
      people.push({ box, score: body.score, facing, headHeight, head });

      // Small faces vanish at the detector's input size; look again, closer.
      if (!faceOf(box, faces) && facing !== "back") {
        const head: Box = {
          x: Math.max(0, box.x - box.w * 0.15),
          y: Math.max(0, box.y - box.h * 0.05),
          w: Math.min(1, box.w * 1.3),
          h: Math.min(1, Math.max(box.h * 0.4, box.w)),
        };
        const near = await this.human.detect(crop(source, head, 320), {
          body: { enabled: false },
        });
        for (const f of near.face) faces.push(face(f, head));
      }
    }
    return { timeMs, people, faces };
  }

  /** Descriptors of the main face in each reference image. */
  async references(images: readonly Source[]): Promise<number[][]> {
    await this.load();
    const out: number[][] = [];
    for (const image of images) {
      const result = await this.human.detect(image, {
        body: { enabled: false },
      });
      const main = [...result.face].sort(
        (a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3],
      )[0];
      if (main?.embedding?.length) out.push(Array.from(main.embedding));
    }
    return out;
  }
}
