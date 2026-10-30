import {
  capabilityIdSchema,
  elementHandleSchema,
  recipeSpecProblems,
  recipeSpecSchema,
  recipeVersionSchema,
  replaceMentions,
  toElementHandle,
  worldAdaptations,
  type OwnerScope,
  type RecipeSpec,
  type WorldImportResult,
  type WorldManifest,
} from "@open-cinema/contracts";
import type { DatabaseContext } from "../client";
import { resolveAssetRef } from "../queries/media";
import {
  addElementReference,
  createElement,
  createElementState,
} from "./elements";
import { createRecipe } from "./recipes";
import { addTake, createSequence, setTakeStatus } from "./sequences";

const KNOWN_CAPABILITIES = new Set<string>(capabilityIdSchema.options);

/**
 * A recipe spec as this studio can use it: capabilities it does not offer are
 * dropped (and reported), anything else that does not fit is a reason.
 */
export function adaptRecipeSpec(
  raw: unknown,
): { spec: RecipeSpec; problem: null } | { spec: null; problem: string } {
  const spec =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const capabilities = Array.isArray(spec.capabilities)
    ? spec.capabilities.filter(
        (c): c is string => typeof c === "string" && KNOWN_CAPABILITIES.has(c),
      )
    : spec.capabilities;
  const parsed = recipeSpecSchema.safeParse({ ...spec, capabilities });
  if (!parsed.success)
    return {
      spec: null,
      problem: `its ${parsed.error.issues[0]?.path.join(".") || "spec"} is not in a form this studio reads.`,
    };
  const problems = recipeSpecProblems(parsed.data);
  return problems.length
    ? { spec: null, problem: problems[0]! }
    : { spec: parsed.data, problem: null };
}

/** Rewrites `@Old` mentions (with or without states) to renamed handles. */
function renameMentions(text: string, renamed: ReadonlyMap<string, string>) {
  if (!renamed.size) return text;
  return replaceMentions(text, (token) => {
    const to = renamed.get(token.handle);
    return to ? `@${to}${token.raw.slice(token.handle.length + 1)}` : token.raw;
  });
}

/**
 * Creates a world bundle's records for the caller. `media` maps each bundle
 * path to an upload the caller already made (the browser uploads the files
 * first, through the ordinary upload route); a path without one is skipped.
 * Ids from the source never reach the database: every record is new, and
 * handles that are already taken here get a number.
 */
export async function importWorld(
  db: DatabaseContext,
  scope: OwnerScope,
  manifest: WorldManifest,
  media: Readonly<Record<string, string>>,
): Promise<WorldImportResult> {
  // Every upload must be the caller's own, ready media.
  const uploads = new Map<string, string>();
  for (const [path, assetId] of Object.entries(media)) {
    const ref = { type: "media-asset" as const, assetId };
    if (!(await resolveAssetRef(db, scope, ref)))
      throw new Error("One of this world's files did not finish uploading.");
    uploads.set(path, assetId);
  }
  const asset = (path: string | null) => {
    const assetId = path ? uploads.get(path) : undefined;
    return assetId ? { type: "media-asset" as const, assetId } : null;
  };

  const renamed = new Map<string, string>();
  for (const element of manifest.elements) {
    const wanted = elementHandleSchema.safeParse(element.handle).success
      ? element.handle
      : toElementHandle(element.name);
    const created = await createElement(db, scope, {
      type: element.type,
      name: element.name.slice(0, 80),
      handle: wanted,
      description: element.description,
    });
    if (created.handle !== element.handle)
      renamed.set(element.handle, created.handle);
    const states = new Map<string, string>();
    for (const state of element.states) {
      const next = await createElementState(db, scope, {
        elementId: created.id,
        name: state.name,
        description: state.description,
        kind: state.kind,
      });
      const made = next?.states.find((s) => s.name === state.name);
      if (made) states.set(state.key, made.id);
    }
    for (const reference of element.references) {
      const ref = asset(reference.media);
      if (!ref) continue;
      const stateId = reference.stateKey
        ? states.get(reference.stateKey)
        : undefined;
      await addElementReference(db, scope, {
        elementId: created.id,
        ...(stateId ? { stateId } : {}),
        asset: ref,
        status: reference.status,
        ...(reference.view ? { view: reference.view } : {}),
        roles: reference.roles,
        note: reference.note,
      });
    }
  }

  let recipes = 0;
  for (const recipe of manifest.recipes) {
    const { spec } = adaptRecipeSpec(recipe.spec);
    if (!spec) continue;
    const cover = asset(recipe.cover);
    // Earlier versions come along when this studio can read them, so the
    // recipe can still be compared or rolled back here.
    const history = recipe.history.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const adapted = adaptRecipeSpec((entry as { spec?: unknown }).spec).spec;
      const version = recipeVersionSchema.safeParse({
        ...entry,
        spec: adapted,
      });
      return adapted && version.success ? [version.data] : [];
    });
    await createRecipe(
      db,
      scope,
      {
        name: recipe.name,
        summary: recipe.summary,
        spec,
        ...(recipe.parentId ? { parentId: recipe.parentId } : {}),
        ...(cover ? { cover } : {}),
      },
      { version: recipe.version, history },
    );
    recipes++;
  }

  const sequences: WorldImportResult["sequences"] = [];
  for (const world of manifest.sequences) {
    const sequence = await createSequence(db, scope, {
      title: world.title,
      idea: renameMentions(world.idea, renamed),
      shots: world.shots.map((shot) => ({
        title: shot.title,
        beat: renameMentions(shot.beat, renamed),
        prompt: renameMentions(shot.prompt, renamed),
        staging: renameMentions(shot.staging, renamed),
        framing: shot.framing,
        camera: shot.camera,
        durationSeconds: shot.durationSeconds,
        continuity: shot.continuity,
      })),
    });
    for (const [index, shot] of world.shots.entries()) {
      const shotId = sequence.shots[index]?.id;
      if (!shotId) continue;
      for (const take of shot.takes) {
        const ref = asset(take.media);
        if (!ref) continue;
        const next = await addTake(db, scope, {
          shotId,
          role: take.role,
          origin: take.origin,
          asset: ref,
          prompt: renameMentions(take.prompt, renamed),
          approve: take.status === "approved",
        });
        if (take.status === "rejected") {
          const added = next?.shots[index]?.takes.find(
            (t) =>
              t.status === "candidate" &&
              t.asset?.type === "media-asset" &&
              t.asset.assetId === ref.assetId,
          );
          if (added)
            await setTakeStatus(db, scope, {
              id: added.id,
              status: "rejected",
            });
        }
      }
    }
    sequences.push({ id: sequence.id, title: sequence.title });
  }

  return {
    elements: manifest.elements.length,
    recipes,
    sequences,
    renamed: [...renamed].map(([from, to]) => ({ from, to })),
    adaptations: worldAdaptations(manifest, {
      capabilities: [...KNOWN_CAPABILITIES],
      recipeProblem: (spec) => adaptRecipeSpec(spec).problem,
    }),
  };
}
