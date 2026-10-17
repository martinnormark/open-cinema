import { useSyncExternalStore } from "react";
import type {
  CreateRecipeInput,
  Recipe,
  UpdateRecipeInput,
} from "@open-cinema/contracts";
import {
  listMyRecipes,
  removeRecipe,
  saveNewRecipe,
  saveRecipe,
} from "@/server/recipes";

interface RecipesState {
  status: "loading" | "ready" | "signed-out" | "error";
  recipes: Recipe[];
}

const initial: RecipesState = { status: "loading", recipes: [] };
let state = initial;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: RecipesState) {
  state = next;
  for (const listener of listeners) listener();
}

export function reloadRecipes() {
  loading = listMyRecipes()
    .then((result) =>
      emit({
        status: result.signedIn ? "ready" : "signed-out",
        recipes: result.recipes,
      }),
    )
    .catch(() => emit({ ...state, status: "error" }));
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loading) void reloadRecipes();
  return () => listeners.delete(listener);
}

export function useRecipes() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
}

function message(error: unknown, fallback: string) {
  return new Error(
    error instanceof Error && error.message ? error.message : fallback,
  );
}

function accept(recipe: Recipe) {
  emit({
    ...state,
    recipes: [recipe, ...state.recipes.filter((r) => r.id !== recipe.id)],
  });
  return recipe;
}

export async function createRecipe(input: CreateRecipeInput) {
  try {
    return accept(await saveNewRecipe({ data: input }));
  } catch (error) {
    throw message(error, "The recipe could not be saved.");
  }
}

export async function updateRecipe(input: UpdateRecipeInput) {
  try {
    return accept(await saveRecipe({ data: input }));
  } catch (error) {
    throw message(error, "The recipe could not be saved.");
  }
}

export async function deleteRecipe(id: string) {
  try {
    await removeRecipe({ data: { id } });
  } catch (error) {
    throw message(error, "The recipe could not be deleted.");
  }
  emit({ ...state, recipes: state.recipes.filter((r) => r.id !== id) });
}
