/**
 * Replays the recast guardrails on scanned Phase 0 clips and prints the table
 * in ../guardrails.md. Scans are Human detections from the studio's worker,
 * keyed `src-{clip}` and `res-{pipeline}-{clip}`; refs maps a Character to
 * reference face embeddings. Usage: bun guardrails-eval.ts scans.json refs.json
 */
import {
  checkResult,
  preflight,
} from "../../../apps/web/src/features/revision/shot-checks";

const [scansPath, refsPath] = process.argv.slice(2);
if (!scansPath || !refsPath)
  throw new Error("usage: guardrails-eval.ts scans.json refs.json");
const scans = await Bun.file(scansPath).json();
const refs = await Bun.file(refsPath).json();
const { clips } = await Bun.file(
  new URL("../clips.json", import.meta.url),
).json();

const rows: string[] = [];
for (const clip of clips) {
  const source = scans[`src-${clip.id}`];
  if (!source) continue;
  const [x, y] = clip.target_point;
  const mark = { x, y, timeMs: 0 };
  const p = preflight(source, mark);
  rows.push(
    `| ${clip.id} | source | ${p.verdict}${p.reasons.length ? ` (${p.reasons.join(", ")})` : ""} | ${p.faceFrames}/${p.tracked} face, ${p.backFrames} back, largest ${p.largestFace?.toFixed(2) ?? "–"} | | | | |`,
  );
  for (const key of Object.keys(scans).filter(
    (k) => k.startsWith("res-") && k.endsWith(`-${clip.id}`),
  )) {
    const run = key.slice(4, -clip.id.length - 1);
    const r = checkResult(
      source,
      scans[key],
      mark,
      refs[clip.character].embeddings,
    );
    const others = r.bystanders
      .map((b) => `${b.similarity.toFixed(2)}${b.changed ? "✗" : ""}`)
      .join(" ");
    rows.push(
      `| ${clip.id} | ${run} | | | ${r.likeness?.toFixed(2) ?? "–"} ${r.likenessVerdict} | ${r.sourceSimilarity?.toFixed(2) ?? "–"} (${r.targetChanged}) | ${others || "–"} | ${r.wrongPerson ? "yes" : ""} |`,
    );
  }
}
console.log(
  "| Clip | Run | Pre-flight | Evidence | Likeness | Still source | Bystanders | Wrong person |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n" +
    rows.join("\n"),
);
