import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  CircleSlash,
  Copy,
  Info,
  PencilLine,
} from "lucide-react";
import {
  CAPABILITIES,
  recipeSpecSchema,
  STATE_KIND_LABELS,
  templateSlotKeys,
  type Element,
  type ElementState,
  type Project,
  type Recipe,
  type RecipeSlot,
  type RecipeSpec,
} from "@open-cinema/contracts";
import { estimateGeneration } from "@open-cinema/comfy/estimates";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { assetUrl, elementTypes } from "@/features/elements/model";
import { resolveMentions } from "@/features/elements/mentions";
import { useElements } from "@/features/elements/store";
import { DirectionChips, directionParts } from "@/features/direction/controls";
import { setCurrentProject, useProjects } from "@/features/direction/projects";
import { openInStudio } from "@/features/generation/draft";
import { studioRequest } from "@/features/generation/request";
import { acceptSnapshot } from "@/features/generation/store";
import {
  formatCost,
  shouldShowEstimate,
  useCostPreferences,
} from "@/features/settings/preferences";
import { submitWorkflow } from "@/server/generation";
import {
  compatibility,
  recipeDirection,
  recipePrompt,
  type SlotChoices,
} from "./apply";
import { builtinRecipe, type BuiltinRecipe } from "./collection";
import { RecipeEditor } from "./recipe-editor";
import { createRecipe, deleteRecipe, updateRecipe, useRecipes } from "./store";
import "./recipes.css";

interface RecipeView {
  id: string;
  version: number;
  name: string;
  summary: string;
  spec: RecipeSpec;
  builtin: BuiltinRecipe | null;
  personal: Recipe | null;
}

function viewFor(id: string, recipes: readonly Recipe[]): RecipeView | null {
  const builtin = builtinRecipe(id);
  if (builtin)
    return {
      id: builtin.id,
      version: 1,
      name: builtin.name,
      summary: builtin.summary,
      spec: recipeSpecSchema.parse(builtin.spec),
      builtin,
      personal: null,
    };
  const personal = recipes.find((r) => r.id === id);
  return personal
    ? {
        id: personal.id,
        version: personal.version,
        name: personal.name,
        summary: personal.summary,
        spec: personal.spec,
        builtin: null,
        personal,
      }
    : null;
}

export function RecipePage({
  recipeId,
  editing,
}: {
  recipeId: string;
  editing: boolean;
}) {
  const { status, recipes } = useRecipes();
  const view = viewFor(recipeId, recipes);
  if (!view)
    return (
      <section className="mx-auto w-full max-w-6xl px-6 py-10 md:px-12 md:py-14">
        <BackLink />
        <h1 id="page-title" className="mt-3 text-[1.75rem] font-semibold">
          {status === "loading" ? "Loading recipe…" : "This recipe isn’t here"}
        </h1>
        {status !== "loading" && (
          <p className="mt-2 text-sm text-muted-foreground">
            It may have been deleted, or it belongs to another session.
          </p>
        )}
      </section>
    );
  if (editing && view.personal)
    return (
      <section
        className="mx-auto w-full max-w-4xl px-6 pt-8 pb-32 md:px-12 md:pt-10"
        aria-labelledby="page-title"
      >
        <BackLink />
        <h1
          id="page-title"
          className="mt-3 text-[1.75rem] leading-tight font-semibold tracking-[-0.025em]"
        >
          Edit {view.name}
        </h1>
        <p className="mt-2 max-w-2xl text-[0.9375rem] leading-6 text-muted-foreground">
          Saving a change makes version {view.version + 1}; version{" "}
          {view.version} stays in the history.
        </p>
        <EditRecipe recipe={view.personal} />
      </section>
    );
  return <RecipeDetail key={`${view.id}:${view.version}`} view={view} />;
}

function BackLink() {
  return (
    <Link
      to="/recipes"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground no-underline hover:text-foreground"
    >
      <ArrowLeft aria-hidden="true" className="size-3.5" /> Recipes
    </Link>
  );
}

