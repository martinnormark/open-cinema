/**
 * Puts the recast-check models in public/models/human/ (ignored by git) so the
 * studio serves them itself. Human's package ships the face models; MoveNet
 * MultiPose comes once from the pinned human-models release and is checked
 * against its hash. A failure only disables the checks, never the build.
 */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "models", "human");
const packaged = join(
  dirname(
    createRequire(import.meta.url).resolve("@vladmandic/human/package.json"),
  ),
  "models",
);

const FROM_PACKAGE = ["blazeface", "facemesh", "faceres"];
const RELEASE = "https://unpkg.com/@vladmandic/human-models@3.0.4/models";
const DOWNLOADS: Record<string, string> = {
  "movenet-multipose.json":
    "3c76e18669efc50148b28d0be97db491dc055cb2be292d248ec129031c5aa5de",
  "movenet-multipose.bin":
    "19828492d4a69c2e08915916c70f4d22c421c3b59152dfa5601834fc54f54118",
};

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

async function present(path: string, hash?: string) {
  try {
    await stat(path);
    return hash ? sha256(await readFile(path)) === hash : true;
  } catch {
    return false;
  }
}

await mkdir(out, { recursive: true });
for (const name of FROM_PACKAGE)
  for (const ext of ["json", "bin"])
    await copyFile(
      join(packaged, `${name}.${ext}`),
      join(out, `${name}.${ext}`),
    );

for (const [file, hash] of Object.entries(DOWNLOADS)) {
  const target = join(out, file);
  if (await present(target, hash)) continue;
  try {
    const response = await fetch(`${RELEASE}/${file}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (sha256(bytes) !== hash) throw new Error("hash mismatch");
    await writeFile(target, bytes);
  } catch (error) {
    console.warn(
      `human-models: ${file} unavailable (${error instanceof Error ? error.message : error}); recast shot checks will report that they could not run.`,
    );
  }
}
