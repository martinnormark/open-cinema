// The studio refuses clips Kling cannot edit before any credits are spent, and
// says what the job changes on the way for clips it can fix.
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
    "Kling takes 24 to 60 frames per second; this clip is 15 fps.",
  ]);
});

test("enlarges a clip under 720 pixels instead of refusing it", () => {
  const result = checkKlingSource({
    ...take,
    seconds: 3,
    width: 1024,
    height: 576,
  });
  expect(result.problems).toEqual([]);
  expect(result.notes).toEqual([
    "This clip is 1024×576, under the 720 pixels Kling needs on the short side. It is enlarged to 1280×720 first; the result comes back at the clip's own size.",
  ]);
  // A clip that already passes is sent as it is.
  expect(checkKlingSource(take).notes).toEqual([]);
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
