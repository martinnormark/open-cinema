/**
 * Runs one media step (lock, conform or square; see
 * packages/comfy/src/workflows/media-graphs.ts) on a ComfyUI server and saves
 * its MP4, to check the graphs without the jobs Worker.
 *
 *   bun scripts/media-graph.ts <server> <operation> <out.mp4> source=<file> [edit=<file>] [matte=<file>] [sar=<pixel aspect>]
 *
 * <server> is a local ComfyUI with ComfyUI-VideoHelperSuite installed
 * (http://127.0.0.1:8188), or Comfy Cloud through the development relay
 * (http://127.0.0.1:8790, see docs/foundation.md). A Cloud run spends credits.
 */
import { mediaGraph } from "../packages/comfy/src/workflows/media-graphs";
import type { MediaOperation } from "../packages/comfy/src/workflows/types";

const [server, operation, out, ...rest] = process.argv.slice(2);
if (!server || !operation || !out) {
  console.error(
    "usage: bun scripts/media-graph.ts <server> lock|conform|square <out.mp4> source=<file> [edit=<file>] [matte=<file>] [sar=<n>]",
  );
  process.exit(1);
}
const args = Object.fromEntries(rest.map((a) => a.split("=", 2)));
const files: Record<string, string> = {};
for (const name of ["source", "edit", "matte"]) {
  const path = args[name];
  if (!path) continue;
  const form = new FormData();
  form.append("type", "input");
  form.append("overwrite", "true");
  form.append(
    "image",
    Bun.file(path),
    `${name}-${crypto.randomUUID()}.${path.split(".").pop()}`,
  );
  const response = await fetch(`${server}/api/upload/image`, {
    method: "POST",
    body: form,
  });
  const uploaded = (await response.json()) as {
    name: string;
    subfolder?: string;
  };
  if (!response.ok) throw new Error(`upload ${name}: ${response.status}`);
  files[name] = uploaded.subfolder
    ? `${uploaded.subfolder}/${uploaded.name}`
    : uploaded.name;
}
const graph = mediaGraph({
  operation: operation as MediaOperation,
  files,
  pixelAspect: args.sar ? Number(args.sar) : null,
});
const started = Date.now();
const submitted = await fetch(`${server}/api/prompt`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: graph }),
});
const { prompt_id: id, ...rejected } = (await submitted.json()) as {
  prompt_id?: string;
};
if (!id) throw new Error(`prompt: ${JSON.stringify(rejected).slice(0, 2000)}`);
type Job = {
  status: string;
  outputs?: Record<
    string,
    { images?: { filename: string; subfolder?: string }[] }
  >;
};
let job: Job;
for (;;) {
  job = (await (await fetch(`${server}/api/jobs/${id}`)).json()) as Job;
  if (["completed", "failed", "cancelled", "error"].includes(job.status)) break;
  await Bun.sleep(1500);
}
console.log(`${job.status} in ${(Date.now() - started) / 1000} s (${id})`);
const file = job.outputs?.save?.images?.[0];
if (job.status !== "completed" || !file) {
  console.log(JSON.stringify(job).slice(0, 3000));
  process.exit(1);
}
const query = new URLSearchParams({
  filename: file.filename,
  subfolder: file.subfolder ?? "",
  type: "output",
});
const view = await fetch(`${server}/api/view?${query}`);
await Bun.write(out, await view.arrayBuffer());
console.log(`wrote ${out}`);
