/**
 * Checks every exported workflow in workflows/cloud/ against a ComfyUI node
 * catalogue (`/api/object_info`): each node class exists, every input is one
 * the node declares (dynamic combos and autogrow inputs included), required
 * inputs are set, links point at an existing node output of a compatible type,
 * and combo values (model files, samplers, codecs) are ones the server offers.
 * Loader file inputs are skipped: they name placeholder uploads.
 *
 *   bun scripts/validate-workflows.ts                      # Comfy Cloud's catalogue
 *   bun scripts/validate-workflows.ts object_info.json     # a saved catalogue
 *   bun scripts/validate-workflows.ts http://127.0.0.1:8188  # a local ComfyUI
 *
 * Reading the catalogue is free; nothing is queued. Set COMFY_API_KEY if the
 * server asks for a key.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

type Spec = [unknown, Record<string, unknown>?];
interface NodeInfo {
  input: {
    required?: Record<string, Spec>;
    optional?: Record<string, Spec>;
    hidden?: Record<string, unknown>;
  };
  output: string[];
}
type Catalogue = Record<string, NodeInfo>;
type ApiGraph = Record<
  string,
  { class_type: string; inputs: Record<string, unknown> }
>;
interface ManifestEntry {
  file: string;
  inputs: { node: string; field: string }[];
}

/**
 * Model files Cloud runs although its catalogue does not list them. The Alpha
 * Gen IC-LoRA is missing from Cloud's `object_info` on 2026-10-17, yet the
 * exported graph ran with it there that day (jobs f30bd530 and a32a3cf1); so
 * did FLUX 3 Klein and its encoder (job baf43ad0). Cloud renamed the Klein
 * file on 2026-10-22; the new name ran in Wan Animate 2's keyframe that day
 * (prompt 1d581236). MiniMax H3's int8 video VAE, which Comfy's ref2va
 * template loads, ran there on 2026-10-30 (job 91dfbd38). Reported as a
 * note, not a failure.
 */
const UNLISTED_ON_CLOUD = new Set([
  "ltx-2.5-22b-ic-lora-alpha-gen-0.9.safetensors",
  "flux3-image-klein-int8-convrot.safetensors",
  "qwen3vl_4b_int8_convrot.safetensors",
  "minimax_h3_video_vae_int8_convrot.safetensors",
]);
const notes: string[] = [];

const source = process.argv[2] ?? "https://cloud.comfy.org";
async function catalogue(): Promise<Catalogue> {
  if (!/^https?:/.test(source))
    return JSON.parse(await readFile(source, "utf8"));
  const key = process.env.COMFY_API_KEY;
  const response = await fetch(`${source.replace(/\/$/, "")}/api/object_info`, {
    headers: key ? { "X-API-Key": key } : {},
  });
  if (!response.ok)
    throw new Error(`${source} answered ${response.status} for object_info`);
  return (await response.json()) as Catalogue;
}

const isLink = (v: unknown): v is [string, number] =>
  Array.isArray(v) &&
  v.length === 2 &&
  typeof v[0] === "string" &&
  typeof v[1] === "number";

function options(spec: Spec): unknown[] | null {
  if (Array.isArray(spec[0])) return spec[0];
  if (spec[0] === "COMBO" && Array.isArray(spec[1]?.options))
    return spec[1]!.options as unknown[];
  return null;
}

/** A V3 node whose input takes any of `allowed_types` and whose output follows it. */
const MATCH_TYPE = "COMFY_MATCHTYPE_V3";

function typesMatch(spec: Spec, have: string) {
  const template = (spec[1] as { template?: { allowed_types?: string } })
    ?.template;
  const want =
    spec[0] === MATCH_TYPE ? (template?.allowed_types ?? "*") : spec[0];
  if (typeof want !== "string") return true; // a combo fed by a link
  // The output's type is whatever reached the node's matching input.
  if (want === "*" || have === "*" || have === MATCH_TYPE) return true;
  const wanted = want.split(",");
  return have.split(",").some((t) => wanted.includes(t));
}

