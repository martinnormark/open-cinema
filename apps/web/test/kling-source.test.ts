// The studio refuses clips Kling cannot edit before any credits are spent.
import { expect, test } from "bun:test";
import {
  checkKlingSource,
  checkCloudRecastSource,
} from "../src/features/revision/model";

const take = { seconds: 6, width: 1280, height: 720, fps: 25, pixelAspect: 1 };

test("says what is wrong with a clip outside it", () => {
  const { problems } = checkKlingSource({
    seconds: 14,
    width: 640,
    height: 360,
    fps: 15,
    pixelAspect: 1,
  });
  expect(problems).toEqual([
    "Kling edits up to 10 seconds; this clip is 14.0 s. Trim it and upload it again.",
    "Kling needs at least 720 pixels on the short side; this clip is 640×360.",
    "Kling takes 24 to 60 frames per second; this clip is 15 fps.",
  ]);
});

test("conforms non-square pixels instead of refusing them", () => {
  const result = checkKlingSource({ ...take, width: 1278, pixelAspect: 0.998 });
  expect(result.problems).toEqual([]);
  expect(result.notes).toHaveLength(1);
});

test("does not hold unknown facts against a clip", () => {
  expect(
    checkKlingSource({
      seconds: null,
      width: null,
      height: null,
      fps: null,
      pixelAspect: null,
    }).problems,
  ).toEqual([]);
});

test("the Cloud recasts take clips of any size, up to their own lengths", () => {
  expect(checkCloudRecastSource("minimax-h3", 12).problems).toEqual([]);
  expect(checkCloudRecastSource("minimax-h3", 1.5).problems[0]).toContain(
    "at least 2 seconds",
  );
  expect(checkCloudRecastSource("minimax-h3", 16).problems[0]).toContain(
    "up to 15 seconds",
  );
  expect(checkCloudRecastSource("wan-scail2", 12).problems[0]).toBe(
    "Wan SCAIL-2 recasts up to 10 seconds; this clip is 12.0 s. Trim it and upload it again.",
  );
});