function EditRecipe({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  return (
    <RecipeEditor
      initial={{
        name: recipe.name,
        summary: recipe.summary,
        spec: recipe.spec,
      }}
      askForNote
      submitLabel="Save new version"
      onCancel={() =>
        navigate({
          to: "/recipes/$recipeId",
          params: { recipeId: recipe.id },
          search: {},
        })
      }
      onSave={async ({ name, summary, spec, note }) => {
        await updateRecipe({
          id: recipe.id,
          name,
          summary,
          spec,
          ...(note ? { note } : {}),
        });
        await navigate({
          to: "/recipes/$recipeId",
          params: { recipeId: recipe.id },
          search: {},
        });
      }}
    />
  );
}

function RecipeDetail({ view }: { view: RecipeView }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function makeMine() {
    setBusy(true);
    setError("");
    try {
      const recipe = await createRecipe({
        name: `${view.name} (mine)`,
        summary: view.summary,
        spec: view.spec,
        parentId: view.id,
      });
      await navigate({
        to: "/recipes/$recipeId",
        params: { recipeId: recipe.id },
        search: { edit: true },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not copy the recipe.");
      setBusy(false);
    }
  }
  const parent = view.personal?.parentId
    ? (builtinRecipe(view.personal.parentId)?.name ?? null)
    : null;
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-8 pb-32 md:px-12 md:pt-10"
      aria-labelledby="page-title"
    >
      <BackLink />
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1
            id="page-title"
            className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-balance"
          >
            {view.name}
          </h1>
          <p className="mt-2 max-w-2xl text-[0.9375rem] leading-6 text-muted-foreground">
            {view.summary ||
              (view.spec.medium === "video"
                ? "A video recipe."
                : "An image recipe.")}
          </p>
          {view.personal && (
            <p className="tabular mt-1 text-xs text-muted-foreground">
              Version {view.version}
              {parent && ` · adapted from ${parent}`}
              {view.personal.uses > 0 &&
                ` · used ${view.personal.uses} ${view.personal.uses === 1 ? "time" : "times"}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {view.builtin ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void makeMine()}
            >
              <Copy aria-hidden="true" /> {busy ? "Copying…" : "Make it my own"}
            </Button>
          ) : (
            <>
              <Button variant="outline" asChild>
                <Link
                  to="/recipes/$recipeId"
                  params={{ recipeId: view.id }}
                  search={{ edit: true }}
                >
                  <PencilLine aria-hidden="true" /> Edit
                </Link>
              </Button>
              <DeleteRecipe id={view.id} name={view.name} />
            </>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0">
          <Preview view={view} />
          <Treatment view={view} />
        </div>
        <UseRecipe view={view} />
      </div>
      {view.personal && view.personal.history.length > 0 && (
        <History recipe={view.personal} />
      )}
    </section>
  );
}

function DeleteRecipe({ id, name }: { id: string; name: string }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  if (!confirming)
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    );
  return (
    <span className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Delete {name}?</span>
      <Button
        variant="destructive"
        size="sm"
        onClick={() =>
          deleteRecipe(id)
            .then(() => navigate({ to: "/recipes" }))
            .catch((e: unknown) =>
              setError(e instanceof Error ? e.message : "Could not delete."),
            )
        }
      >
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

/** The example, and the same subject under each alternative treatment. */
function Preview({ view }: { view: RecipeView }) {
  const builtin = view.builtin;
  const frames = builtin
    ? [
        {
          id: "recipe",
          label: "This recipe",
          image: `/recipes/${builtin.example.image}`,
        },
        ...builtin.alternatives.map((a) => ({
          id: a.id,
          label: a.label,
          image: `/recipes/${a.image}`,
        })),
      ]
    : view.personal?.cover
      ? [{ id: "recipe", label: "Cover", image: assetUrl(view.personal.cover) }]
      : [];
  const [active, setActive] = useState("recipe");
  const video =
    builtin?.spec.medium === "video"
      ? `/recipes/${builtin.example.image.replace(/\.webp$/, ".mp4")}`
      : null;
  if (!frames.length)
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-surface text-sm text-muted-foreground">
        No cover yet. Generate with this recipe and keep a result as its cover.
      </div>
    );
  const aspect =
    view.spec.medium === "video"
      ? "16 / 9"
      : view.spec.aspectRatio === "auto"
        ? "1 / 1"
        : view.spec.aspectRatio.replace(":", " / ");
  return (
    <figure>
      {video ? (
        <video
          src={video}
          poster={frames[0]!.image}
          controls
          muted
          playsInline
          loop
          preload="metadata"
          aria-label={`${view.name} example`}
          className="aspect-video w-full rounded-xl bg-black object-contain"
        />
      ) : (
        <div className="recipe-stage" style={{ aspectRatio: aspect }}>
          {frames.map((frame) => (
            <img
              key={frame.id}
              src={frame.image}
              alt={frame.id === active ? `${view.name}: ${frame.label}` : ""}
              data-active={frame.id === active}
              decoding="async"
            />
          ))}
        </div>
      )}
      {frames.length > 1 && (
        <div className="mt-3">
          <p id="alternatives-label" className="text-xs text-muted-foreground">
            Same subject, other treatments
          </p>
          <div
            role="radiogroup"
            aria-labelledby="alternatives-label"
            className="mt-2 flex flex-wrap gap-3"
          >
            {frames.map((frame) => (
              <button
                key={frame.id}
                type="button"
                role="radio"
                aria-checked={frame.id === active}
                onClick={() => setActive(frame.id)}
                onPointerEnter={() => setActive(frame.id)}
                className="group w-28 text-left outline-none"
              >
                <span
                  className={cn(
                    "block aspect-video overflow-hidden rounded-md ring-offset-2 ring-offset-background transition-shadow duration-(--duration-quick) group-focus-visible:ring-2 group-focus-visible:ring-ring",
                    frame.id === active ? "ring-2 ring-tungsten" : "ring-0",
                  )}
                >
                  <img
                    src={frame.image}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </span>
                <span
                  className={cn(
                    "mt-1.5 block text-xs leading-4",
                    frame.id === active
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {frame.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

/** The template with its slots marked, the source subjects and the treatment. */
function Treatment({ view }: { view: RecipeView }) {
  const { spec } = view;
  const parts = directionParts(spec.look, undefined, spec.shot, spec.medium);
  const pieces = spec.template.split(/(\{[a-z][a-z0-9]{0,19}\}|\[|\])/);
  const slotLabel = (key: string) =>
    spec.slots.find((s) => s.key === key)?.label ?? key;
  return (
    <dl className="mt-8 grid gap-6 text-sm">
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Prompt</dt>
        <dd className="mt-1.5 max-w-prose leading-7">
          {pieces.map((piece, i) => {
            const slot = /^\{([a-z][a-z0-9]{0,19})\}$/.exec(piece)?.[1];
            if (slot)
              return (
                <span key={i} className="recipe-slot-token">
                  {slotLabel(slot)}
                </span>
              );
            if (piece === "[" || piece === "]") return null;
            return <span key={i}>{piece}</span>;
          })}
        </dd>
      </div>
      {view.builtin && (
        <div>
          <dt className="text-xs font-medium text-muted-foreground">
            Example made with
          </dt>
          <dd className="mt-1.5 grid gap-1">
            {Object.entries(view.builtin.example.subjects).map(
              ([key, text]) => (
                <p key={key} className="leading-6">
                  <span className="text-muted-foreground">
                    {slotLabel(key)}:
                  </span>{" "}
                  {text}
                </p>
              ),
            )}
          </dd>
        </div>
      )}
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Treatment</dt>
        <dd className="mt-2">
          <DirectionChips parts={parts} />
        </dd>
      </div>
      <div>
        <dt className="text-xs font-medium text-muted-foreground">Uses</dt>
        <dd className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {spec.capabilities.map((id) => (
            <span key={id}>
              {CAPABILITIES[id].name}
              {CAPABILITIES[id].status === "planned" && (
                <span className="text-muted-foreground"> (coming)</span>
              )}
            </span>
          ))}
        </dd>
      </div>
      {spec.notes && (
        <div>
          <dt className="text-xs font-medium text-muted-foreground">
            What to expect
          </dt>
          <dd className="mt-1.5 max-w-prose leading-6 text-muted-foreground">
            {spec.notes}
          </dd>
        </div>
      )}
    </dl>
  );
}

const NO_PROJECT = "none";

/** Cast your own Elements into the recipe's slots and generate. */
function UseRecipe({ view }: { view: RecipeView }) {
  const { spec } = view;
  const navigate = useNavigate();
  const { elements, status } = useElements();
  const projects = useProjects();
  const preferences = useCostPreferences();
  const [choices, setChoices] = useState<SlotChoices>({});
  const [chosenProject, setChosenProject] = useState<
    string | null | undefined
  >();
  const [keepProjectLook, setKeepProjectLook] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState<string | null>(null);
  const projectId =
    chosenProject !== undefined ? chosenProject : projects.currentId;
  const project: Project | null =
    projects.projects.find((p) => p.id === projectId) ?? null;
  const prompt = recipePrompt(spec, choices);
  const notes = compatibility(spec, choices);
  const blocked = notes.some((n) => n.level === "blocker");
  const direction = recipeDirection(
    { id: view.id, version: view.version, name: view.name },
    spec,
    project,
    keepProjectLook,
  );
  const mentions = resolveMentions(prompt, elements);
  const request = studioRequest(
    prompt,
    mentions,
    spec.medium,
    spec.aspectRatio,
    direction,
    null,
    spec.durationSeconds,
  );
  const estimate = estimateGeneration(request);
  const slotKeys = templateSlotKeys(spec.template);
  async function generate() {
    setBusy(true);
    setError("");
    setStarted(null);
    try {
      const result = await submitWorkflow({
        data: {
          idempotencyKey: crypto.randomUUID(),
          request,
          ...(project ? { projectId: project.id } : {}),
        },
      });
      if (result.ok) {
        acceptSnapshot(result.snapshot);
        setStarted(result.jobId ?? "started");
      } else setError(result.error);
    } catch {
      setError(
        "The request was interrupted. Check Activity before trying again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside
      aria-labelledby="use-title"
      className="h-fit rounded-xl border border-border p-5 lg:sticky lg:top-6"
    >
      <h2 id="use-title" className="text-base font-medium">
        Use with your Elements
      </h2>
      <div className="mt-4 grid gap-5">
        {spec.slots
          .slice()
          .sort((a, b) => slotKeys.indexOf(a.key) - slotKeys.indexOf(b.key))
          .map((slot) => (
            <SlotPicker
              key={slot.key}
              slot={slot}
              elements={elements.filter((e) => e.type === slot.type)}
              loading={status === "loading"}
              choice={choices[slot.key]}
              onChange={(choice) =>
                setChoices((current) => ({ ...current, [slot.key]: choice }))
              }
            />
          ))}
        <div>
          <label htmlFor="recipe-project" className="text-sm font-medium">
            Project
          </label>
          <Select
            value={project?.id ?? NO_PROJECT}
            onValueChange={(value) => {
              const id = value === NO_PROJECT ? null : value;
              setChosenProject(id);
              setCurrentProject(id);
            }}
          >
            <SelectTrigger id="recipe-project" className="mt-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projects.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {project && (
            <div className="mt-3">
              <p
                id="recipe-look-label"
                className="text-xs text-muted-foreground"
              >
                Look
              </p>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={keepProjectLook ? "project" : "recipe"}
                onValueChange={(value) =>
                  value && setKeepProjectLook(value === "project")
                }
                aria-labelledby="recipe-look-label"
                className="mt-1.5"
              >
                <ToggleGroupItem value="recipe" className="px-3">
                  Recipe’s look
                </ToggleGroupItem>
                <ToggleGroupItem value="project" className="px-3">
                  {project.name}’s look
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>
        <DirectionChips
          parts={directionParts(
            direction.overrides,
            direction.project?.look,
            direction.shot,
            spec.medium,
          )}
        />
        {notes.length > 0 && (
          <ul
            aria-label="Before you generate"
            className="grid gap-2 text-xs leading-5"
          >
            {notes.map((note) => (
              <li key={note.text} className="flex gap-2">
                {note.level === "blocker" ? (
                  <CircleSlash
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-destructive"
                  />
                ) : note.level === "warning" ? (
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-warning"
                  />
                ) : (
                  <Info
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-subtle-foreground"
                  />
                )}
                <span
                  className={
                    note.level === "info" ? "text-muted-foreground" : undefined
                  }
                >
                  {note.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={blocked || busy} onClick={() => void generate()}>
            {busy
              ? "Sending…"
              : spec.medium === "video"
                ? "Generate video"
                : "Generate image"}
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              openInStudio({
                prompt,
                medium: spec.medium,
                overrides: direction.overrides,
                shot: direction.shot,
                aspectRatio: spec.aspectRatio,
                durationSeconds: spec.durationSeconds,
                recipe: { id: view.id, version: view.version, name: view.name },
              });
              if (project) setCurrentProject(project.id);
              void navigate({ to: "/" });
            }}
          >
            Open in studio
          </Button>
        </div>
        <p className="tabular text-xs leading-5 text-muted-foreground">
          {spec.medium === "video"
            ? `LTX 2.5 · ${spec.durationSeconds} s · 720p`
            : `FLUX 3 · 1K ${spec.aspectRatio}`}
          {shouldShowEstimate(preferences, spec.medium) &&
            estimate.credits &&
            ` · about ${formatCost(estimate.credits, preferences.unit)}`}
          {project && ` · filed under ${project.name}`}
        </p>
        {started && (
          <p role="status" className="text-sm leading-6">
            Generating.{" "}
            {project ? (
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
              >
                Follow it in {project.name}
              </Link>
            ) : (
              <Link to="/library">It lands in your Library</Link>
            )}
            .
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}

const NONE = "none";

function SlotPicker({
  slot,
  elements,
  loading,
  choice,
  onChange,
}: {
  slot: RecipeSlot;
  elements: readonly Element[];
  loading: boolean;
  choice: SlotChoices[string];
  onChange: (choice: SlotChoices[string]) => void;
}) {
  const id = `slot-${slot.key}`;
  const type = elementTypes[slot.type];
  function toggle(state: ElementState) {
    if (!choice) return;
    const on = choice.states.some((s) => s.id === state.id);
    // One state per kind: choosing another of the same kind replaces it.
    const states = on
      ? choice.states.filter((s) => s.id !== state.id)
      : [
          ...choice.states.filter(
            (s) => s.kind === "other" || s.kind !== state.kind,
          ),
          state,
        ].slice(-3);
    onChange({ ...choice, states });
  }
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {slot.label}
        {slot.optional && (
          <span className="font-normal text-muted-foreground"> · optional</span>
        )}
      </label>
      {slot.hint && (
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {slot.hint}
        </p>
      )}
      {elements.length === 0 && !loading ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          You have no {type.plural.toLowerCase()} yet.{" "}
          <Link to="/elements/new" search={{ type: slot.type }}>
            Create one
          </Link>
          .
        </p>
      ) : (
        <Select
          value={choice?.element.id ?? NONE}
          onValueChange={(value) => {
            const element = elements.find((e) => e.id === value);
            onChange(element ? { element, states: [] } : undefined);
          }}
        >
          <SelectTrigger id={id} className="mt-2 w-full">
            <SelectValue placeholder={`Choose a ${type.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>
              {slot.optional ? "None" : `Choose a ${type.label.toLowerCase()}`}
            </SelectItem>
            {elements.map((element) => (
              <SelectItem key={element.id} value={element.id}>
                {element.name}
                <span className="text-muted-foreground">@{element.handle}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {choice && choice.element.states.length > 0 && (
        <div
          role="group"
          aria-label={`${choice.element.name}'s states`}
          className="mt-2 flex flex-wrap gap-1.5"
        >
          {choice.element.states.map((state) => {
            const on = choice.states.some((s) => s.id === state.id);
            return (
              <button
                key={state.id}
                type="button"
                aria-pressed={on}
                title={STATE_KIND_LABELS[state.kind]}
                onClick={() => toggle(state)}
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-2.5 text-xs transition-colors duration-(--duration-quick) outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-tungsten/70 bg-tungsten/12 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {state.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function History({ recipe }: { recipe: Recipe }) {
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState<number | null>(null);
  return (
    <section className="mt-16" aria-labelledby="history-title">
      <h2 id="history-title" className="text-lg font-medium">
        History
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Restoring an earlier version saves it as a new one, so nothing is lost.
      </p>
      <ol className="mt-4 divide-y divide-border border-y border-border">
        <li className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-sm">
          <span>
            <span className="tabular font-medium">
              Version {recipe.version}
            </span>{" "}
            <span className="text-muted-foreground">· current</span>
          </span>
        </li>
        {recipe.history.map((entry) => (
          <li
            key={entry.version}
            className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-sm"
          >
            <span className="min-w-0">
              <span className="tabular font-medium">
                Version {entry.version}
              </span>{" "}
              <span className="text-muted-foreground">
                · {entry.name} · {new Date(entry.savedAt).toLocaleString()}
              </span>
              {entry.note && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Replaced because: {entry.note}
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={restoring !== null}
              onClick={() => {
                setRestoring(entry.version);
                setError("");
                updateRecipe({
                  id: recipe.id,
                  name: entry.name,
                  spec: entry.spec,
                  note: `Restored version ${entry.version}`,
                })
                  .catch((e: unknown) =>
                    setError(
                      e instanceof Error ? e.message : "Could not restore.",
                    ),
                  )
                  .finally(() => setRestoring(null));
              }}
            >
              {restoring === entry.version ? "Restoring…" : "Restore"}
            </Button>
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
