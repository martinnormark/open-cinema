import { useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowRight, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Textarea } from "@/components/ui/textarea";
import { useGeneration } from "@/features/generation/store";
import { startSession } from "@/features/elements/generate";
import { LOOK_NOTES_MAX, lookPrompt } from "@open-cinema/contracts";
import { startProject, type ProjectSummary } from "@/server/revisions";
import "./revision.css";

export function ProjectsIndex({
  signedIn,
  projects,
}: {
  signedIn: boolean;
  projects: ProjectSummary[];
}) {
  const [creating, setCreating] = useState(projects.length === 0);
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <PageHeader
        title="Projects"
        description="A project holds its direction, sources and revisions, so every new shot belongs."
        actions={
          !creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" /> New project
            </Button>
          )
        }
      />
      {creating && (
        <NewProject
          signedIn={signedIn}
          onCancel={projects.length ? () => setCreating(false) : undefined}
        />
      )}
      {projects.length > 0 ? (
        <ul className="mt-10 divide-y divide-border border-y border-border">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="group flex items-center gap-4 py-4 no-underline"
              >
                <FolderOpen
                  aria-hidden="true"
                  className="size-4 shrink-0 text-subtle-foreground group-hover:text-tungsten"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {project.name}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {lookPrompt(project.look, "image") || "No look yet"}
                  </span>
                </span>
                <span className="tabular hidden text-xs text-muted-foreground sm:block">
                  {project.revisionCount}{" "}
                  {project.revisionCount === 1 ? "revision" : "revisions"}
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 text-subtle-foreground transition-transform duration-(--duration-quick) group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        !creating && (
          <EmptyState
            className="mt-10"
            icon={FolderOpen}
            title="No projects yet"
            actions={
              <Button onClick={() => setCreating(true)}>New project</Button>
            }
          >
            <p>
              Start one to keep a shot’s sources, revisions and direction
              together.
            </p>
          </EmptyState>
        )
      )}
    </section>
  );
}

function NewProject({
  signedIn,
  onCancel,
}: {
  signedIn: boolean;
  onCancel?: (() => void) | undefined;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const { snapshot } = useGeneration();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (!signedIn || !snapshot) await startSession();
      const project = await startProject({
        data: {
          name: name.trim(),
          ...(notes.trim() ? { look: { notes: notes.trim() } } : {}),
        },
      });
      await router.invalidate();
      await navigate({
        to: "/projects/$projectId",
        params: { projectId: project.id },
      });
    } catch {
      setError(
        "The project could not be created. Check that local testing is set up, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="revision-reveal mt-8 grid max-w-2xl gap-4 rounded-xl bg-surface p-5"
      aria-label="New project"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <div>
        <label htmlFor="project-name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
          autoFocus
          placeholder="The Lighthouse Keeper"
          className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label htmlFor="project-look" className="text-sm font-medium">
          Look{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="project-look"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={LOOK_NOTES_MAX}
          rows={3}
          placeholder="Cold blue-grey palette, practical light only, slow push-ins, 35mm grain"
          className="mt-2 text-sm leading-6"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          What every shot shares. Set palette, light, lens and pacing one by one
          on the project page.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create project"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
