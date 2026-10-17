import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Play, Plus } from "lucide-react";
import {
  lookPrompt,
  approvedTake,
  type Project,
  type Revision,
  type Sequence,
  type Shot,
} from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGeneration } from "@/features/generation/store";
import { useElements } from "@/features/elements/store";
import { Thumbnail } from "@/features/library";
import { addMyShot, updateMySequence } from "@/server/sequences";
import { shotPicture } from "./model";
import { posterFor } from "./picture";
import { ShotRow } from "./shot-row";
import { SequencePlayer } from "./sequence-player";
import { exportShotList } from "./export";

export function SequenceBoard({
  initial,
  project,
  revisions,
  note,
}: {
  initial: Sequence;
  project: Project | null;
  revisions: Revision[];
  note?: string | undefined;
}) {
  const [sequence, setSequence] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  // Each opening is a fresh player, starting at the first shot.
  const [playKey, setPlayKey] = useState(0);
  const { snapshot } = useGeneration();
  const { elements } = useElements();
  const jobs = snapshot?.jobs ?? [];
  const direction = project ? lookPrompt(project.look, "video") : "";
  const playable = sequence.shots.filter((shot) => shotPicture(shot));

  async function apply(work: Promise<Sequence>) {
    setError("");
    try {
      setSequence(await work);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "That change was not saved. Try again.",
      );
      throw cause;
    }
  }

  async function saveTitle() {
    const next = title.trim();
    if (!next || next === sequence.title) return setTitle(sequence.title);
    await apply(
      updateMySequence({ data: { id: sequence.id, title: next } }),
    ).catch(() => setTitle(sequence.title));
  }

  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-8 pb-32 md:px-12 md:pt-10"
      aria-labelledby="page-title"
    >
      {project ? (
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" /> {project.name}
        </Link>
      ) : (
        <Link
          to="/sequences"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" /> Sequences
        </Link>
      )}
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 id="page-title" className="sr-only">
            {sequence.title}
          </h1>
          <label htmlFor="sequence-title" className="sr-only">
            Sequence title
          </label>
          <input
            id="sequence-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setTitle(sequence.title);
                event.currentTarget.blur();
              }
            }}
            maxLength={120}
            className="-mx-1.5 w-full max-w-2xl rounded-md bg-transparent px-1.5 text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] outline-none hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          {direction && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              <span className="text-foreground">Look</span> · {direction}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            disabled={!sequence.shots.length}
            onClick={() => exportShotList(sequence, project)}
          >
            <Download aria-hidden="true" /> Shot list
          </Button>
          <Button
            disabled={!playable.length}
            onClick={() => {
              setPlayKey((k) => k + 1);
              setPlaying(true);
            }}
          >
            <Play aria-hidden="true" /> Play sequence
          </Button>
        </div>
      </header>

      {note && (
        <p
          role="status"
          className="mt-4 max-w-2xl rounded-lg bg-muted px-4 py-3 text-sm leading-6"
        >
          {note} Edit any shot below before generating.
        </p>
      )}
      {sequence.idea && <Idea text={sequence.idea} />}

      <Filmstrip sequence={sequence} />

      {error && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {error}
        </p>
      )}

      <ol className="mt-10 space-y-3" aria-label="Shots">
        {sequence.shots.map((shot, index) => (
          <li key={shot.id}>
            <ShotRow
              shot={shot}
              index={index}
              count={sequence.shots.length}
              previous={sequence.shots[index - 1] ?? null}
              project={project}
              elements={elements}
              jobs={jobs}
              revisions={revisions}
              live={!!snapshot}
              apply={apply}
            />
            <AddShot
              last={index === sequence.shots.length - 1}
              label={
                index === sequence.shots.length - 1
                  ? "Add a shot"
                  : `Add a shot after shot ${index + 1}`
              }
              onAdd={() =>
                apply(
                  addMyShot({
                    data: {
                      sequenceId: sequence.id,
                      afterShotId: shot.id,
                      title: "New shot",
                      prompt: "",
                      framing: shot.framing,
                      camera: "static",
                      durationSeconds: shot.durationSeconds,
                      continuity: "fresh",
                    },
                  }),
                )
              }
            />
          </li>
        ))}
      </ol>
      {sequence.shots.length === 0 && (
        <div className="mt-10">
          <AddShot
            last
            label="Add the first shot"
            onAdd={() =>
              apply(
                addMyShot({
                  data: {
                    sequenceId: sequence.id,
                    title: "Opening shot",
                    framing: "wide",
                    camera: "push-in",
                  },
                }),
              )
            }
          />
        </div>
      )}
      {!snapshot && (
        <p className="mt-8 text-sm text-muted-foreground">
          Connecting to your generations…
        </p>
      )}
      <SequencePlayer
        key={playKey}
        open={playing}
        onOpenChange={setPlaying}
        title={sequence.title}
        shots={playable}
      />
    </section>
  );
}

function Idea({ text }: { text: string }) {
  return (
    <details className="group mt-5 max-w-2xl">
      <summary className="cursor-pointer text-sm text-muted-foreground select-none hover:text-foreground">
        The idea this plan came from
      </summary>
      <p className="mt-2 text-sm leading-6 whitespace-pre-line">{text}</p>
    </details>
  );
}

/** The sequence at a glance, in order; each frame jumps to its shot. */
function Filmstrip({ sequence }: { sequence: Sequence }) {
  if (!sequence.shots.length) return null;
  return (
    <nav aria-label="Sequence at a glance" className="mt-8">
      <ol className="flex snap-x gap-2 overflow-x-auto pb-2">
        {sequence.shots.map((shot, index) => {
          const picture = shotPicture(shot);
          const motion = !!approvedTake(shot, "motion")?.asset;
          return (
            <li key={shot.id} className="w-36 shrink-0 snap-start">
              <a
                href={`#shot-${shot.id}`}
                className="group block no-underline"
                aria-label={`Shot ${index + 1}: ${shot.title}`}
              >
                <span className="relative block overflow-hidden rounded-md">
                  <Thumbnail
                    src={picture ? posterFor(picture) : null}
                    kind={picture?.kind ?? "image"}
                    className="aspect-video"
                  />
                  <span className="tabular absolute top-1 left-1 rounded bg-black/70 px-1 text-[0.6875rem] font-medium text-white">
                    {index + 1}
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-foreground">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      motion
                        ? "bg-success"
                        : picture
                          ? "bg-tungsten"
                          : "bg-subtle-foreground/50",
                    )}
                  />
                  <span className="truncate">{shot.title}</span>
                  <span className="sr-only">
                    {motion
                      ? "(motion approved)"
                      : picture
                        ? "(keyframe approved)"
                        : "(not started)"}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function AddShot({
  label,
  last,
  onAdd,
}: {
  label: string;
  /** The end of the sequence gets a full button; in-between stays quiet. */
  last: boolean;
  onAdd: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className={last ? "flex py-3" : "group flex justify-center py-1"}>
      <Button
        variant={last ? "outline" : "ghost"}
        size={last ? "sm" : "xs"}
        disabled={busy}
        className={
          last
            ? undefined
            : "text-muted-foreground opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
        }
        onClick={() => {
          setBusy(true);
          onAdd()
            .catch(() => {})
            .finally(() => setBusy(false));
        }}
      >
        <Plus aria-hidden="true" /> {label}
      </Button>
    </div>
  );
}
