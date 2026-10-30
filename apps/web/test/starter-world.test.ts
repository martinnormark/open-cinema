// The starter world ships as files in public/; a renamed or re-encoded file
// must not leave the import pointing at nothing.
import { expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { readWorldManifest } from "@open-cinema/contracts";
import { goals } from "../src/features/start/goals";
import {
  SAMPLE_TAKE,
  STARTER_BASE,
  starterManifest,
} from "../src/features/start/starter-world";

const PUBLIC = join(import.meta.dir, "..", "public");

test("every starter file is shipped, at the size the manifest says", () => {
  const manifest = readWorldManifest(starterManifest);
  for (const media of manifest.media) {
    const file = join(PUBLIC, STARTER_BASE, media.path);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBe(media.sizeBytes!);
  }
  expect(manifest.media.some((m) => m.path === SAMPLE_TAKE.path)).toBe(true);
});

test("every take goal has an example loop and its still", () => {
  for (const goal of goals.filter((g) => g.source === "take"))
    for (const ext of ["mp4", "jpg"])
      expect(existsSync(join(PUBLIC, "examples", `${goal.id}.${ext}`))).toBe(
        true,
      );
});
