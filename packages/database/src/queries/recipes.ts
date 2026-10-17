import {
  recipeSchema,
  type OwnerScope,
  type Recipe,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import { assetRefFromColumns, timestamps } from "../rows";

type RecipeRow = Awaited<
  ReturnType<ReturnType<typeof getClient>["recipe"]["findFirstOrThrow"]>
>;

export function toRecipe(row: RecipeRow): Recipe {
  return recipeSchema.parse({
    ...row,
    cover: row.coverType
      ? assetRefFromColumns({
          assetType: row.coverType,
          mediaAssetId: row.coverAssetId,
          jobId: row.coverJobId,
          outputId: row.coverOutputId,
        })
      : null,
    ...timestamps(row),
  });
}

export async function listRecipes(
  db: DatabaseContext,
  scope: OwnerScope,
): Promise<Recipe[]> {
  const rows = await getClient(db).recipe.findMany({
    where: { ownerId: scope.ownerId },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return rows.map(toRecipe);
}

export async function getRecipe(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<Recipe | null> {
  const row = await getClient(db).recipe.findFirst({
    where: { id, ownerId: scope.ownerId },
  });
  return row ? toRecipe(row) : null;
}