/** The spec for a possibly dotted input name, following the chosen dynamic options. */
function resolve(
  node: NodeInfo,
  name: string,
  inputs: Record<string, unknown>,
): Spec | null {
  const parts = name.split(".");
  let scope: Record<string, Spec> = {
    ...node.input.required,
    ...node.input.optional,
  };
  let path = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const spec = scope[part];
    if (!spec) return null;
    path = path ? `${path}.${part}` : part;
    if (i === parts.length - 1) return spec;
    if (spec[0] === "COMFY_AUTOGROW_V3") {
      // A template lists its member names, or a prefix numbered from 0.
      const template = spec[1]?.template as {
        input: {
          required?: Record<string, Spec>;
          optional?: Record<string, Spec>;
        };
        names?: string[];
        prefix?: string;
      };
      const member = parts[i + 1]!;
      const named = template.names
        ? template.names.includes(member)
        : new RegExp(`^${template.prefix}\\d+$`).test(member);
      if (!named) return null;
      return (
        Object.values({
          ...template.input.required,
          ...template.input.optional,
        })[0] ?? null
      );
    }
    if (spec[0] === "COMFY_DYNAMICCOMBO_V3") {
      const chosen = (
        spec[1]?.options as {
          key: string;
          inputs: {
            required?: Record<string, Spec>;
            optional?: Record<string, Spec>;
          };
        }[]
      ).find((o) => o.key === inputs[path]);
      if (!chosen) return null;
      scope = { ...chosen.inputs.required, ...chosen.inputs.optional };
      continue;
    }
    return null;
  }
  return null;
}

function check(
  graph: ApiGraph,
  nodes: Catalogue,
  files: Set<string>,
): string[] {
  const errors: string[] = [];
  for (const [id, node] of Object.entries(graph)) {
    const info = nodes[node.class_type];
    if (!info) {
      errors.push(`${id}: unknown node ${node.class_type}`);
      continue;
    }
    // An expression whose values leave out `a` (a lone `values.b`) passes
    // validation, then silently blocks every node downstream on Cloud; gaps
    // after `a` (a, b, c, e) run (checked 2026-10-30).
    if (
      node.class_type === "ComfyMathExpression" &&
      Object.keys(node.inputs).some((k) => k.startsWith("values.")) &&
      !("values.a" in node.inputs)
    )
      errors.push(`${id}: ComfyMathExpression values must include a`);
    for (const name of Object.keys(info.input.required ?? {})) {
      const spec = info.input.required![name]!;
      // Autogrow and dynamic combos are set through their dotted members.
      const present =
        name in node.inputs ||
        Object.keys(node.inputs).some((k) => k.startsWith(`${name}.`));
      if (!present && spec[0] !== "COMFY_AUTOGROW_V3")
        errors.push(`${id}: ${node.class_type} needs ${name}`);
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      const spec = resolve(info, name, node.inputs);
      if (!spec) {
        errors.push(`${id}: ${node.class_type} has no input ${name}`);
        continue;
      }
      if (isLink(value)) {
        const from = graph[value[0]];
        const fromInfo = from && nodes[from.class_type];
        if (!fromInfo) {
          errors.push(`${id}.${name}: links to missing node ${value[0]}`);
          continue;
        }
        const type = fromInfo.output[value[1]];
        if (type === undefined)
          errors.push(`${id}.${name}: ${value[0]} has no output ${value[1]}`);
        else if (!typesMatch(spec, type))
          errors.push(`${id}.${name}: wants ${spec[0]}, gets ${type}`);
        continue;
      }
      if (files.has(`${id}.${name}`)) continue;
      const allowed = options(spec);
      if (allowed && !allowed.includes(value)) {
        if (typeof value === "string" && UNLISTED_ON_CLOUD.has(value))
          notes.push(`${id}.${name}: ${value} is not in the catalogue`);
        else
          errors.push(`${id}.${name}: ${JSON.stringify(value)} is not offered`);
      }
      const limits = spec[1] ?? {};
      if (typeof value === "number") {
        if (typeof limits.min === "number" && value < limits.min)
          errors.push(`${id}.${name}: ${value} is below ${limits.min}`);
        if (typeof limits.max === "number" && value > limits.max)
          errors.push(`${id}.${name}: ${value} is above ${limits.max}`);
      }
    }
  }
  return errors;
}

const root = join(import.meta.dir, "..", "workflows", "cloud");
const manifest = JSON.parse(
  await readFile(join(root, "manifest.json"), "utf8"),
) as ManifestEntry[];
const nodes = await catalogue();
let failed = 0;
for (const entry of manifest) {
  const graph = JSON.parse(
    await readFile(join(root, entry.file), "utf8"),
  ) as ApiGraph;
  const files = new Set(entry.inputs.map((i) => `${i.node}.${i.field}`));
  notes.length = 0;
  const errors = check(graph, nodes, files);
  if (errors.length) failed++;
  console.log(
    `${errors.length ? "FAIL" : "ok  "} ${entry.file} (${Object.keys(graph).length} nodes)`,
  );
  for (const error of errors) console.log(`       ${error}`);
  for (const note of notes) console.log(`       note: ${note}`);
}
console.log(
  `${manifest.length - failed}/${manifest.length} workflows match ${source}`,
);
process.exit(failed ? 1 : 0);
