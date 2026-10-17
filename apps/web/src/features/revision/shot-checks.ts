import { z } from "zod";

/**
 * Recast guardrails from the Phase 0 evidence (docs/phase0-recast.md): Kling
 * 3.0 Omni recasts reliably when the target's face is seen at medium size or
 * larger. It reverses back-view-only targets (U4) and loses likeness on small
 * faces (G5), and nothing reports a weak likeness or a changed bystander. These
 * pure functions turn per-frame detections into those verdicts; detection runs
 * in a worker (shot-checks.worker.ts) and the thresholds are calibrated in
 * evaluation/recast/guardrails.md.
 */

/** Normalized to 0..1 of the frame. */
export const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type Box = z.infer<typeof boxSchema>;

export type Facing = "front" | "side" | "back" | "unknown";

export interface PersonDetection {
  box: Box;
  score: number;
  facing: Facing;
  /** Head height from pose keypoints, for faces too small to detect. */
  headHeight: number | null;
}

export interface FaceDetection {
  box: Box;
  score: number;
  embedding: number[] | null;
}

export interface FrameDetections {
  timeMs: number;
  people: PersonDetection[];
  faces: FaceDetection[];
}

export interface ShotScan {
  width: number;
  height: number;
  durationMs: number;
  frames: FrameDetections[];
}

export interface Keypoint {
  part: string;
  x: number;
  y: number;
  score: number;
}

const KEYPOINT_MIN = 0.35;

/**
 * Which way a person faces, from MoveNet keypoints in frame space. Facing the
 * camera, a person's left shoulder is on the image's right; from behind it is
 * on the left, and the nose and eyes drop out.
 */
export function facingFromKeypoints(keypoints: readonly Keypoint[]): {
  facing: Facing;
  headHeight: number | null;
} {
  const get = (part: string) => {
    const k = keypoints.find((p) => p.part === part);
    return k && k.score >= KEYPOINT_MIN ? k : null;
  };
  const nose = get("nose");
  const eyes = [get("leftEye"), get("rightEye")].filter((k) => k !== null);
  const ears = [get("leftEar"), get("rightEar")].filter((k) => k !== null);
  const ls = get("leftShoulder");
  const rs = get("rightShoulder");

  const faceSeen = !!nose && eyes.length > 0;
  const shoulderSpan = ls && rs ? ls.x - rs.x : null;
  const span = shoulderSpan === null ? 0 : Math.abs(shoulderSpan);
  // Shoulders nearly overlapping means a side view; the order is noise then.
  const order =
    shoulderSpan === null || span < 0.01
      ? null
      : shoulderSpan > 0
        ? "front"
        : "back";

  // MoveNet still places a nose on the back of a head, so shoulder order
  // decides; the face detector, not the pose, says whether a face is seen.
  let facing: Facing = "unknown";
  if (order) facing = order;
  else if (faceSeen) facing = eyes.length === 2 ? "front" : "side";
  else if (ears.length) facing = "side";

  // A head is roughly 1.4 ear spans, or 2.6 eye spans, tall.
  let headHeight: number | null = null;
  if (ears.length === 2)
    headHeight =
      Math.hypot(ears[0]!.x - ears[1]!.x, ears[0]!.y - ears[1]!.y) * 1.4;
  else if (eyes.length === 2)
    headHeight =
      Math.hypot(eyes[0]!.x - eyes[1]!.x, eyes[0]!.y - eyes[1]!.y) * 2.6;
  return { facing, headHeight };
}

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const contains = (b: Box, p: { x: number; y: number }) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function iou(a: Box, b: Box) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const overlap = x * y;
  const union = area(a) + area(b) - overlap;
  return union > 0 ? overlap / union : 0;
}

