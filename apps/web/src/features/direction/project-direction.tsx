import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookmarkPlus, Clapperboard } from "lucide-react";
import { LOOK_FIELDS, type Look, type Project } from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { Thumbnail } from "@/features/library";
import { saveProject, type ProjectShot } from "@/server/projects";
import { DirectionChips, directionParts, LookControls } from "./controls";
import { acceptProject } from "./projects";

function sameLook(a: Look, b: Look) {
  return [...LOOK_FIELDS, "notes" as const].every(
    (key) => (a[key] ?? "") === (b[key] ?? ""),
  );
}

/**
 * The project's shared look. Saving changes what new shots start from; shots
 * already made keep the look they were made with.
 */
export function ProjectLook({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: (project: Project) => void;
}) {
  const [look, setLook] = useState<Look>(project.look);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = !sameLook(look, project.look);
  async function save() {
    setSaving(true);
    setError("");
    try {
      const next = await saveProject({ data: { id: project.id, look } });
      acceptProject(next);
      onSaved(next);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The look could not be saved.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="mt-12" aria-labelledby="look-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="look-title" className="text-lg font-medium">
            Look
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Every new shot in {project.name} starts from this look. A shot can
            change any part of it for itself; shots already made keep the look
            they were made with.
          </p>
        </div>
      </div>
      <form
        className="mt-5 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <LookControls
          look={look}
          onChange={(next) => {
            setLook(next);
            setSaved(false);
          }}
          disabled={saving}
        />
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[7.5rem_1fr]">
          <label htmlFor="look-notes" className="pt-1.5 text-sm font-medium">
            Anything else
          </label>
          <input
            id="look-notes"
            value={look.notes ?? ""}
            maxLength={300}
            disabled={saving}
            placeholder="e.g. salt haze on every horizon, no visible sky above the cliffs"
            onChange={(event) => {
              const notes = event.target.value;
              const next = { ...look };
              if (notes) next.notes = notes;
              else delete next.notes;
              setLook(next);
              setSaved(false);
            }}
            className="h-9 w-full max-w-2xl rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 sm:pl-[8.5rem]">
          <Button type="submit" size="sm" disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save look"}
          </Button>
          {dirty && !saving && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLook(project.look)}
            >
              Discard changes
            </Button>
          )}
          <span role="status" className="text-xs text-muted-foreground">
            {saved && !dirty ? "Saved. New shots start from this look." : ""}
          </span>
          {error && (
            <span role="alert" className="text-xs text-destructive">
              {error}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

/** Shots generated in the project, each with the direction it was made with. */
export function ProjectShots({
  project,
  shots,
}: {
  project: Project;
  shots: readonly ProjectShot[];
}) {
  return (
    <section className="mt-14" aria-labelledby="shots-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="shots-title" className="text-lg font-medium">
          Shots
        </h2>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/" search={{ project: project.id }}>
            <Clapperboard aria-hidden="true" /> Make a shot
          </Link>
        </Button>
      </div>
      {shots.length === 0 ? (
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Images and videos you make with this project chosen in the studio land
          here, carrying its look.{" "}
          <Link to="/" search={{ project: project.id }}>
            Make the first shot
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {shots.map((shot) => {
            const direction = shot.direction;
            const parts = direction
              ? directionParts(
                  direction.overrides,
                  direction.project?.look,
                  direction.shot,
                  shot.kind,
                )
              : [];
            const earlier =
              direction?.project &&
              !sameLook(direction.project.look, project.look);
            return (
              <li key={shot.jobId} className="min-w-0">
                <span className="relative block aspect-video overflow-hidden rounded-lg bg-black">
                  {shot.posterUrl ? (
                    <Thumbnail
                      src={shot.posterUrl}
                      kind={shot.kind}
                      className="size-full"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      {shot.state === "failed"
                        ? "Failed"
                        : shot.state === "cancelled"
                          ? "Cancelled"
                          : "Generating…"}
                    </span>
                  )}
                </span>
                <p className="mt-2 line-clamp-2 text-sm leading-5">
                  {shot.prompt}
                </p>
                <DirectionChips parts={parts} className="mt-2" />
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{shot.model}</span>
                  {direction?.recipe && (
                    <span>Recipe: {direction.recipe.name}</span>
                  )}
                  {earlier && <span>Made with an earlier look</span>}
                  {shot.url && (
                    <Link
                      to="/recipes/new"
                      search={{ job: shot.jobId }}
                      className="inline-flex items-center gap-1 text-muted-foreground no-underline hover:text-foreground"
                    >
                      <BookmarkPlus aria-hidden="true" className="size-3.5" />
                      Save as recipe
                    </Link>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
