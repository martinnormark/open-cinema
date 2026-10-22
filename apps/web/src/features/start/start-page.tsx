import { useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Brush,
  ChevronDown,
  Expand,
  FastForward,
  Film,
  Footprints,
  Mountain,
  Package,
  Palette,
  PenLine,
  RotateCcw,
  Sparkles,
  Upload,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  approvedMotionReferences,
  assetRefKey,
  type ElementType,
} from "@open-cinema/contracts";
import { CropMarks } from "@/components/empty-state";
import { LoopingClip } from "@/components/looping-clip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DurationBadge,
  Thumbnail,
  refreshLibrary,
  uploadFiles,
  useLibrary,
  type MediaItem,
} from "@/features/library";
import { UPLOAD_ACCEPT } from "@/features/library/model";
import { useFileDrop } from "@/features/library/use-file-drop";
import { useElements } from "@/features/elements/store";
import { startSession } from "@/features/elements/generate";
import { ElementCover } from "@/features/elements/visuals";
import { mentionOf } from "@/features/elements/next-step";
import { elementTypes, type Element } from "@/features/elements/model";
import { openInStudio } from "@/features/generation/draft";
import { defaultElement } from "@/features/revision/model";
import {
  goals,
  type Goal,
  type GoalId,
  type TakeGoal,
  type WorldGoal,
} from "./goals";
import { bringSampleTake } from "./starter";
import { StarterWorld } from "./starter-card";
import "./start.css";

const GOAL_ICONS: Record<GoalId, LucideIcon> = {
  move: Mountain,
  recast: UserRound,
  moves: Footprints,
  swap: Package,
  fix: Brush,
  redo: RotateCcw,
  longer: FastForward,
  reframe: Expand,
  effect: Sparkles,
  look: Palette,
  camera: Video,
  shot: PenLine,
  scene: Film,
};

/**
 * What each take goal looks like done, on real footage: a short loop in
 * public/examples, a wipe from the take to the result where both exist.
 */
const EXAMPLES: Record<Exclude<GoalId, "shot" | "scene">, string> = {
  move: "the kitchen table take, moved to a cottage by the sea",
  recast: "the young man at the table, played by another Character",
  moves: "a studio dance, performed by Cal at the Tide Mill",
  swap: "the table lamp swapped for the storm lantern",
  fix: "the glass on the table painted out",
  redo: "a second and a half of his answer, acted again",
  longer: "the kitchen take, carried on three seconds past its end",
  reframe: "a wide take made vertical, the ceiling and floor drawn in",
  effect: "day for night on a street-side take",
  look: "a daytime café take restyled to evening",
  camera: "the café take, filmed from a step further back",
};

/**
 * The front page: what you can do, as goals. A take goal starts from footage
 * and lands in the revision studio with that mode chosen; a world goal starts
 * from Elements.
 */
export function StartPage({
  goal,
  onGoal,
}: {
  goal: Goal;
  onGoal: (id: GoalId) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  // Stacked on a phone, the stage sits under the list: bring it up to meet
  // the choice. Side by side it is already in view.
  function choose(id: GoalId) {
    onGoal(id);
    if (!matchMedia("(max-width: 1023px)").matches) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage.current?.scrollIntoView({
      block: "start",
      behavior: reduce ? "auto" : "smooth",
    });
  }
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-8 pb-32 md:px-12 md:pt-12"
      aria-labelledby="page-title"
    >
      <header className="max-w-2xl">
        <h1
          id="page-title"
          className="text-[1.75rem] leading-tight font-semibold tracking-[-0.025em] text-balance"
        >
          Bring a take, or start from your Elements
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-6 text-muted-foreground">
          Pick what should happen. Everything you did not ask to change stays as
          it was, and the original sits beside the result.
        </p>
      </header>
      <div className="mt-8 grid gap-8 lg:grid-cols-[23rem_minmax(0,1fr)] lg:gap-12">
        <GoalList goal={goal} onGoal={choose} />
        <div
          ref={stage}
          className="min-w-0 scroll-mt-20 lg:sticky lg:top-20 lg:self-start"
        >
          {goal.source === "take" ? (
            <TakeStage goal={goal} />
          ) : (
            <WorldStage goal={goal} />
          )}
        </div>
      </div>
    </section>
  );
}

