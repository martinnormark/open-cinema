import { expect, it } from "vitest";
import {
  workflowExports,
  workflowFileContents,
  workflowManifest,
} from "@open-cinema/comfy";

// Vite's import.meta.glob; its client types are not in this package.
declare global {
  interface ImportMeta {
    glob<T>(
      pattern: string,
      options: { query: string; import: string; eager: true },
    ): Record<string, T>;
  }
}

// The committed workflow files, as text (scripts/export-workflows.ts writes them).
const committed = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../../../workflows/cloud/**/*.json", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  ).map(([path, text]) => [
    path.replace("../../../workflows/cloud/", ""),
    text,
  ]),
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

it("fills every loader the app uploads media to", () => {
  for (const entry of workflowExports())
    for (const input of entry.inputs)
      expect(entry.graph[input.node]?.inputs[input.field]).toBe(input.file);
});
