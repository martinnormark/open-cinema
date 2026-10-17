import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, X } from "lucide-react";
import {
  directionPrompt,
  LOOK_FIELDS,
  type Look,
  type Project,
  type ShotDirection,
} from "@open-cinema/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DirectionChips,
  directionParts,
  LookControls,
  ShotControls,
} from "./controls";

const NONE = "none";

/**
 * The studio's direction bar: which project a shot belongs to, a one-line
 * summary of how it will look, and a disclosure with the shot's own choices.
 */
export function StudioDirection({
  projects,
  project,
  onProject,
  overrides,
  onOverrides,
  shot,
  onShot,
  medium,
  recipe,
  onClearRecipe,
  disabled,
}: {
  projects: readonly Project[];
  project: Project | null;
  onProject: (id: string | null) => void;
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
  const base = project?.look;
  const parts = directionParts(overrides, base, shot, medium);
  const adds = directionPrompt(
    {
      ...(project
        ? {
            project: { id: project.id, name: project.name, look: project.look },
          }
        : {}),
      overrides,
      shot,
    },
    medium,
  );
  const overrideCount = parts.filter((p) => p.override).length;
  return (
    <div className="mt-4 rounded-xl border border-border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2 pl-3">
        <Select
          value={project?.id ?? NONE}
          onValueChange={(value) => onProject(value === NONE ? null : value)}
          disabled={disabled}
        >
          <SelectTrigger
            size="sm"
            aria-label="Project"
            className="max-w-56 min-w-36"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <div className="min-w-0 flex-1">
          {parts.length ? (
            <DirectionChips parts={parts} />
          ) : (
            <span className="text-xs text-muted-foreground">
              {project
                ? "This project has no look yet."
                : "No direction: the prompt alone decides the look."}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="studio-direction-panel"
          onClick={() => setOpen(!open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Direct this shot
          {overrideCount > 0 && (
            <span className="tabular text-xs text-tungsten">
              {overrideCount} changed
            </span>
          )}
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
                {project ? (
                  <>
                    From {project.name}. A change here applies to this shot
                    only;{" "}
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                    >
                      edit the project look
                    </Link>{" "}
                    to change every new shot.
                  </>
                ) : (
                  "Choose a project to share one look across shots, or set one for this shot."
                )}
              </p>
              <LookControls
                look={overrides}
                base={base}
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
