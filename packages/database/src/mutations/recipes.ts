import {
  createRecipeInputSchema,
  recipeSpecProblems,
  updateRecipeInputSchema,
  type AssetRef,
  type CreateRecipeInput,
  type OwnerScope,
  type Recipe,
  type RecipeVersion,
  type UpdateRecipeInput,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import { getRecipe, toRecipe } from "../queries/recipes";
import { resolveAssetRef } from "../queries/media";
import { ensureUser } from "./users";

/** Versions kept per recipe; older ones fall off the end. */
const MAX_HISTORY = 20;

async function coverColumns(
  db: DatabaseContext,
  scope: OwnerScope,
  cover: AssetRef | null,
) {
  if (!cover)
    return {
      coverType: null,
      coverAssetId: null,
      coverJobId: null,
      coverOutputId: null,
    };
  if (!(await resolveAssetRef(db, scope, cover)))
    throw new Error("That cover image is not available.");
  return cover.type === "media-asset"
    ? {
        coverType: cover.type,
        coverAssetId: cover.assetId,
        coverJobId: null,
        coverOutputId: null,
      }
    : {
        coverType: cover.type,
        coverAssetId: null,
        coverJobId: cover.jobId,
        coverOutputId: cover.outputId,
      };
}

export async function createRecipe(
  db: DatabaseContext,
  scope: OwnerScope,
  input: CreateRecipeInput,
  /** A recipe brought in from another studio keeps its version and history. */
  restored?: { version: number; history: RecipeVersion[] },
): Promise<Recipe> {
  const data = createRecipeInputSchema.parse(input);
  const problems = recipeSpecProblems(data.spec);
  if (problems.length) throw new Error(problems[0]);
  await ensureUser(db, scope);
  const row = await getClient(db).recipe.create({
    data: {
      id: crypto.randomUUID(),
      ownerId: scope.ownerId,
      name: data.name,
      summary: data.summary ?? "",
      spec: data.spec,
      parentId: data.parentId ?? null,
      ...(await coverColumns(db, scope, data.cover ?? null)),
      ...(restored ? { version: restored.version } : {}),
      history: restored?.history.slice(0, MAX_HISTORY) ?? [],
    },
  });
  return toRecipe(row);
}

/**
 * A change to the name or spec is a new version; the one it replaces moves
 * into the history so the recipe can be compared or rolled back. A cover or
 * summary change alone keeps the version.
 */
export async function updateRecipe(
  db: DatabaseContext,
  scope: OwnerScope,
  input: UpdateRecipeInput,
): Promise<Recipe | null> {
  const { id, note, ...changes } = updateRecipeInputSchema.parse(input);
  const current = await getRecipe(db, scope, id);
  if (!current) return null;
  if (changes.spec) {
    const problems = recipeSpecProblems(changes.spec);
    if (problems.length) throw new Error(problems[0]);
  }
  const versioned =
    (changes.spec &&
      JSON.stringify(changes.spec) !== JSON.stringify(current.spec)) ||
    (changes.name !== undefined && changes.name !== current.name);
  const previous: RecipeVersion = {
    version: current.version,
    name: current.name,
    spec: current.spec,
    note: note ?? "",
    savedAt: current.updatedAt,
  };
  const client = getClient(db);
  const { count } = await client.recipe.updateMany({
    where: { id, ownerId: scope.ownerId, version: current.version },
    data: {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.summary !== undefined ? { summary: changes.summary } : {}),
      ...(changes.spec ? { spec: changes.spec } : {}),
      ...(changes.cover !== undefined
        ? await coverColumns(db, scope, changes.cover)
        : {}),
      ...(versioned
        ? {
            version: current.version + 1,
            history: [previous, ...current.history].slice(0, MAX_HISTORY),
          }
        : {}),
    },
  });
  if (count === 0)
    throw new Error("This recipe changed in another tab. Reload it first.");
  return getRecipe(db, scope, id);
}

export async function deleteRecipe(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<boolean> {
  const { count } = await getClient(db).recipe.deleteMany({
    where: { id, ownerId: scope.ownerId },
  });
  return count > 0;
}

/** Counts a generation made from the recipe; never changes its version. */
export async function recordRecipeUse(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<void> {
  await getClient(db).recipe.updateMany({
    where: { id, ownerId: scope.ownerId },
    data: { uses: { increment: 1 } },
  });
}