export function cosine(a: readonly number[], b: readonly number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function median(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The face that belongs to a person: inside the upper part of their box. */
export function faceOf(person: Box, faces: readonly FaceDetection[]) {
  const head: Box = {
    x: person.x - person.w * 0.1,
    y: person.y - person.h * 0.05,
    w: person.w * 1.2,
    h: Math.max(person.h * 0.45, person.w * 0.9),
  };
  let best: FaceDetection | null = null;
  for (const face of faces) {
    if (!contains(head, centre(face.box))) continue;
    if (!best || area(face.box) > area(best.box)) best = face;
  }
  return best;
}

export interface TrackedFrame {
  timeMs: number;
  person: PersonDetection | null;
  face: FaceDetection | null;
}

/**
 * Follows the marked person through the sampled frames: the person under the
 * mark on the nearest frame, then frame to frame by overlap.
 */
export function trackTarget(
  scan: ShotScan,
  mark: { x: number; y: number; timeMs: number },
): TrackedFrame[] | null {
  const { frames } = scan;
  if (!frames.length) return null;
  let anchor = 0;
  for (let i = 1; i < frames.length; i++)
    if (
      Math.abs(frames[i]!.timeMs - mark.timeMs) <
      Math.abs(frames[anchor]!.timeMs - mark.timeMs)
    )
      anchor = i;

  const pick = (people: readonly PersonDetection[]) => {
    const under = people
      .filter((p) => contains(p.box, mark))
      .sort((a, b) => area(a.box) - area(b.box));
    if (under[0]) return under[0];
    let nearest: PersonDetection | null = null;
    for (const p of people)
      if (
        distance(centre(p.box), mark) < 0.15 &&
        (!nearest ||
          distance(centre(p.box), mark) < distance(centre(nearest.box), mark))
      )
        nearest = p;
    return nearest;
  };
  // The mark may sit on a frame where detection missed them; try neighbours.
  let start: PersonDetection | null = null;
  for (const offset of [0, -1, 1, -2, 2]) {
    const frame = frames[anchor + offset];
    if (!frame) continue;
    start = pick(frame.people);
    if (start) {
      anchor += offset;
      break;
    }
  }
  if (!start) return null;

  const tracked: TrackedFrame[] = frames.map((f) => ({
    timeMs: f.timeMs,
    person: null,
    face: null,
  }));
  const follow = (from: number, step: 1 | -1) => {
    let last = start!.box;
    for (let i = from; i >= 0 && i < frames.length; i += step) {
      const people = frames[i]!.people;
      let best: PersonDetection | null = null;
      let bestScore = 0;
      for (const p of people) {
        const overlap = iou(p.box, last);
        const near = 1 - distance(centre(p.box), centre(last)) / 0.25;
        const score = Math.max(overlap, near * 0.5);
        if (score > bestScore) {
          best = p;
          bestScore = score;
        }
      }
      if (best && bestScore >= 0.2) {
        tracked[i]!.person = best;
        tracked[i]!.face = faceOf(best.box, frames[i]!.faces);
        last = best.box;
      }
    }
  };
  tracked[anchor]!.person = start;
  tracked[anchor]!.face = faceOf(start.box, frames[anchor]!.faces);
  follow(anchor + 1, 1);
  follow(anchor - 1, -1);
  return tracked;
}

/** Calibrated on the Phase 0 clips; see evaluation/recast/guardrails.md. */
export const PREFLIGHT_THRESHOLDS = {
  /** Typical (median) face height, as a share of frame height, below which likeness suffers. */
  smallFace: 0.15,
  /** Share of tracked frames seen from behind, with no face, that means back-view-only. */
  backShare: 0.6,
};

export const preflightSchema = z.object({
  verdict: z.enum(["ok", "warn", "refuse", "unmatched"]),
  reasons: z.array(z.enum(["back-view", "small-face", "partly-away"])),
  /** Frames sampled, frames the person was found on, and how they faced. */
  sampled: z.number().int().nonnegative(),
  tracked: z.number().int().nonnegative(),
  faceFrames: z.number().int().nonnegative(),
  backFrames: z.number().int().nonnegative(),
  /** Largest face height seen, as a share of frame height. */
  largestFace: z.number().nullable(),
  /** Median face height over the frames their face was found on. */
  typicalFace: z.number().nullable(),
  /** The person's box on the marked frame. */
  box: boxSchema.nullable(),
});
export type Preflight = z.infer<typeof preflightSchema>;

export function preflight(
  scan: ShotScan,
  mark: { x: number; y: number; timeMs: number },
  thresholds = PREFLIGHT_THRESHOLDS,
): Preflight {
  const track = trackTarget(scan, mark);
  const sampled = scan.frames.length;
  if (!track)
    return {
      verdict: "unmatched",
      reasons: [],
      sampled,
      tracked: 0,
      faceFrames: 0,
      backFrames: 0,
      largestFace: null,
      typicalFace: null,
      box: null,
    };
  const found = track.filter((t) => t.person);
  const faceFrames = found.filter(
    (t) => t.face || t.person!.facing === "front",
  ).length;
  const backFrames = found.filter(
    (t) => !t.face && t.person!.facing === "back",
  ).length;
  const sizes = found
    .map((t) =>
      t.face
        ? t.face.box.h
        : t.person!.facing === "front"
          ? t.person!.headHeight
          : null,
    )
    .filter((s): s is number => s !== null);
  const largestFace = sizes.length ? Math.max(...sizes) : null;
  // The median, not the largest: one close frame on a spin (G5) does not
  // carry the likeness through the rest of the shot.
  // Pose-estimated head sizes are a fallback; they run small on turns.
  const detected = found.flatMap((t) => (t.face ? [t.face.box.h] : []));
  const typicalFace = median(detected.length ? detected : sizes);

  const reasons: Preflight["reasons"] = [];
  let verdict: Preflight["verdict"] = "ok";
  if (
    found.length &&
    faceFrames === 0 &&
    backFrames / found.length >= thresholds.backShare
  ) {
    verdict = "refuse";
    reasons.push("back-view");
  } else {
    if (typicalFace !== null && typicalFace < thresholds.smallFace)
      reasons.push("small-face");
    if (found.length && backFrames / found.length >= 0.5)
      reasons.push("partly-away");
    if (faceFrames === 0 && largestFace === null) reasons.push("small-face");
    if (reasons.length) verdict = "warn";
  }
  const marked = track.find((t) => t.person);
  return {
    verdict,
    reasons: [...new Set(reasons)],
    sampled,
    tracked: found.length,
    faceFrames,
    backFrames,
    largestFace,
    typicalFace,
    box: marked?.person?.box ?? null,
  };
}

/** Face-embedding similarity (Human faceres, cosine); calibrated in guardrails.md. */
export const RESULT_THRESHOLDS = {
  /** Below this the recast face does not read as the Character. */
  weakLikeness: 0.5,
  /** At or above this the likeness is strong rather than fair. */
  strongLikeness: 0.62,
  /** At or above this the marked face still matches the source person. */
  unchanged: 0.62,
  /** Below this a bystander no longer matches themselves. */
  bystanderChanged: 0.5,
  /** At or above this, and above their own match, a bystander now reads as the Character. */
  tookCharacter: 0.55,
  /** At or above this a source face is the target again, e.g. after an occlusion. */
  samePerson: 0.6,
};

export const resultChecksSchema = z.object({
  version: z.literal(1),
  checkedAt: z.string(),
  /** Median similarity of the recast face to the Character's references. */
  likeness: z.number().nullable(),
  /** Median similarity of the recast face to the person it replaced. */
  sourceSimilarity: z.number().nullable(),
  likenessVerdict: z.enum(["strong", "fair", "weak", "unmeasured"]),
  targetChanged: z.enum(["yes", "no", "unmeasured"]),
  bystanders: z.array(
    z.object({
      similarity: z.number(),
      changed: z.boolean(),
      /** Median match of their result face to the Character's references. */
      characterSimilarity: z.number().nullable().default(null),
      /** Their face in the source, for pointing at them. */
      box: boxSchema,
      timeMs: z.number(),
    }),
  ),
  /** A bystander who now reads as the Character more than as themselves: the wrong person recast. */
  wrongPerson: z.boolean(),
  framesCompared: z.number().int().nonnegative(),
});
export type ResultChecks = z.infer<typeof resultChecksSchema>;

/** The result face in the same place as a source face, if one was detected. */
function sameSpotFace(faces: readonly FaceDetection[], box: Box) {
  let best: FaceDetection | null = null;
  let bestOverlap = 0.25;
  for (const f of faces) {
    const overlap = iou(f.box, box);
    if (f.embedding && overlap >= bestOverlap) {
      best = f;
      bestOverlap = overlap;
    }
  }
  return best;
}

/**
 * Compares the result with its source at matched moments: does the marked
 * person now read as the Character, and did anyone else change?
 */
export function checkResult(
  source: ShotScan,
  result: ShotScan,
  mark: { x: number; y: number; timeMs: number },
  character: readonly number[][],
  thresholds = RESULT_THRESHOLDS,
  now = new Date(),
): ResultChecks {
  const track = trackTarget(source, mark);
  const likeness: number[] = [];
  const stillSource: number[] = [];
  const toCharacter = (e: readonly number[]) =>
    character.length ? Math.max(...character.map((c) => cosine(e, c))) : null;

  // Bystanders are followed by face position so each person reports once.
  const bystanders: {
    box: Box;
    timeMs: number;
    sims: number[];
    towardCharacter: number[];
  }[] = [];
  // The target's own faces, so they are not mistaken for a bystander on
  // frames where tracking lost them (G3, behind a pillar).
  const targetFaces = (track ?? []).flatMap((t) =>
    t.face?.embedding ? [t.face.embedding] : [],
  );
  const isTarget = (e: readonly number[]) =>
    targetFaces.some((t) => cosine(e, t) >= thresholds.samePerson);
  const pairs = Math.min(source.frames.length, result.frames.length);
  let framesCompared = 0;
  for (let i = 0; i < pairs; i++) {
    const s = source.frames[i]!;
    const r = result.frames[i]!;
    framesCompared++;
    const target = track?.[i];
    const targetPerson = target?.person?.box ?? null;
    const targetFace = target?.face ?? null;

    const found = targetPerson
      ? faceOf(
          targetPerson,
          r.faces.filter((f) => f.embedding),
        )
      : null;
    if (found?.embedding) {
      const sim = toCharacter(found.embedding);
      if (sim !== null) likeness.push(sim);
      if (targetFace?.embedding)
        stillSource.push(cosine(found.embedding, targetFace.embedding));
    }

    for (const face of s.faces) {
      if (!face.embedding || face === targetFace || isTarget(face.embedding))
        continue;
      if (targetPerson && faceOf(targetPerson, [face]) === face) continue;
      // The recast face is never a bystander's match, even when nearby.
      const match = sameSpotFace(
        r.faces.filter((f) => f !== found),
        face.box,
      );
      if (!match?.embedding) continue;
      const sim = cosine(face.embedding, match.embedding);
      const toward = toCharacter(match.embedding);
      let entry = bystanders.find(
        (b) =>
          distance(centre(b.box), centre(face.box)) <
          Math.max(face.box.w, 0.05) * 1.5,
      );
      if (!entry) {
        entry = {
          box: face.box,
          timeMs: s.timeMs,
          sims: [],
          towardCharacter: [],
        };
        bystanders.push(entry);
      }
      entry.box = face.box;
      entry.sims.push(sim);
      if (toward !== null) entry.towardCharacter.push(toward);
    }
  }

  const like = median(likeness);
  const src = median(stillSource);
  // One frame is not enough to say a person changed; a missed or misplaced
  // detection on a single frame would otherwise read as a recast.
  const minFrames = Math.min(2, framesCompared);
  const others = bystanders
    .filter((b) => b.sims.length >= minFrames)
    .map((b) => {
      const similarity = median(b.sims)!;
      const toward = median(b.towardCharacter);
      // Kling recast the wrong woman on a live U2 run; she still matched
      // herself at 0.53 but matched Mara better.
      const tookCharacter =
        toward !== null &&
        toward >= thresholds.tookCharacter &&
        toward > similarity;
      return {
        similarity,
        changed: similarity < thresholds.bystanderChanged || tookCharacter,
        box: b.box,
        timeMs: b.timeMs,
        toward,
        tookCharacter,
      };
    });
  const wrongPerson = others.some((b) => b.tookCharacter);
  return {
    version: 1,
    checkedAt: now.toISOString(),
    likeness: like,
    sourceSimilarity: src,
    likenessVerdict:
      like === null
        ? "unmeasured"
        : like < thresholds.weakLikeness
          ? "weak"
          : like < thresholds.strongLikeness
            ? "fair"
            : "strong",
    targetChanged:
      src === null ? "unmeasured" : src >= thresholds.unchanged ? "no" : "yes",
    bystanders: others.map(({ toward, tookCharacter: _took, ...rest }) => ({
      ...rest,
      characterSimilarity: toward,
    })),
    wrongPerson,
    framesCompared,
  };
}

/** Evenly spaced sample times, away from the first and last frame. */
export function sampleTimes(durationMs: number, count: number) {
  const n = Math.max(1, count);
  return Array.from({ length: n }, (_, i) =>
    Math.round(((i + 0.5) / n) * durationMs),
  );
}