function GoalList({
  goal,
  onGoal,
}: {
  goal: Goal;
  onGoal: (id: GoalId) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  // A goal chosen from a link stays visible even while "More" is closed.
  const open = moreOpen || ("more" in goal && !!goal.more);
  const take = goals.filter((g) => g.source === "take");
  const more = take.filter((g) => "more" in g && g.more);
  // One entrance for the page: the goals rise in, in reading order.
  const order = new Map<string, number>(goals.map((g, i) => [g.id, i + 1]));
  const option = (g: Goal) => (
    <GoalOption
      key={g.id}
      option={g}
      order={order.get(g.id) ?? 0}
      checked={g.id === goal.id}
      onGoal={onGoal}
    />
  );
  return (
    <div
      ref={followChoice}
      className="start-goals relative flex flex-col gap-5"
    >
      <span aria-hidden="true" className="start-goal-pill" />
      <fieldset>
        <legend className="px-3 text-xs font-medium text-muted-foreground">
          Change a take
        </legend>
        <div className="mt-2 flex flex-col gap-0.5">
          {take.filter((g) => !("more" in g && g.more)).map(option)}
          <div className="start-more" data-open={open || undefined}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="more-take-goals"
              onClick={() => setMoreOpen(!open)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronDown
                aria-hidden="true"
                className="start-more-chevron size-4 shrink-0"
              />
              {open
                ? "Fewer"
                : `More: ${more.map((g) => g.title.toLowerCase()).join(", ")}`}
            </button>
            <div
              id="more-take-goals"
              className="start-more-panel"
              inert={!open || undefined}
            >
              <div className="start-more-inner flex flex-col gap-0.5">
                {more.map(option)}
              </div>
            </div>
          </div>
        </div>
      </fieldset>
      <fieldset>
        <legend className="px-3 text-xs font-medium text-muted-foreground">
          Make from your Elements
        </legend>
        <div className="mt-2 flex flex-col gap-0.5">
          {goals.filter((g) => g.source === "world").map(option)}
        </div>
      </fieldset>
    </div>
  );
}

function GoalOption({
  option,
  order,
  checked,
  onGoal,
}: {
  option: Goal;
  order: number;
  checked: boolean;
  onGoal: (id: GoalId) => void;
}) {
  const Icon = GOAL_ICONS[option.id as GoalId];
  return (
    <label
      data-checked={checked || undefined}
      style={{ "--i": order } as CSSProperties}
      className="start-goal start-rise group relative flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 has-focus-visible:ring-2 has-focus-visible:ring-ring"
    >
      <input
        type="radio"
        name="goal"
        className="sr-only"
        checked={checked}
        onChange={() => onGoal(option.id as GoalId)}
      />
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0 transition-colors",
          checked
            ? "text-tungsten"
            : "text-subtle-foreground group-hover:text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          {option.title}
          {"caution" in option && option.caution && (
            <span className="rounded-sm bg-muted px-1.5 py-px text-[0.6875rem] font-normal text-muted-foreground">
              Experimental
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
          {option.promise}
        </span>
      </span>
    </label>
  );
}

/**
 * The chosen goal's fill slides from goal to goal (transitions.dev tabs
 * sliding), so a new choice reads as one move down the list. It takes the
 * checked goal's box: gliding when the choice changes, snapping while the
 * list itself reflows (fonts loading, "More" opening).
 */
function placeGoalPill(list: HTMLElement, glide: boolean) {
  const pill = list.querySelector<HTMLElement>(".start-goal-pill");
  const checked = list.querySelector<HTMLElement>(".start-goal[data-checked]");
  if (!pill) return;
  if (!checked || !checked.offsetHeight) {
    delete pill.dataset.placed;
    return;
  }
  // The goals sit inside fieldsets and the "More" panel; sum up to the list.
  let top = 0;
  for (
    let node: HTMLElement | null = checked;
    node && node !== list;
    node = node.offsetParent as HTMLElement | null
  )
    top += node.offsetTop;
  const snap = !glide || !pill.dataset.placed;
  if (snap) pill.style.transition = "none";
  pill.style.width = `${checked.offsetWidth}px`;
  pill.style.height = `${checked.offsetHeight}px`;
  pill.style.transform = `translateY(${top}px)`;
  if (snap) {
    void pill.offsetWidth;
    pill.style.transition = "";
    pill.dataset.placed = "true";
  }
}
function followChoice(list: HTMLDivElement | null) {
  if (!list || typeof ResizeObserver === "undefined") return;
  placeGoalPill(list, false);
  const resized = new ResizeObserver(() => placeGoalPill(list, false));
  resized.observe(list);
  const chosen = new MutationObserver(() => placeGoalPill(list, true));
  chosen.observe(list, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-checked"],
  });
  return () => {
    resized.disconnect();
    chosen.disconnect();
  };
}

/** Signed out, nothing can be stored yet; say so where the drop would land. */
function useSession() {
  const library = useLibrary((s) => s.status);
  const { status } = useElements();
  return {
    signedOut: library === "signed-out" || status === "signed-out",
    async start() {
      await startSession();
      await refreshLibrary();
    },
  };
}

function TakeStage({ goal }: { goal: TakeGoal }) {
  const navigate = useNavigate();
  const session = useSession();
  const items = useLibrary((s) => s.items);
  const clips = items.filter((item) => item.kind === "video").slice(0, 6);
  const { elements } = useElements();
  const candidates = goal.element
    ? elements.filter((e) => e.type === goal.element)
    : [];
  // Per goal, so clearing the Location for Restyle leaves Replace background's.
  const [chosen, setChosen] = useState<Record<string, string | null>>({});
  const pick = chosen[goal.id];
  const element =
    pick === undefined
      ? defaultElement(goal.kind, candidates)
      : (candidates.find((e) => e.id === pick) ?? null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function open(item: MediaItem) {
    void navigate({
      to: "/revisions/new",
      search: {
        kind: goal.kind,
        source: assetRefKey(item.ref),
        ...(element ? { element: element.id } : {}),
      },
    });
  }
  async function upload(files: File[]) {
    const file = files.find((f) => f.type.startsWith("video/"));
    setError("");
    if (!file) {
      setError("That is not a video. Drop an MP4, MOV or WebM take.");
      return;
    }
    setUploading(file.name);
    try {
      if (session.signedOut) await session.start();
      const [item] = await uploadFiles([file]);
      if (item) open(item);
      else
        setError(
          "The take could not be uploaded. Your Library shows why and can retry it.",
        );
    } catch {
      setError("The take could not be uploaded. Try again.");
    } finally {
      setUploading(null);
    }
  }
  async function trySample() {
    setError("");
    setUploading("the kitchen table take");
    try {
      const item = await bringSampleTake(session.signedOut);
      if (item) open(item);
      else setError("The sample take could not be added. Try again.");
    } catch {
      setError("The sample take could not be added. Try again.");
    } finally {
      setUploading(null);
    }
  }
  const drop = useFileDrop((files) => void upload(files));

  return (
    <div className="flex flex-col gap-6">
      <div
        {...drop.handlers}
        data-active={drop.active || undefined}
        className="start-drop relative isolate flex min-h-80 flex-col justify-end overflow-hidden rounded-sm sm:aspect-video sm:min-h-0"
      >
        <div key={goal.id} aria-hidden="true" className="start-example">
          <LoopingClip
            src={`/examples/${goal.id}.mp4`}
            poster={`/examples/${goal.id}.jpg`}
          />
        </div>
        <div aria-hidden="true" className="start-scrim" />
        <CropMarks />
        <p
          key={`example-${goal.id}`}
          className="start-swap absolute top-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-sm bg-background/80 px-2 py-1 text-xs text-foreground/85"
        >
          Example: {EXAMPLES[goal.id as keyof typeof EXAMPLES]}
        </p>
        <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
          <div className="min-w-0 max-w-sm">
            <h2
              key={goal.id}
              className="start-swap flex items-center gap-2 text-lg font-medium"
            >
              <Upload
                aria-hidden="true"
                strokeWidth={1.75}
                className="start-drop-icon size-4 shrink-0"
              />
              {goal.title}
            </h2>
            <p className="mt-1 text-sm leading-6 text-foreground/80">
              {uploading ? (
                <span role="status" className="start-pending">
                  Uploading {uploading}…
                </span>
              ) : drop.active ? (
                "Let go to start with this take."
              ) : (
                "Drop a take here. MP4, MOV or WebM, up to two minutes."
              )}
            </p>
          </div>
          <Button disabled={!!uploading} onClick={() => input.current?.click()}>
            Choose a take
          </Button>
          <input
            ref={input}
            type="file"
            accept={UPLOAD_ACCEPT.split(",")
              .filter((t) => t.startsWith("video/"))
              .join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length) void upload(files);
            }}
          />
          {error && (
            <p role="alert" className="w-full text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>

      <p key={goal.id} className="start-swap -mt-2 text-sm leading-6">
        {goal.keeps}
        {goal.caution && (
          <span className="block text-muted-foreground">{goal.caution}</span>
        )}
      </p>

      {goal.element && (
        <ElementPick
          type={goal.element}
          elements={candidates}
          chosen={element}
          required={goal.kind === "character" || goal.kind === "object"}
          onChoose={(e) => setChosen({ ...chosen, [goal.id]: e?.id ?? null })}
        />
      )}

      {clips.length === 0 && (
        <p className="text-sm leading-6 text-muted-foreground">
          No footage to hand?{" "}
          <button
            type="button"
            disabled={!!uploading}
            onClick={() => void trySample()}
            className="font-medium text-foreground underline decoration-border underline-offset-[0.2em] outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            Try it on the kitchen table take
          </button>
        </p>
      )}

      {clips.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">
            Or one of your clips
          </h3>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {clips.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  className="group block w-full text-left outline-none"
                  aria-label={`${goal.title}: ${item.title}`}
                >
                  <span className="relative block overflow-hidden rounded-md ring-offset-2 ring-offset-background group-focus-visible:ring-2 group-focus-visible:ring-ring">
                    <Thumbnail
                      src={item.thumbnailUrl}
                      kind="video"
                      className="start-clip aspect-video"
                    />
                    <DurationBadge item={item} className="right-1 bottom-1" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The Element that makes the result yours; optional, the studio asks again. */
function ElementPick({
  type,
  elements,
  chosen,
  required,
  onChoose,
}: {
  type: ElementType;
  elements: Element[];
  chosen: Element | null;
  required: boolean;
  onChoose: (element: Element | null) => void;
}) {
  const info = elementTypes[type];
  if (!elements.length)
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        {required ? "Needs" : "Works best with"} a {info.label} of your own.{" "}
        <Link to="/elements/new" search={{ type }}>
          Make a {info.label}
        </Link>
      </p>
    );
  return (
    <fieldset>
      <legend className="text-xs font-medium text-muted-foreground">
        With one of your {info.plural}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {elements.slice(0, 8).map((element) => {
          const checked = chosen?.id === element.id;
          return (
            <label
              key={element.id}
              data-checked={checked || undefined}
              className="start-chip flex cursor-pointer items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => onChoose(checked ? null : element)}
              />
              <ElementCover element={element} className="size-6 rounded-full" />
              {element.name}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function WorldStage({ goal }: { goal: WorldGoal }) {
  const navigate = useNavigate();
  const session = useSession();
  const { elements, status } = useElements();
  const [busy, setBusy] = useState(false);
  const cast = elements.slice(0, 6);
  // As "Use @Name in Studio": a Location with a move starts on video.
  function use(element: Element) {
    const moving =
      element.type === "location" &&
      approvedMotionReferences(element).length > 0;
    openInStudio({
      prompt: `${mentionOf(element, null)} `,
      medium: moving ? "video" : "image",
      overrides: {},
      shot: {},
    });
    void navigate({ to: "/studio" });
  }
  // Nothing of their own yet: offer a world to start from, the way the
  // Elements and Sequences pages do.
  if (!cast.length && status !== "loading")
    return (
      <div className="flex flex-col gap-6">
        <div className="relative rounded-sm bg-surface/60 p-5 sm:p-6">
          <CropMarks />
          <StarterWorld signedOut={session.signedOut} compact />
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Or begin with your own:{" "}
          {session.signedOut ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void session.start().finally(() => setBusy(false));
              }}
              className="font-medium text-foreground underline decoration-border underline-offset-[0.2em] outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busy ? "starting…" : "start a local session"}
            </button>
          ) : (
            <Link to="/elements/new">make an Element</Link>
          )}
          {session.signedOut ? " and make an Element." : "."}
        </p>
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      <div className="relative flex min-h-72 flex-col justify-end rounded-sm bg-surface/60 p-6 sm:aspect-video sm:min-h-0">
        <CropMarks />
        {cast.length ? (
          <ul
            className="grid flex-1 grid-cols-3 gap-2 pb-5"
            key={goal.id}
            aria-label="Your Elements"
          >
            {cast.map((element) => (
              <li key={element.id} className="min-h-0">
                {goal.to === "/studio" ? (
                  <button
                    type="button"
                    onClick={() => use(element)}
                    className="group relative block size-full overflow-hidden rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ElementCover
                      element={element}
                      className="start-clip size-full"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-background/80 px-2 py-1 text-xs">
                      Use {mentionOf(element, null)}
                    </span>
                  </button>
                ) : (
                  <span className="relative block size-full overflow-hidden rounded-md">
                    <ElementCover element={element} className="size-full" />
                    <span className="absolute inset-x-0 bottom-0 bg-background/80 px-2 py-1 text-xs">
                      {mentionOf(element, null)}
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-sm font-medium">
              {status === "loading"
                ? "Loading your Elements…"
                : "No Elements yet"}
            </p>
            <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
              Characters, Locations and Things keep faces, places and props the
              same from shot to shot.
            </p>
            {session.signedOut ? (
              <Button
                variant="outline"
                className="mt-4"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void session.start().finally(() => setBusy(false));
                }}
              >
                {busy ? "Starting…" : "Start local session"}
              </Button>
            ) : (
              <Button asChild variant="outline" className="mt-4">
                <Link to="/elements/new">Make an Element</Link>
              </Button>
            )}
          </div>
        )}
      </div>
      <div
        key={goal.id}
        className="start-swap flex flex-wrap items-start justify-between gap-4"
      >
        <div className="min-w-0 max-w-md">
          <h2 className="text-lg font-medium">{goal.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {goal.to === "/studio"
              ? "Pick an Element above to start with it, or write from scratch and type @ to bring them in."
              : "Mention your Elements as @Name and each shot keeps them. Nothing is generated until you approve the plan."}
          </p>
        </div>
        <Button asChild>
          <Link to={goal.to}>{goal.action}</Link>
        </Button>
      </div>
    </div>
  );
}
