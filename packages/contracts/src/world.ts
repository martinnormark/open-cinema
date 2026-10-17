import { z } from "zod";
import { lookSchema } from "./direction";
import {
  elementTypeSchema,
  referenceRoleSchema,
  referenceStatusSchema,
  referenceViewSchema,
  stateKindSchema,
} from "./elements";
import {
  shotCameraSchema,
  shotContinuitySchema,
  shotDurationSchema,
  shotFramingSchema,
  takeOriginSchema,
  takeRoleSchema,
  takeStatusSchema,
  MAX_SEQUENCE_SHOTS,
} from "./sequences";
import { WORKFLOW_DESCRIPTORS, type WorkflowKind } from "./workflows";

/**
 * A world bundle carries a creator's reusable assets and their context to
 * another project or another installation: Elements with their states and
 * reference sheets, recipes with their history, a project's look, sequences
 * with their approved takes, and every media file they point at.
 *
 * Media is referenced by path inside the bundle and carries its provenance
 * (the upload's filename, or the workflow, model and prompt that made it), so
 * an imported result stays understandable even where the workflow that made
 * it no longer exists. Ids from the source installation are kept only as
 * `key`s that connect records inside the bundle.
 */

export const WORLD_FORMAT = "open-cinema.world";
/** Bump on a breaking change and teach `readWorldManifest` the old shape. */
export const WORLD_VERSION = 1;
export const WORLD_MANIFEST_PATH = "world.json";

const key = z.string().min(1).max(100);
const mediaPath = z
  .string()
  .regex(/^media\/[A-Za-z0-9._-]{1,120}$/, "Media lives under media/");

export const worldMediaSchema = z.object({
  path: mediaPath,
  mediaType: z.string().max(100),
  kind: z.enum(["image", "video"]),
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  durationMs: z.number().int().nonnegative().nullable().default(null),
  origin: z.discriminatedUnion("type", [
    z.object({ type: z.literal("upload"), filename: z.string().max(255) }),
    z.object({
      type: z.literal("generated"),
      workflowKind: z.string().max(80),
      model: z.string().max(120),
      prompt: z.string().max(4000),
      createdAt: z.string().max(40),
    }),
  ]),
});
export type WorldMedia = z.infer<typeof worldMediaSchema>;

export const worldElementSchema = z.object({
  key,
  type: elementTypeSchema,
  name: z.string().min(1).max(120),
  handle: z.string().min(1).max(40),
  description: z.string().max(4000).default(""),
  /** The source's version, kept for the record; imports start a new history. */
  version: z.number().int().positive().default(1),
  states: z
    .array(
      z.object({
        key,
        name: z.string().min(1).max(80),
        description: z.string().max(2000).default(""),
        kind: stateKindSchema.default("other"),
      }),
    )
    .max(100)
    .default([]),
  references: z
    .array(
      z.object({
        media: mediaPath,
        stateKey: key.nullable().default(null),
        status: referenceStatusSchema,
        view: referenceViewSchema.nullable().default(null),
        roles: z.array(referenceRoleSchema).max(8).default([]),
        note: z.string().max(500).default(""),
      }),
    )
    .max(200)
    .default([]),
});
export type WorldElement = z.infer<typeof worldElementSchema>;

export const worldRecipeSchema = z.object({
  key,
  name: z.string().min(1).max(80),
  summary: z.string().max(300).default(""),
  /**
   * Kept as written by the source studio and validated on import, so a spec
   * from an older or newer installation can be adapted rather than rejected.
   */
  spec: z.unknown(),
  version: z.number().int().positive().default(1),
  history: z.array(z.unknown()).max(50).default([]),
  cover: mediaPath.nullable().default(null),
  /** A built-in recipe it was adapted from (`builtin:<slug>`), which every studio ships. */
  parentId: z
    .string()
    .regex(/^builtin:[a-z0-9-]{1,60}$/)
    .nullable()
    .catch(null)
    .default(null),
});
export type WorldRecipe = z.infer<typeof worldRecipeSchema>;

export const worldTakeSchema = z.object({
  role: takeRoleSchema,
  origin: takeOriginSchema,
  status: takeStatusSchema,
  prompt: z.string().max(4000).default(""),
  media: mediaPath,
});

export const worldSequenceSchema = z.object({
  key,
  title: z.string().min(1).max(120),
  idea: z.string().max(8000).default(""),
  shots: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        beat: z.string().max(2000).default(""),
        prompt: z.string().max(2000).default(""),
        framing: shotFramingSchema.catch("medium"),
        camera: shotCameraSchema.catch("static"),
        durationSeconds: shotDurationSchema.catch(5),
        continuity: shotContinuitySchema.catch("fresh"),
        takes: z.array(worldTakeSchema).max(100).default([]),
      }),
    )
    .max(MAX_SEQUENCE_SHOTS),
});
export type WorldSequence = z.infer<typeof worldSequenceSchema>;

