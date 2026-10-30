import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  directionPrompt,
  LOOK_FIELDS,
  type Look,
  type ShotDirection,
} from "@open-cinema/contracts";
import {
  DirectionChips,
  directionParts,
  LookControls,
  ShotControls,
} from "./controls";

/**
 * The studio's direction bar: a one-line summary of how the shot will look,
 * and a disclosure with the shot's own choices.
 */
export function StudioDirection({
  overrides,
  onOverrides,
  shot,
  onShot,
  medium,
  recipe,
  onClearRecipe,
  disabled,
}: {
  overrides: Look;
  onOverrides: (look: Look) => void;
  shot: ShotDirection;
  onShot: (shot: ShotDirection) => void;
  medium: "image" | "video";
  recipe: { name: string } | null;
  onClearRecipe: () => void;
  disabled?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const parts = directionParts(overrides, shot, medium);
  const adds = directionPrompt({ overrides, shot }, medium);
  return (
    <div className="mt-4 rounded-xl border border-border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2 pl-3">
        {recipe && (
          <span className="inline-flex h-7 items-center gap-1 rounded-md bg-secondary pr-1 pl-2 text-xs">
            Recipe: {recipe.name}
            <button
              type="button"
              onClick={onClearRecipe}
              disabled={disabled}
              aria-label={`Stop using the ${recipe.name} recipe`}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </span>
        )}
        {/* Below sm the summary takes its own row under the recipe and the
            disclosure, so it never squeezes into a one-word column. */}
        <div className="order-last min-w-0 grow basis-full sm:order-none sm:basis-0">
          {parts.length ? (
            <DirectionChips parts={parts} />
          ) : (
            <span className="text-xs text-muted-foreground">
              No direction: the prompt alone decides the look.
            </span>
          )}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="studio-direction-panel"
          onClick={() => setOpen(!open)}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Direct this shot
          <ChevronDown
            aria-hidden="true"
            className="direction-chevron size-4"
          />
        </button>
      </div>
      <div
        id="studio-direction-panel"
        className="direction-panel"
        data-open={open}
      >
        <div inert={!open}>
          <div className="grid gap-7 border-t border-border p-4 md:p-5">
            <section aria-labelledby="direction-shot-title">
              <h3 id="direction-shot-title" className="text-sm font-medium">
                Shot
              </h3>
              <p className="mt-0.5 mb-3 text-xs leading-5 text-muted-foreground">
                Framing, focus and performance for this shot only.
              </p>
              <ShotControls shot={shot} onChange={onShot} disabled={disabled} />
            </section>
            <section aria-labelledby="direction-look-title">
              <h3 id="direction-look-title" className="text-sm font-medium">
                Look
              </h3>
              <p className="mt-0.5 mb-3 text-xs leading-5 text-muted-foreground">
                Palette, light, lens and texture for this shot.
              </p>
              <LookControls
                look={overrides}
                onChange={onOverrides}
                fields={
                  medium === "video"
                    ? LOOK_FIELDS
                    : LOOK_FIELDS.filter((f) => f !== "pacing")
                }
                disabled={disabled}
              />
            </section>
            {adds && (
              <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">
                  Added to your prompt:
                </span>{" "}
                {adds}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
