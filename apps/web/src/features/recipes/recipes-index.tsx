import { Link } from "@tanstack/react-router";
import {
  CAPABILITIES,
  directionLabel,
  LOOK_OPTIONS,
  SHOT_OPTIONS,
  type Capability,
  type Recipe,
  type RecipeSpecInput,
} from "@open-cinema/contracts";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/media-url";
import { SessionRequired } from "@/features/elements/visuals";
import { BUILTIN_RECIPES, type BuiltinRecipe } from "./collection";
import { useRecipes } from "./store";
import "./recipes.css";

/** The few words that name a treatment: framing, palette, light. */
export function treatmentWords(spec: RecipeSpecInput) {
  return [
    directionLabel(SHOT_OPTIONS.framing, spec.shot?.framing),
    directionLabel(LOOK_OPTIONS.palette, spec.look?.palette),
    directionLabel(LOOK_OPTIONS.lighting, spec.look?.lighting),
  ].filter(Boolean);
}

export function RecipesIndex() {
  const { status, recipes } = useRecipes();
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <PageHeader
        title="Recipes"
        description="Direction that worked, ready for your own Characters, Locations and Things. Start from an example, or save a shot you like as a recipe of your own."
      />
      <Collection />
      <section className="mt-16" aria-labelledby="mine-title">
        <h2 id="mine-title" className="text-lg font-medium">
          Your recipes
        </h2>
        {status === "loading" ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : status === "signed-out" ? (
          <SessionRequired className="px-0 md:px-0" />
        ) : status === "error" ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Your recipes could not be loaded. Reload the page to try again.
          </p>
        ) : recipes.length === 0 ? (
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            None yet. Under any finished shot in the Studio or Activity, choose{" "}
            <span className="text-foreground">Save as recipe</span> to keep its
            prompt, look and Element roles; or open an example above and make it
            your own.
          </p>
        ) : (
          <ul className="mt-4 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <PersonalRecipe key={recipe.id} recipe={recipe} />
            ))}
          </ul>
        )}
      </section>
      <BuildingBlocks />
    </section>
  );
}

function Collection() {
  const [lead, ...rest] = BUILTIN_RECIPES;
  return (
    <section className="mt-10" aria-labelledby="collection-title">
      <h2 id="collection-title" className="text-lg font-medium">
        Start from an example
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        Each example shows its treatment on one subject and the same subject
        treated differently, so you can see what it does before you cast your
        own.
      </p>
      <ul className="recipe-collection mt-6">
        {lead && <ExampleTile recipe={lead} lead />}
        {rest.map((recipe) => (
          <ExampleTile key={recipe.id} recipe={recipe} />
        ))}
      </ul>
    </section>
  );
}

function ExampleTile({
  recipe,
  lead = false,
}: {
  recipe: BuiltinRecipe;
  lead?: boolean;
}) {
  return (
    <li className={cn("recipe-tile", lead && "recipe-tile-lead")}>
      <Link
        to="/recipes/$recipeId"
        params={{ recipeId: recipe.id }}
        className="group block no-underline"
      >
        <span className="recipe-frame">
          <img
            src={`/recipes/${recipe.example.image}`}
            alt=""
            loading={lead ? "eager" : "lazy"}
            decoding="async"
          />
          {recipe.spec.medium === "video" && (
            <span className="absolute top-2 left-2 rounded-md bg-scrim/85 px-1.5 py-0.5 text-caption font-medium text-on-media">
              Video
            </span>
          )}
        </span>
        <span className="mt-3 block text-body font-medium group-hover:underline">
          {recipe.name}
        </span>
        <span className="mt-1 block max-w-prose text-sm leading-6 text-muted-foreground">
          {recipe.summary}
        </span>
        <span className="mt-2 block text-xs text-muted-foreground">
          {treatmentWords(recipe.spec).join(" · ")}
        </span>
      </Link>
    </li>
  );
}

function PersonalRecipe({ recipe }: { recipe: Recipe }) {
  const cover = recipe.cover ? assetUrl(recipe.cover) : null;
  return (
    <li>
      <Link
        to="/recipes/$recipeId"
        params={{ recipeId: recipe.id }}
        className="group block no-underline"
      >
        <span className="recipe-frame aspect-video">
          {cover ? (
            <img src={cover} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
              No cover yet
            </span>
          )}
        </span>
        <span className="mt-2 block text-sm font-medium group-hover:underline">
          {recipe.name}
        </span>
        <span className="tabular mt-0.5 block text-xs text-muted-foreground">
          {recipe.spec.medium === "video" ? "Video" : "Image"} · version{" "}
          {recipe.version}
          {recipe.uses > 0 &&
            ` · used ${recipe.uses} ${recipe.uses === 1 ? "time" : "times"}`}
        </span>
      </Link>
    </li>
  );
}

const KIND_LABELS: Record<Capability["kind"], string> = {
  model: "Model",
  adapter: "LoRA adapter",
  technique: "Technique",
};

/** Named capabilities: what each contributes, what it works with, its limits. */
function BuildingBlocks() {
  const blocks = Object.values(CAPABILITIES);
  return (
    <section className="mt-16" aria-labelledby="blocks-title">
      <h2 id="blocks-title" className="text-lg font-medium">
        Building blocks
      </h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
        The models, LoRA adapters and techniques recipes are made of. FLUX makes
        the stills and LTX the motion; adapters add one specific control on top.
      </p>
      <dl className="mt-6 divide-y divide-border border-y border-border">
        {blocks.map((block) => (
          <div
            key={block.id}
            className="grid gap-x-8 gap-y-2 py-5 md:grid-cols-[14rem_1fr_12rem]"
          >
            <dt>
              <span className="block text-sm font-medium">{block.name}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {KIND_LABELS[block.kind]} · {block.runsOn}
              </span>
            </dt>
            <dd className="text-sm leading-6">
              <p>{block.purpose}</p>
              <p className="text-muted-foreground">{block.influence}</p>
              {block.limitations.length > 0 && (
                <ul className="mt-1 text-xs leading-5 text-muted-foreground">
                  {block.limitations.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              )}
            </dd>
            <dd className="text-xs leading-5 text-muted-foreground md:text-right">
              <span
                className={cn(
                  "inline-block rounded-md px-1.5 py-0.5 font-medium",
                  block.status === "ready"
                    ? "bg-success/12 text-success"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {block.status === "ready" ? "In the studio" : "Coming"}
              </span>
              <span className="mt-1 block">
                {block.media
                  .map((m) => (m === "image" ? "Images" : "Video"))
                  .join(" and ")}
                {block.readsReferences ? " · reads your references" : ""}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
