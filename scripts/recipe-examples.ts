/**
 * Makes the starter recipe collection's example images (and the shot-control
 * comparison in docs/direction.md) on Comfy Router, with exactly the
 * prompt each recipe builds in the studio. Development only: it talks to
 * Router through HTTPS_PROXY, whose credential the proxy injects.
 *
 *   bun scripts/recipe-examples.ts --plan          # print prompts, spend nothing
 *   bun scripts/recipe-examples.ts                 # make missing images
 *   bun scripts/recipe-examples.ts --only rain-noir
 *
 * Images are written to apps/web/public/recipes/ as WebP (ffmpeg); request
 * and result documents go to the gitignored artifacts/recipe-examples/.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  recipeSpecSchema,
  renderRecipe,
  withDirection,
  type ImageAspectRatio,
} from "../packages/contracts/src/index";
import { BUILTIN_RECIPES } from "../apps/web/src/features/recipes/collection";

const ROUTER = "https://api.comfy.org/v2/models";
const OUT = "apps/web/public/recipes";
const EVIDENCE = "artifacts/recipe-examples";
const args = process.argv.slice(2);
const plan = args.includes("--plan");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

interface Job {
  file: string;
  model: string;
  input: Record<string, unknown>;
}

const jobs: Job[] = [];
for (const recipe of BUILTIN_RECIPES) {
  const spec = recipeSpecSchema.parse(recipe.spec);
  const rendered = renderRecipe(spec.template, recipe.example.subjects);
  const prompt = rendered[0]!.toUpperCase() + rendered.slice(1);
  const variants = [
    { image: recipe.example.image, look: {}, shot: {} },
    ...recipe.alternatives.map((a) => ({
      image: a.image,
      look: a.look ?? {},
      shot: a.shot ?? {},
    })),
  ];
  for (const variant of variants) {
    const direction = {
      overrides: { ...spec.look, ...variant.look },
      shot: { ...spec.shot, ...variant.shot },
    };
    const text = withDirection(prompt, direction, spec.medium);
    jobs.push(
      spec.medium === "video"
        ? {
            file: variant.image.replace(/\.webp$/, ".mp4"),
            model: "ltx/ltx-2-5-fast",
            input: {
              prompt: text,
              duration: spec.durationSeconds,
              resolution: "1280x720",
              fps: 24,
              generate_audio: false,
            },
          }
        : {
            file: variant.image,
            model: "bfl/flux-3-image",
            input: {
              prompt: text,
              aspect_ratio: spec.aspectRatio satisfies ImageAspectRatio,
              resolution: "1k",
              grounding: false,
            },
          },
    );
  }
}

/** Shot controls: one subject, one control changed at a time. */
const SUBJECT =
  "A fisherman in a yellow oilskin mends a net on a harbor wall, boats behind him";
for (const [name, shot] of [
  ["wide", { framing: "wide" }],
  ["close-up", { framing: "close-up" }],
  ["deep", { framing: "medium", depth: "deep" }],
  ["shallow", { framing: "medium", depth: "shallow" }],
] as const)
  jobs.push({
    file: `shot-${name}.webp`,
    model: "bfl/flux-3-image",
    input: {
      prompt: withDirection(SUBJECT, { overrides: {}, shot }, "image"),
      aspect_ratio: "16:9",
      resolution: "1k",
      grounding: false,
    },
  });

const selected = jobs.filter(
  (job) =>
    (!only || job.file.startsWith(only)) &&
    !existsSync(join(OUT, job.file.replace(/\.mp4$/, ".webp"))),
);
if (plan) {
  for (const job of selected) console.log(job.file, "\n ", job.input.prompt);
  console.log(`${selected.length} to make`);
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });

async function run(job: Job) {
  const dir = join(EVIDENCE, job.file.replace(/\.\w+$/, ""));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "request.json"), JSON.stringify(job, null, 2));
  const started = Date.now();
  const submit = await fetch(`${ROUTER}/${job.model}/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(job.input),
  });
  const accepted = (await submit.json()) as { request_id?: string };
  if (!accepted.request_id)
    throw new Error(
      `${job.file}: ${submit.status} ${JSON.stringify(accepted)}`,
    );
  const base = `${ROUTER}/${job.model}/requests/${accepted.request_id}`;
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = (await (await fetch(`${base}/status`)).json()) as {
      status?: string;
    };
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED" || status.status === "CANCELLED")
      throw new Error(`${job.file}: ${JSON.stringify(status)}`);
  }
  const result = (await (await fetch(base)).json()) as {
    result?: { sample?: string; video_url?: string };
  };
  writeFileSync(join(dir, "result.json"), JSON.stringify(result, null, 2));
  const url = result.result?.sample ?? result.result?.video_url;
  if (!url) throw new Error(`${job.file}: no output`);
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const raw = join(dir, `output${job.file.endsWith(".mp4") ? ".mp4" : ".png"}`);
  writeFileSync(raw, bytes);
  writeFileSync(
    join(dir, "timing.txt"),
    `${((Date.now() - started) / 1000).toFixed(0)} s wall\n`,
  );
  const webp = join(OUT, job.file.replace(/\.mp4$/, ".webp"));
  const still = job.file.endsWith(".mp4")
    ? ["-ss", "2.5", "-i", raw, "-frames:v", "1"]
    : ["-i", raw];
  spawnSync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      ...still,
      "-vf",
      "scale='min(1600,iw)':-2",
      "-quality",
      "82",
      webp,
    ],
    { stdio: "inherit" },
  );
  if (job.file.endsWith(".mp4"))
    spawnSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        raw,
        "-vf",
        "scale=960:-2",
        "-an",
        "-c:v",
        "libx264",
        "-crf",
        "26",
        "-preset",
        "slow",
        "-movflags",
        "+faststart",
        join(OUT, job.file),
      ],
      { stdio: "inherit" },
    );
  console.log(
    `${job.file} done in ${((Date.now() - started) / 1000).toFixed(0)} s`,
  );
}

// Router runs roughly one request per account at a time; two in flight keeps
// the queue busy without piling up.
const queue = [...selected];
await Promise.all(
  [0, 1].map(async () => {
    for (let job = queue.shift(); job; job = queue.shift())
      await run(job).catch((error: unknown) => console.error(String(error)));
  }),
);
