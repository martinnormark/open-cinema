import { expect, it } from "bun:test";
import {
  workflowExports,
  workflowFileContents,
  workflowManifest,
} from "@open-cinema/comfy";

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(
  new URL("../../../workflows/cloud/", import.meta.url),
);
const committed = Object.fromEntries(
  readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".json"))
    .map((path) => [path, readFileSync(join(root, path), "utf8")]),
);

const STALE = "run `bun scripts/export-workflows.ts` and commit the result";

it("commits every Cloud graph exactly as the Worker builds it", () => {
  const exports = workflowExports();
  for (const entry of exports)
    expect(committed[entry.file], `${entry.file}: ${STALE}`).toBe(
      workflowFileContents(entry),
    );
  expect(committed["manifest.json"], `manifest.json: ${STALE}`).toBe(
    workflowManifest(),
  );
  expect(Object.keys(committed).sort()).toEqual(
    [...exports.map((e) => e.file), "manifest.json"].sort(),
  );
});