export const worldManifestSchema = z.object({
  format: z.literal(WORLD_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  /** What the source studio could run, to explain differences on import. */
  studio: z.object({
    workflows: z
      .array(z.object({ kind: z.string(), models: z.array(z.string()) }))
      .default([]),
    capabilities: z.array(z.string()).default([]),
  }),
  project: z
    .object({
      name: z.string().min(1).max(120),
      direction: z.string().max(4000).default(""),
      look: lookSchema.catch({}).default({}),
    })
    .nullable()
    .default(null),
  elements: z.array(worldElementSchema).max(200).default([]),
  recipes: z.array(worldRecipeSchema).max(200).default([]),
  sequences: z.array(worldSequenceSchema).max(50).default([]),
  media: z.array(worldMediaSchema).max(2000).default([]),
});
export type WorldManifest = z.infer<typeof worldManifestSchema>;
export type WorldManifestInput = z.input<typeof worldManifestSchema>;

export class WorldFormatError extends Error {}

/**
 * Reads a manifest from any supported version. A newer bundle is refused with
 * a clear message rather than half-imported.
 */
export function readWorldManifest(raw: unknown): WorldManifest {
  const head = z
    .object({ format: z.string(), version: z.number() })
    .safeParse(raw);
  if (!head.success || head.data.format !== WORLD_FORMAT)
    throw new WorldFormatError("This file is not an Open Cinema world.");
  if (head.data.version > WORLD_VERSION)
    throw new WorldFormatError(
      "This world was saved by a newer Open Cinema. Update this studio to open it.",
    );
  const parsed = worldManifestSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorldFormatError(
      `This world is damaged: ${parsed.error.issues[0]?.path.join(".") || "manifest"} is not readable.`,
    );
  const paths = new Set(parsed.data.media.map((m) => m.path));
  const missing = [
    ...parsed.data.elements.flatMap((e) => e.references.map((r) => r.media)),
    ...parsed.data.recipes.flatMap((r) => (r.cover ? [r.cover] : [])),
    ...parsed.data.sequences.flatMap((s) =>
      s.shots.flatMap((shot) => shot.takes.map((t) => t.media)),
    ),
  ].find((path) => !paths.has(path));
  if (missing)
    throw new WorldFormatError(
      `This world is damaged: ${missing} is referenced but not listed.`,
    );
  return parsed.data;
}

/** One thing an import could not carry over unchanged, in plain words. */
export interface WorldAdaptation {
  subject: string;
  change: string;
}

/**
 * What changes when a bundle meets this studio: workflows that made its
 * results but are not available here, and capabilities its recipes ask for
 * that this studio does not offer. Results themselves always import as media;
 * only how they could be remade differs.
 */
export function worldAdaptations(
  manifest: WorldManifest,
  available: {
    kinds?: readonly string[];
    capabilities: readonly string[];
    /** Validates a recipe spec; returns the reason it cannot be used, or null. */
    recipeProblem?: (spec: unknown) => string | null;
  },
): WorldAdaptation[] {
  const kinds = new Set(
    available.kinds ?? (Object.keys(WORKFLOW_DESCRIPTORS) as WorkflowKind[]),
  );
  const capabilities = new Set(available.capabilities);
  const notes: WorldAdaptation[] = [];
  const gone = new Map<string, number>();
  for (const media of manifest.media)
    if (
      media.origin.type === "generated" &&
      !kinds.has(media.origin.workflowKind)
    )
      gone.set(
        media.origin.workflowKind,
        (gone.get(media.origin.workflowKind) ?? 0) + 1,
      );
  for (const [kind, count] of gone)
    notes.push({
      subject: `${count} ${count === 1 ? "result" : "results"} made with “${kind}”`,
      change:
        "This studio does not run that workflow. The media and its prompt come across, so it can be reused as a reference or remade with a workflow this studio has.",
    });
  for (const recipe of manifest.recipes) {
    const problem = available.recipeProblem?.(recipe.spec);
    if (problem) {
      notes.push({
        subject: `Recipe “${recipe.name}”`,
        change: `It is not imported: ${problem}`,
      });
      continue;
    }
    const spec = recipe.spec as { capabilities?: unknown };
    const missing = Array.isArray(spec?.capabilities)
      ? spec.capabilities.filter(
          (c): c is string => typeof c === "string" && !capabilities.has(c),
        )
      : [];
    if (missing.length)
      notes.push({
        subject: `Recipe “${recipe.name}”`,
        change: `Imported without ${missing.join(", ")}, which this studio does not offer. Its prompt, look and slots are unchanged.`,
      });
  }
  return notes;
}

/** A path that cannot escape `media/`, unique per source asset. */
export function worldMediaPath(sourceKey: string, mediaType: string): string {
  const ext =
    {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
    }[mediaType.split(";")[0]!.trim().toLowerCase()] ?? "bin";
  const safe = sourceKey.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 100);
  return `media/${safe}.${ext}`;
}

/** What `importWorld` reports back: what was created, and what changed. */
export const worldImportResultSchema = z.object({
  projectId: z.string().nullable(),
  elements: z.number().int().nonnegative(),
  recipes: z.number().int().nonnegative(),
  sequences: z.array(z.object({ id: z.string(), title: z.string() })),
  /** Handles that were taken here and got a suffix, old → new. */
  renamed: z.array(z.object({ from: z.string(), to: z.string() })),
  adaptations: z.array(z.object({ subject: z.string(), change: z.string() })),
});
export type WorldImportResult = z.infer<typeof worldImportResultSchema>;

/**
 * The manifest without media that could not be read, and without the
 * references, covers and takes that pointed at it, so a bundle stays whole
 * when one stored file has gone missing.
 */
export function pruneWorldMedia<
  M extends Pick<
    WorldManifestInput,
    "elements" | "recipes" | "sequences" | "media"
  >,
>(manifest: M, keep: ReadonlySet<string>): M {
  return {
    ...manifest,
    media: manifest.media?.filter((m) => keep.has(m.path)),
    elements: manifest.elements?.map((e) => ({
      ...e,
      references: e.references?.filter((r) => keep.has(r.media)),
    })),
    recipes: manifest.recipes?.map((r) => ({
      ...r,
      cover: r.cover && keep.has(r.cover) ? r.cover : null,
    })),
    sequences: manifest.sequences?.map((s) => ({
      ...s,
      shots: s.shots.map((shot) => ({
        ...shot,
        takes: shot.takes?.filter((t) => keep.has(t.media)),
      })),
    })),
  };
}
