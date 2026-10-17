import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getJobContext, listRecipes } from "@open-cinema/database/queries";
import {
  createRecipe,
  deleteRecipe,
  updateRecipe,
} from "@open-cinema/database/mutations";
import {
  createRecipeInputSchema,
  recipeFromGeneration,
  resultOutputs,
  updateRecipeInputSchema,
  type AssetRef,
  type Recipe,
  type RecipeSpec,
} from "@open-cinema/contracts";
import { assetUrl, posterUrl } from "@/lib/media-url";
import { saveFailure, mutate, owner } from "./scope";

function failure(error: unknown): never {
  return saveFailure(error, "Your recipe could not be saved. Try again.");
}

export const listMyRecipes = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ signedIn: boolean; recipes: Recipe[] }> => {
    let context;
    try {
      context = await owner();
    } catch {
      return { signedIn: false, recipes: [] };
    }
    return {
      signedIn: true,
      recipes: await listRecipes(context.db, context.scope),
    };
  },
);

export const saveNewRecipe = createServerFn({ method: "POST" })
  .validator(createRecipeInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return createRecipe(db, scope, data).catch(failure);
  });

export const saveRecipe = createServerFn({ method: "POST" })
  .validator(updateRecipeInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    const recipe = await updateRecipe(db, scope, data).catch(failure);
    if (!recipe) throw new Error("This recipe is no longer available.");
    return recipe;
  });

export const removeRecipe = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return { ok: await deleteRecipe(db, scope, data.id) };
  });

export interface RecipeDraft {
  spec: RecipeSpec;
  cover: AssetRef | null;
  coverUrl: string | null;
  prompt: string;
  /** The Elements the generation used, by slot. */
  examples: Record<string, string>;
}

/** A recipe draft from a finished generation, to name and save. */
export const draftRecipeFromJob = createServerFn({ method: "GET" })
  .validator(z.object({ jobId: z.string().min(1).max(100) }))
  .handler(async ({ data }): Promise<RecipeDraft | null> => {
    const { db, scope } = await owner();
    const context = await getJobContext(db, scope, data.jobId);
    if (!context?.request) return null;
    const spec = recipeFromGeneration(context.request, context.mentions);
    if (!spec) return null;
    const output = resultOutputs(context.job.outputs).find((o) => o.r2Key);
    const examples: Record<string, string> = {};
    for (const slot of spec.slots) {
      const name = /First made with (.+)\.$/.exec(slot.hint)?.[1];
      if (name) examples[slot.key] = name;
    }
    const cover = output
      ? ({
          type: "job-output",
          jobId: context.job.id,
          outputId: output.id,
        } as const)
      : null;
    return {
      spec,
      cover,
      coverUrl:
        cover && output
          ? output.mediaType.startsWith("video/")
            ? posterUrl(cover)
            : assetUrl(cover)
          : null,
      prompt: context.job.prompt,
      examples,
    };
  });
