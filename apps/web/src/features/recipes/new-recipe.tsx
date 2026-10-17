import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import type { RecipeDraft } from "@/server/recipes";
import { RecipeEditor } from "./recipe-editor";
import { createRecipe } from "./store";
import "./recipes.css";

const BLANK = {
  name: "",
  summary: "",
  spec: {
    medium: "image" as const,
    template: "{subject} stands in [{place}], looking toward the light",
    slots: [],
  },
};

/** Saves a shot that worked, or starts a recipe from a blank template. */
export function NewRecipe({
  draft,
  fromJob,
}: {
  draft: RecipeDraft | null;
  fromJob: boolean;
}) {
  const navigate = useNavigate();
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <Link
        to="/recipes"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" /> Recipes
      </Link>
      <PageHeader
        title={draft ? "Save as recipe" : "New recipe"}
        description={
          draft
            ? "The prompt, direction and Element roles from this shot. The Elements it used became slots, so the recipe works with any Character, Location or Thing."
            : "Write a prompt with slots for Elements, then choose the shot and look it carries."
        }
      />
      {fromJob && !draft && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          That shot could not be turned into a recipe. Start from a blank one
          below.
        </p>
      )}
      <div className="grid gap-x-12 lg:grid-cols-[1fr_18rem]">
        <RecipeEditor
          initial={draft ? { name: "", summary: "", spec: draft.spec } : BLANK}
          submitLabel="Save recipe"
          onCancel={() => navigate({ to: "/recipes" })}
          onSave={async ({ name, summary, spec }) => {
            const recipe = await createRecipe({
              name,
              summary,
              spec,
              ...(draft?.cover ? { cover: draft.cover } : {}),
            });
            await navigate({
              to: "/recipes/$recipeId",
              params: { recipeId: recipe.id },
              search: {},
            });
          }}
        />
        {draft && (
          <aside className="mt-8 lg:sticky lg:top-10 lg:self-start">
            {draft.coverUrl && (
              <span className="recipe-frame aspect-video">
                <img src={draft.coverUrl} alt="The shot this recipe keeps" />
              </span>
            )}
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Original prompt
            </p>
            <p className="mt-1 text-sm leading-6">{draft.prompt}</p>
            {Object.keys(draft.examples).length > 0 && (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Made with{" "}
                {Object.entries(draft.examples)
                  .map(([key, name]) => `${name} as {${key}}`)
                  .join(", ")}
              </p>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}
