/**
 * Runs one of the open-weights LTX graphs (camera move, re-stage, Object
 * Swap, Restyle) on a ComfyUI server and saves every output, to check a graph
 * without the jobs Worker.
 *
 *   bun scripts/ltx-graph.ts <server> <out-dir> camera move=dolly-in prompt="..." [image=<file>] [seconds=3] [side=512]
 *   bun scripts/ltx-graph.ts <server> <out-dir> restage source=<clip> angle=from-left [prompt="..."] [frames=49] [side=512]
 *   bun scripts/ltx-graph.ts <server> <out-dir> restyle source=<clip> ref=<img>[,<img>] prompt="..." [style="..."]
 *   bun scripts/ltx-graph.ts <server> <out-dir> swap source=<clip> ref=<img> original="a red mug" replacement="a brass lantern" [name="Lantern"]
 *   bun scripts/ltx-graph.ts <server> <out-dir> recast source=<clip> ref=<img>[,<img>] [sheet=<img>] box=x,y,w,h \
 *     target="the woman on the left" name=Mara identity="..." wardrobe="..." action="..." [pose=0.9]
 *   bun scripts/ltx-graph.ts <server> <out-dir> performance source=<clip> prompt="..." [keyframe=<img>] [control=edges|edges-detailed] [strength=0.9]
 *   bun scripts/ltx-graph.ts <server> <out-dir> vfx source=<clip> effect=water|night|clean-plate [prompt="..."] [keep="the couple"] [frames=121] [side=960]
 *
 * Add submit-only=1 to stop once the server has accepted the graph (a check
 * against a local ComfyUI with placeholder model files).
 *
 * <server> is Comfy Cloud through the development relay (http://127.0.0.1:8790,
 * see docs/foundation.md) or a ComfyUI with the same models. A Cloud run
 * spends credits; keep check runs short and small.
 */
import { mkdir } from "node:fs/promises";
import { ltxCameraGraph } from "../packages/comfy/src/workflows/ltx-camera";
import { ltxRestageGraph } from "../packages/comfy/src/workflows/ltx-restage";
import {
  ltxEditGraph,
  ltxEditPrompts,
} from "../packages/comfy/src/workflows/ltx-edit";
import type { Graph } from "../packages/comfy/src/workflows/ltx-graph";
import {
  ltxPerformanceGraph,
  type PerformanceControl,
} from "../packages/comfy/src/workflows/ltx-performance-transfer";
import {
  ltxRecastGraph,
  ltxRecastPrompts,
} from "../packages/comfy/src/workflows/ltx-recast";
import { ltxVfxGraph } from "../packages/comfy/src/workflows/ltx-vfx";
import type {
  CameraMove,
  RestageAngle,
} from "../packages/contracts/src/camera";
import type { VfxEffect } from "../packages/contracts/src/vfx";

const [server, outDir, kind, ...rest] = process.argv.slice(2);
if (!server || !outDir || !kind) {
  console.error("usage: see the header of scripts/ltx-graph.ts");
  process.exit(1);
}
const args = Object.fromEntries(
  rest.map((a) => {
    const i = a.indexOf("=");
    return [a.slice(0, i), a.slice(i + 1)];
  }),
);
const seed = Number(args.seed ?? 42);

async function upload(path: string, role: string) {
  const form = new FormData();
  form.append("type", "input");
  form.append("overwrite", "true");
  form.append(
    "image",
    Bun.file(path),
    `${role}-${crypto.randomUUID()}.${path.split(".").pop()}`,
  );
  const response = await fetch(`${server}/api/upload/image`, {
    method: "POST",
    body: form,
  });
  const uploaded = (await response.json()) as {
    name: string;
    subfolder?: string;
  };
  if (!response.ok) throw new Error(`upload ${role}: ${response.status}`);
  return uploaded.subfolder
    ? `${uploaded.subfolder}/${uploaded.name}`
    : uploaded.name;
}

