// Recast guardrails: the pre-flight verdicts and post-run checks from detections.
import { expect, test } from "bun:test";
import {
  checkResult,
  facingFromKeypoints,
  preflight,
  type FaceDetection,
  type FrameDetections,
  type PersonDetection,
  type ShotScan,
} from "../src/features/revision/shot-checks";

const kp = (part: string, x: number, y: number, score = 0.8) => ({
  part,
  x,
  y,
  score,
});

test("shoulder order tells a person facing the camera from one walking away", () => {
  // Facing the camera, their left shoulder is on the image's right.
  const front = facingFromKeypoints([
    kp("nose", 0.5, 0.2),
    kp("leftEye", 0.52, 0.18),
    kp("rightEye", 0.48, 0.18),
    kp("leftShoulder", 0.6, 0.35),
    kp("rightShoulder", 0.4, 0.35),
  ]);
  expect(front.facing).toBe("front");
  expect(front.headHeight).toBeCloseTo(0.104, 2);
  // MoveNet still places a nose on the back of a head (U4); shoulders decide.
  const back = facingFromKeypoints([
    kp("nose", 0.5, 0.2, 0.6),
    kp("leftEye", 0.52, 0.18, 0.5),
    kp("leftShoulder", 0.4, 0.35),
    kp("rightShoulder", 0.6, 0.35),
  ]);
  expect(back.facing).toBe("back");
});

const person = (
  x: number,
  facing: PersonDetection["facing"],
  h = 0.8,
): PersonDetection => ({
  box: { x, y: 0.1, w: 0.2, h },
  score: 0.6,
  facing,
  headHeight: null,
});
const face = (x: number, h: number, embedding: number[]): FaceDetection => ({
  box: { x: x + 0.05, y: 0.12, w: h * 0.56, h },
  score: 0.8,
  embedding,
});
const scan = (frames: Omit<FrameDetections, "timeMs">[]): ShotScan => ({
  width: 960,
  height: 540,
  durationMs: 5000,
  frames: frames.map((f, i) => ({ ...f, timeMs: 250 + i * 500 })),
});
const mark = { x: 0.3, y: 0.5, timeMs: 0 };

// Orthogonal unit-ish vectors stand in for face descriptors.
const id = (n: number) =>
  Array.from({ length: 8 }, (_, i) => (i === n ? 1 : 0.05));
const SOURCE_TARGET = id(0);
const BYSTANDER = id(1);
const CHARACTER = id(2);
const OTHER = id(3);

test("refuses a target only ever seen from behind, as in U4", () => {
  const shot = scan(
    Array.from({ length: 10 }, () => ({
      people: [person(0.2, "back"), person(0.6, "back")],
      faces: [],
    })),
  );
  expect(preflight(shot, mark)).toMatchObject({
    verdict: "refuse",
    reasons: ["back-view"],
    tracked: 10,
    faceFrames: 0,
  });
});

test("warns when the target's face stays small, and passes a clear medium face", () => {
  const small = scan(
    Array.from({ length: 10 }, () => ({
      people: [person(0.2, "front", 0.5)],
      faces: [face(0.2, 0.06, SOURCE_TARGET)],
    })),
  );
  expect(preflight(small, mark)).toMatchObject({
    verdict: "warn",
    reasons: ["small-face"],
  });
  const clear = scan(
    Array.from({ length: 10 }, (_, i) => ({
      people: [person(0.2, i < 5 ? "front" : "side")],
      faces: [face(0.2, 0.25, SOURCE_TARGET)],
    })),
  );
  expect(preflight(clear, mark)).toMatchObject({
    verdict: "ok",
    reasons: [],
    faceFrames: 10,
  });
});

test("says when nobody is under the mark", () => {
  const empty = scan([{ people: [person(0.7, "front")], faces: [] }]);
  expect(preflight(empty, mark).verdict).toBe("unmatched");
});

const source = scan(
  Array.from({ length: 10 }, () => ({
    people: [person(0.2, "front"), person(0.6, "front")],
    faces: [face(0.2, 0.25, SOURCE_TARGET), face(0.6, 0.25, BYSTANDER)],
  })),
);
const resultWith = (target: number[], bystander: number[]) =>
  scan(
    Array.from({ length: 10 }, () => ({
      people: [person(0.2, "front"), person(0.6, "front")],
      faces: [face(0.2, 0.25, target), face(0.6, 0.25, bystander)],
    })),
  );

test("a clean recast reads as the Character and leaves the bystander alone", () => {
  const checks = checkResult(source, resultWith(CHARACTER, BYSTANDER), mark, [
    CHARACTER,
  ]);
  expect(checks).toMatchObject({
    likenessVerdict: "strong",
    targetChanged: "yes",
    wrongPerson: false,
    framesCompared: 10,
  });
  expect(checks.bystanders).toHaveLength(1);
  expect(checks.bystanders[0]!.changed).toBe(false);
});

test("flags a weak likeness and an unchanged target", () => {
  const checks = checkResult(
    source,
    resultWith(SOURCE_TARGET, BYSTANDER),
    mark,
    [CHARACTER],
  );
  expect(checks.likenessVerdict).toBe("weak");
  expect(checks.targetChanged).toBe("no");
});

test("flags the wrong person recast, as Kling O1 did on U1", () => {
  const checks = checkResult(source, resultWith(OTHER, CHARACTER), mark, [
    CHARACTER,
  ]);
  expect(checks.bystanders[0]!.changed).toBe(true);
  expect(checks.wrongPerson).toBe(true);
});

test("a bystander the result loses is not matched to the recast face beside them", () => {
  // U1 on Kling 3.0: the man's face goes undetected and sits next to the recast face.
  const near = scan(
    Array.from({ length: 10 }, () => ({
      people: [person(0.2, "front")],
      faces: [face(0.2, 0.25, SOURCE_TARGET), face(0.06, 0.25, BYSTANDER)],
    })),
  );
  const lost = scan(
    Array.from({ length: 10 }, () => ({
      people: [person(0.2, "front")],
      faces: [face(0.2, 0.25, CHARACTER)],
    })),
  );
  const checks = checkResult(near, lost, mark, [CHARACTER]);
  expect(checks.bystanders).toEqual([]);
  expect(checks.wrongPerson).toBe(false);
});
