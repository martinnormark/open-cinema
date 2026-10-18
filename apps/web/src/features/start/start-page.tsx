import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Brush,
  ChevronDown,
  Expand,
  FastForward,
  Film,
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
import {
  goals,
  type Goal,
  type GoalId,
  type TakeGoal,
  type WorldGoal,
} from "./goals";
import "./start.css";

const GOAL_ICONS: Record<GoalId, LucideIcon> = {
  move: Mountain,
  recast: UserRound,
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
  const option = (g: Goal) => (
    <GoalOption
      key={g.id}
      option={g}
      checked={g.id === goal.id}
      onGoal={onGoal}
    />
  );
  return (
    <div className="flex flex-col gap-5">
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
  checked,
  onGoal,
}: {
  option: Goal;
  checked: boolean;
  onGoal: (id: GoalId) => void;
}) {
  const Icon = GOAL_ICONS[option.id as GoalId];
  return (
    <label
      data-checked={checked || undefined}
      className="start-goal group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 has-focus-visible:ring-2 has-focus-visible:ring-ring"
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
  const [chosen, setChosen] = useState<string | null>(null);
  const element = candidates.find((e) => e.id === chosen) ?? null;
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
  const drop = useFileDrop((files) => void upload(files));

  return (
    <div className="flex flex-col gap-6">
      <div
        {...drop.handlers}
        data-active={drop.active || undefined}
        className="start-drop relative flex min-h-72 flex-col items-center justify-center rounded-sm px-6 py-10 text-center sm:aspect-video sm:min-h-0 sm:py-0"
      >
        <CropMarks />
        <Upload
          aria-hidden="true"
          strokeWidth={1.5}
          className="start-drop-icon size-6 text-subtle-foreground"
        />
        <h2 key={goal.id} className="start-swap mt-4 text-lg font-medium">
          {goal.title}
        </h2>
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
          {uploading ? (
            <span role="status" className="start-pending">
              Uploading {uploading}…
            </span>
          ) : (
            "Drop a take here. MP4, MOV or WebM, up to two minutes."
          )}
        </p>
        <Button
          className="mt-5"
          disabled={!!uploading}
          onClick={() => input.current?.click()}
        >
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
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
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
          onChoose={(e) => setChosen(e?.id ?? null)}
        />
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
  onChoose,
}: {
  type: ElementType;
  elements: Element[];
  chosen: Element | null;
  onChoose: (element: Element | null) => void;
}) {
  const info = elementTypes[type];
  if (!elements.length)
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Works best with a {info.label} of your own.{" "}
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
