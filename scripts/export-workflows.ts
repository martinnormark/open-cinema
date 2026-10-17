/**
 * Writes every ComfyUI graph the app runs on Comfy Cloud to workflows/cloud/,
 * from the same builders the jobs Worker calls, plus a manifest of each file's
 * inputs, outputs and model files.
 *
 *   bun scripts/export-workflows.ts          # write the files
 *   bun scripts/export-workflows.ts --check  # exit 1 when a file is stale or missing
 *
 * `apps/jobs/test/workflow-exports.test.ts` runs the same comparison in
 * `bun run check`.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  workflowExports,
  workflowFileContents,
  workflowManifest,
} from "../packages/comfy/src/workflows/exports";

const root = join(import.meta.dir, "..", "workflows", "cloud");
const check = process.argv.includes("--check");

const expected = new Map<string, string>();
for (const entry of workflowExports())
  expected.set(entry.file, workflowFileContents(entry));
expected.set("manifest.json", workflowManifest());

async function existing(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? existing(join(dir, e.name))
        : Promise.resolve([join(dir, e.name)]),
    ),
  );
  return files.flat();
}
const onDisk = (await existing(root))
  .map((f) => relative(root, f))
  .filter((f) => f.endsWith(".json"));

if (check) {
  const problems: string[] = [];
  for (const [file, contents] of expected) {
    const current = await readFile(join(root, file), "utf8").catch(() => null);
    if (current === null) problems.push(`missing ${file}`);
    else if (current !== contents) problems.push(`stale ${file}`);
  }
  for (const file of onDisk)
    if (!expected.has(file)) problems.push(`not generated ${file}`);
  if (problems.length) {
    console.error(problems.join("\n"));
    console.error("Run `bun scripts/export-workflows.ts` to regenerate.");
    process.exit(1);
  }
  console.log(`${expected.size} workflow files are up to date.`);
} else {
  for (const file of onDisk)
    if (!expected.has(file)) await rm(join(root, file));
  for (const [file, contents] of expected) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), contents);
  }
  console.log(
    `Wrote ${expected.size} files to ${relative(process.cwd(), root)}/`,
  );
}