let graph: Graph;
const files: [node: string, field: string, path: string][] = [];
const refs = (args.ref ?? "").split(",").filter(Boolean);
if (kind === "camera") {
  graph = ltxCameraGraph({
    move: (args.move ?? "dolly-in") as CameraMove,
    prompt: args.prompt ?? "",
    durationSeconds: Number(args.seconds ?? 3),
    fps: 24,
    resolution: "1280x720",
    seed,
    firstFrame: !!args.image,
    previewSide: args.side ? Number(args.side) : undefined,
  });
  if (args.image) files.push(["first_frame", "image", args.image]);
} else if (kind === "restage") {
  graph = ltxRestageGraph({
    angle: (args.angle ?? "from-left") as RestageAngle,
    description: args.prompt ?? "",
    seed,
    limits: {
      maxFrames: Number(args.frames ?? 97),
      maxSide: Number(args.side ?? 768),
    },
  });
  files.push(["source", "file", args.source!]);
} else if (kind === "restyle" || kind === "swap") {
  const prompts = ltxEditPrompts({
    mode: kind,
    references: refs.length,
    direction: args.prompt ?? "",
    style: args.style ?? "",
    original: args.original ?? "",
    replacement: args.replacement ?? "",
    name: args.name ?? "",
  });
  graph = ltxEditGraph({
    mode: kind,
    ...prompts,
    references: refs.length,
    seed,
  });
  files.push(["source", "file", args.source!]);
  refs.forEach((path, i) => files.push([`reference_${i}`, "image", path]));
} else if (kind === "recast") {
  const sheet = !!args.sheet;
  const prompts = ltxRecastPrompts({
    target: args.target ?? "the person",
    name: args.name ?? "the Character",
    identity: args.identity ?? "",
    wardrobe: args.wardrobe ?? "",
    action: args.action ?? "",
    references: refs.length,
    sheet,
  });
  const [x, y, width, height] = (args.box ?? "0,0,1,1").split(",").map(Number);
  graph = ltxRecastGraph({
    ...prompts,
    references: refs.length,
    sheet,
    target: { x: x!, y: y!, width: width!, height: height! },
    poseStrength: Number(args.pose ?? 0.9),
    seed,
  });
  files.push(["source", "file", args.source!]);
  refs.forEach((path, i) => files.push([`reference_${i}`, "image", path]));
  if (sheet) files.push(["sheet", "image", args.sheet!]);
} else if (kind === "performance") {
  graph = ltxPerformanceGraph({
    prompt: args.prompt ?? "",
    control: (args.control ?? "edges") as PerformanceControl,
    strength: Number(args.strength ?? 0.9),
    keyframeStrength: args.keyframe ? 1 : null,
    seed,
  });
  files.push(["source", "file", args.source!]);
  if (args.keyframe) files.push(["keyframe", "image", args.keyframe]);
} else if (kind === "vfx") {
  graph = ltxVfxGraph({
    effect: (args.effect ?? "water") as VfxEffect,
    direction: args.prompt ?? "",
    keep: args.keep,
    seed,
    strength: args.strength ? Number(args.strength) : undefined,
    schedule: args.steps
      ? { steps: Number(args.steps), cfg: Number(args.cfg ?? 3.5) }
      : undefined,
    limits:
      args.frames || args.side
        ? {
            maxFrames: Number(args.frames ?? 121),
            maxSide: Number(args.side ?? 960),
          }
        : undefined,
  });
  files.push(["source", "file", args.source!]);
} else throw new Error(`unknown graph ${kind}`);

for (const [node, field, path] of files) {
  if (!graph[node]) throw new Error(`no loader ${node}`);
  graph[node].inputs[field] = await upload(path, node);
}
await mkdir(outDir, { recursive: true });
await Bun.write(`${outDir}/graph.json`, JSON.stringify(graph, null, 2));
const started = Date.now();
const submitted = await fetch(`${server}/api/prompt`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: graph }),
});
const { prompt_id: id, ...rejected } = (await submitted.json()) as {
  prompt_id?: string;
};
if (!id) {
  console.error(
    `prompt rejected: ${JSON.stringify(rejected, null, 1).slice(0, 4000)}`,
  );
  process.exit(1);
}
console.log(`submitted ${id}`);
if (args["submit-only"]) process.exit(0);
type Job = {
  status: string;
  outputs?: Record<
    string,
    { images?: { filename: string; subfolder?: string; type?: string }[] }
  >;
};
let job: Job;
for (;;) {
  job = (await (await fetch(`${server}/api/jobs/${id}`)).json()) as Job;
  if (["completed", "failed", "cancelled", "error"].includes(job.status)) break;
  await Bun.sleep(3000);
}
console.log(`${job.status} in ${(Date.now() - started) / 1000} s (${id})`);
await Bun.write(`${outDir}/job.json`, JSON.stringify(job, null, 2));
if (job.status !== "completed") {
  console.log(JSON.stringify(job).slice(0, 4000));
  process.exit(1);
}
for (const [node, out] of Object.entries(job.outputs ?? {}))
  for (const file of out.images ?? []) {
    const query = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder ?? "",
      type: file.type ?? "output",
    });
    const view = await fetch(`${server}/api/view?${query}`, {
      redirect: "manual",
    });
    const location = view.headers.get("location");
    const download = location ? await fetch(location) : view;
    const name = `${outDir}/${node}-${file.filename.split("/").pop()}`;
    await Bun.write(name, await download.arrayBuffer());
    console.log(`saved ${name}`);
  }
