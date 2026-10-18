import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Clapperboard, FolderOpen, Sparkles } from "lucide-react";
import { lookPrompt } from "@open-cinema/contracts";
import type { Project, SequenceSummary } from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Thumbnail } from "@/features/library";
import { MentionTextarea } from "@/features/elements/mentions";
import { useElements } from "@/features/elements/store";
import { stateHandle } from "@/features/elements/model";
import { createMySequence, planMySequence } from "@/server/sequences";
import { takeUrl } from "./model";

const NO_PROJECT = "none";

export function SequencesIndex({
  sequences,
  projects,
  initialProjectId,
}: {
  sequences: SequenceSummary[];
  projects: Project[];
  initialProjectId?: string | undefined;
}) {
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <PageHeader
        title="Sequences"
        description="Turn an idea into shots that belong together. Each shot keeps your cast, place and look, and is approved on its own."
        actions={
          <Button asChild variant="outline">
            <Link to="/projects">
              <FolderOpen aria-hidden="true" /> Projects
            </Link>
          </Button>
        }
      />
      <IdeaComposer projects={projects} initialProjectId={initialProjectId} />
      <section className="mt-14" aria-labelledby="sequences-title">
        <h2 id="sequences-title" className="text-lg font-medium">
          Your sequences
        </h2>
        {sequences.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon={Clapperboard}
            title="No sequences yet"
          >
            <p>
              Describe a moment above, a few sentences or a rough script. The
              studio proposes shots; you change any of them before making a
              single frame.
            </p>
          </EmptyState>
        ) : (
          <ul className="mt-4 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {sequences.map((sequence) => {
              const project = projects.find((p) => p.id === sequence.projectId);
              return (
                <li key={sequence.id}>
                  <Link
                    to="/sequences/$sequenceId"
                    params={{ sequenceId: sequence.id }}
                    className="group block no-underline"
                  >
                    <Thumbnail
                      src={sequence.poster ? takeUrl(sequence.poster) : null}
                      kind="video"
                      className="aspect-video rounded-lg"
                    />
                    <span className="mt-2 block text-sm font-medium group-hover:underline">
                      {sequence.title}
                    </span>
                    <span className="tabular mt-0.5 block text-xs text-muted-foreground">
                      {sequence.shotCount}{" "}
                      {sequence.shotCount === 1 ? "shot" : "shots"} ·{" "}
                      {sequence.approvedCount} with approved motion
                      {project ? ` · ${project.name}` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}

function IdeaComposer({
  projects,
  initialProjectId,
}: {
  projects: Project[];
  initialProjectId?: string | undefined;
}) {
  const navigate = useNavigate();
  const { elements } = useElements();
  const [idea, setIdea] = useState("");
  const [projectId, setProjectId] = useState(
    projects.some((p) => p.id === initialProjectId)
      ? initialProjectId!
      : NO_PROJECT,
  );
  const [busy, setBusy] = useState<"plan" | "empty" | null>(null);
  const [error, setError] = useState("");
  const project = projects.find((p) => p.id === projectId);

  async function start(mode: "plan" | "empty") {
    if (busy) return;
    setBusy(mode);
    setError("");
    try {
      const plan =
        mode === "plan"
          ? await planMySequence({
              data: {
                idea: idea.trim(),
                direction: project
                  ? lookPrompt(project.look, "video").slice(0, 2000)
                  : "",
                elements: elements.slice(0, 40).map((e) => ({
                  handle: e.handle,
                  type: e.type,
                  name: e.name,
                  description: e.description.slice(0, 1000),
                  states: e.states.slice(0, 12).map(stateHandle),
                })),
              },
            })
          : null;
      const sequence = await createMySequence({
        data: {
          title: plan?.title ?? "Untitled sequence",
          idea: idea.trim(),
          ...(project ? { projectId: project.id } : {}),
          shots: plan?.shots ?? [
            { title: "Opening shot", framing: "wide", camera: "push-in" },
          ],
        },
      });
      await navigate({
        to: "/sequences/$sequenceId",
        params: { sequenceId: sequence.id },
        search: plan?.note ? { note: plan.note } : {},
      });
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "The sequence could not be started. Try again.",
      );
      setBusy(null);
    }
  }

  return (
    <form
      className="mt-8"
      onSubmit={(event) => {
        event.preventDefault();
        void start("plan");
      }}
    >
      <label htmlFor="sequence-idea" className="mb-2 block text-sm font-medium">
        The idea
      </label>
      <MentionTextarea
        id="sequence-idea"
        value={idea}
        onValueChange={setIdea}
        disabled={!!busy}
        rows={5}
        maxLength={8000}
        placeholder="@Mara finds an old letter in the lighthouse, reads it by the window as the storm rolls in, then runs down to the shore. Type @ to cast your Elements."
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="sequence-project"
            className="text-sm text-muted-foreground"
          >
            Project
          </label>
          <Select
            value={projectId}
            onValueChange={setProjectId}
            disabled={!!busy}
          >
            <SelectTrigger id="sequence-project" size="sm" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={!!busy}
            onClick={() => void start("empty")}
          >
            {busy === "empty" ? "Starting…" : "Start empty"}
          </Button>
          <Button type="submit" disabled={!!busy || idea.trim().length < 3}>
            <Sparkles aria-hidden="true" />
            {busy === "plan" ? "Planning shots…" : "Plan the shots"}
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {project && lookPrompt(project.look, "video")
          ? `Shots will carry ${project.name}’s look: ${lookPrompt(project.look, "video")}`
          : "Planning reads your idea and your Elements; it makes no images and costs a fraction of a credit."}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
