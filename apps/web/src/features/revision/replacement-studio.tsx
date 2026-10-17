import { useMemo, useRef, useState, type PointerEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Crosshair,
  Film,
  ImageOff,
  Lock,
  Library,
  Mountain,
  UserRound,
} from "lucide-react";
import {
  DEFAULT_PRESERVATION,
  approvedReferences,
  assetRefKey,
  type AssetRef,
  type GenerationRequestInput,
  type PreservedAspect,
} from "@open-cinema/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/features/library/model";
import {
  MediaPicker,
  Thumbnail,
  useLibrary,
  type MediaItem,
} from "@/features/library";
import { acceptSnapshot, useGeneration } from "@/features/generation/store";
import { startSession } from "@/features/elements/generate";
import { useElements } from "@/features/elements/store";
import {
  assetUrl as elementAssetUrl,
  stateHandle,
  type Element,
  type ElementState,
} from "@/features/elements/model";
import { submitRevision } from "@/server/revisions";
import { useCostPreferences } from "@/features/settings/preferences";
import { estimateReplacement } from "./estimate";
import {
  formatEstimate,
  formatTimecode,
  preservedLabels,
  replacementKinds,
  wardrobeIntents,
  type ReplacementKind,
  type RevisionDecisions,
  type WardrobeIntent,
} from "./model";
import "./revision.css";

interface Target {
  x: number;
  y: number;
  timeMs: number;
}

/** Aspects a kind of replacement can never give up; the rest are the creator's call. */
const LOCKED: Record<ReplacementKind, readonly PreservedAspect[]> = {
  background: ["foreground", "performance"],
  character: ["performance", "background"],
};
const OFFERED: Record<ReplacementKind, readonly PreservedAspect[]> = {
  background: [
    "foreground",
    "performance",
    "timing",
    "camera",
    "framing",
    "audio",
    "lighting",
  ],
  character: [
    "performance",
    "background",
    "other-people",
    "things",
    "timing",
    "camera",
    "framing",
    "audio",
    "lighting",
  ],
};

export function ReplacementStudio({
  initialSource,
  initialKind = "background",
  projectId,
  parentRevisionId,
}: {
  initialSource?: AssetRef | null;
  initialKind?: ReplacementKind | undefined;
  projectId?: string | undefined;
  parentRevisionId?: string | undefined;
}) {
  const navigate = useNavigate();
  const { snapshot } = useGeneration();
  const { elements, status: elementsStatus } = useElements();

  const items = useLibrary((s) => s.items);
  const libraryStatus = useLibrary((s) => s.status);
  const videos = useMemo(
    () => items.filter((item) => item.kind === "video"),
    [items],
  );
  const [sourceKey, setSourceKey] = useState<string | null>(
    initialSource ? assetRefKey(initialSource) : null,
  );
  const source =
    sourceKey === null
      ? (videos[0] ?? null)
      : (videos.find((v) => assetRefKey(v.ref) === sourceKey) ?? null);
  const [kind, setKind] = useState<ReplacementKind>(initialKind);
  const [elementId, setElementId] = useState<string | null>(null);
  const [stateId, setStateId] = useState<string | null>(null);
  const [direction, setDirection] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const [targetNote, setTargetNote] = useState("");
  const [wardrobe, setWardrobe] = useState<WardrobeIntent>("character");
  const [wardrobeNote, setWardrobeNote] = useState("");
  const [preserve, setPreserve] = useState<
    Record<ReplacementKind, Set<PreservedAspect>>
  >(() => ({
    background: new Set(DEFAULT_PRESERVATION.background.preserve),
    character: new Set(DEFAULT_PRESERVATION.character.preserve),
  }));
  const [allowIntegration, setAllowIntegration] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const elementType = kind === "background" ? "location" : "character";
  const candidates = elements.filter((e) => e.type === elementType);
  const element = candidates.find((e) => e.id === elementId) ?? null;
  const state = element?.states.find((s) => s.id === stateId) ?? null;
  const references = element ? approvedReferences(element, state?.id) : [];
  const preserved = preserve[kind];
  const clipSeconds = source?.durationSeconds ?? duration;

  const { unit } = useCostPreferences();
  const estimate = formatEstimate(estimateReplacement(kind, clipSeconds), unit);

  const problems: string[] = [];
  if (!source) problems.push("Choose a clip to revise.");
  if (kind === "background" && !element && direction.trim().length < 3)
    problems.push("Choose a Location or describe the new setting.");
  if (kind === "background" && element && !references.length)
    problems.push(`${element.name} needs an approved reference first.`);
  if (kind === "character" && !element)
    problems.push("Choose the Character who takes the role.");
  if (kind === "character" && element && !references.length)
    problems.push(`${element.name} needs an approved reference first.`);
  if (kind === "character" && !target && targetNote.trim().length < 3)
    problems.push("Mark the person to recast on the frame, or describe them.");
  if (
    kind === "character" &&
    wardrobe === "describe" &&
    wardrobeNote.trim().length < 3
  )
    problems.push("Describe the wardrobe, or choose another option.");
  if (kind === "character" && clipSeconds !== null && clipSeconds < 4)
    problems.push("Recasting needs a clip of at least 4 seconds.");

  function chooseKind(next: ReplacementKind) {
    if (next === kind) return;
    setKind(next);
    setElementId(null);
    setStateId(null);
    setPendingKey(null);
    setError("");
  }
  function chooseSource(item: MediaItem) {
    setSourceKey(assetRefKey(item.ref));
    setTarget(null);
    setDuration(null);
    setPendingKey(null);
  }
  function togglePreserved(aspect: PreservedAspect) {
    if (LOCKED[kind].includes(aspect)) return;
    setPreserve((current) => {
      const next = new Set(current[kind]);
      if (next.has(aspect)) next.delete(aspect);
      else next.add(aspect);
      return { ...current, [kind]: next };
    });
    setPendingKey(null);
  }

  function intentSentence() {
    const mention = element
      ? `@${element.handle}${state ? `:${stateHandle(state)}` : ""}`
      : null;
    if (kind === "background") {
      const where = mention ? `Move this shot to ${mention}` : "Move this shot";
      const how = direction.trim();
      return `${where}${how ? `: ${how}` : ""}, keeping the performers and action.`;
    }
    const who = targetNote.trim() || "the marked person";
    const dress =
      wardrobe === "keep"
        ? "in the original wardrobe"
        : wardrobe === "describe"
          ? `wearing ${wardrobeNote.trim()}`
          : "in their own look";
    return `Replace ${who} with ${mention}, ${dress}, preserving their performance and everything else in the shot.`;
  }

  async function submit() {
    if (busy || problems.length || !source) return;
    setBusy(true);
    setError("");
    const key = pendingKey ?? crypto.randomUUID();
    setPendingKey(key);
    try {
      if (!snapshot) await startSession();
      const preservation = {
        preserve: [...preserved].filter(
          (a) => OFFERED[kind].includes(a) || a === "wardrobe",
        ),
        allowIntegration,
        ...(kind === "character" && wardrobe === "describe"
          ? { notes: `Wardrobe: ${wardrobeNote.trim()}` }
          : {}),
      };
      const mention = element
        ? { elementId: element.id, ...(state ? { stateId: state.id } : {}) }
        : undefined;
      const request: GenerationRequestInput =
        kind === "background"
          ? {
              workflowKind: "video.background-replace",
              inputs: {
                source: source.ref,
                ...(mention ? { location: mention } : {}),
                ...(direction.trim().length >= 3
                  ? { prompt: direction.trim() }
                  : {}),
                target: { type: "background" },
                preservation,
              },
            }
          : {
              workflowKind: "video.character-replace",
              inputs: {
                source: source.ref,
                character: mention!,
                references: [],
                target: {
                  type: "person",
                  ...(target
                    ? {
                        point: {
                          x: target.x,
                          y: target.y,
                          timeMs: target.timeMs,
                        },
                      }
                    : {}),
                  ...(targetNote.trim()
                    ? { description: targetNote.trim() }
                    : {}),
                },
                prompt: [
                  wardrobe === "keep"
                    ? "Keep the original person’s wardrobe exactly."
                    : wardrobe === "describe"
                      ? `Wardrobe for this shot: ${wardrobeNote.trim()}.`
                      : "Dress the new character as in the reference images.",
                  direction.trim(),
                ]
                  .filter(Boolean)
                  .join(" "),
                preservation: {
                  ...preservation,
                  preserve:
                    wardrobe === "keep"
                      ? [
                          ...new Set([
                            ...preservation.preserve,
                            "wardrobe" as const,
                          ]),
                        ]
                      : preservation.preserve.filter((a) => a !== "wardrobe"),
                },
              },
            };
      const decisions: RevisionDecisions = {
        kind,
        sourceTitle: source.title.slice(0, 300),
        element: element
          ? {
              id: element.id,
              name: element.name,
              handle: element.handle,
              stateName: state?.name ?? null,
              referenceCount: references.length,
            }
          : null,
        direction: direction.trim(),
        target:
          kind === "character"
            ? [
                targetNote.trim(),
                target
                  ? `marked at ${formatTimecode(target.timeMs / 1000)}`
                  : "",
              ]
                .filter(Boolean)
                .join(", ")
            : "Background",
        wardrobe: kind === "character" ? wardrobe : null,
        wardrobeNote: kind === "character" ? wardrobeNote.trim() : "",
        preserve:
          request.workflowKind === "video.character-replace" ||
          request.workflowKind === "video.background-replace"
            ? [...request.inputs.preservation.preserve]
            : [],
        allowIntegration,
        estimate: {
          cost: estimate.cost,
          time: estimate.time,
          basis: estimate.basis,
        },
      };
      const result = await submitRevision({
        data: {
          idempotencyKey: key,
          projectId,
          parentRevisionId,
          intent: intentSentence(),
          request,
          decisions,
        },
      });
      if (!result.ok) {
        setError(result.error);
        setPendingKey(null);
        return;
      }
      setPendingKey(null);
      if (result.result.ok) acceptSnapshot(result.result.snapshot);
      await navigate({
        to: "/revisions/$revisionId",
        params: { revisionId: result.revisionId },
      });
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "The request was interrupted. Try again; it reuses the same request key, so nothing runs twice.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <SourceStage
          source={source}
          markTarget={kind === "character"}
          target={target}
          onTarget={(next) => {
            setTarget(next);
            setPendingKey(null);
          }}
          onDuration={setDuration}
        />
        <ClipStrip
          videos={videos}
          loading={libraryStatus === "idle" || libraryStatus === "loading"}
          selected={source}
          onSelect={chooseSource}
        />
      </div>

      <form
        className="flex flex-col gap-7"
        aria-label="Revision decisions"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset>
          <legend className="text-sm font-medium">What changes</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["background", "character"] as const).map((option) => {
              const Icon = option === "background" ? Mountain : UserRound;
              return (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                    kind === option
                      ? "border-tungsten/70 bg-surface"
                      : "border-border hover:bg-surface",
                  )}
                >
                  <input
                    type="radio"
                    name="replacement-kind"
                    className="sr-only"
                    checked={kind === option}
                    onChange={() => chooseKind(option)}
                  />
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-4",
                      kind === option
                        ? "text-tungsten"
                        : "text-subtle-foreground",
                    )}
                  />
                  <span className="text-sm font-medium">
                    {replacementKinds[option].label}
                  </span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    {replacementKinds[option].changes}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <ElementChoice
          key={kind}
          kind={kind}
          loading={elementsStatus === "loading"}
          candidates={candidates}
          elementId={elementId}
          stateId={stateId}
          onChoose={(id, nextState) => {
            setElementId(id);
            setStateId(nextState);
            setPendingKey(null);
          }}
        />

        {kind === "character" && (
          <fieldset className="revision-reveal">
            <legend className="text-sm font-medium">Who is recast</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {target
                ? `Marked at ${formatTimecode(target.timeMs / 1000)}. Click the frame again to move it.`
                : "Pause on a clear frame and click the person. Add a few words if the shot has several people."}
            </p>
            <input
              value={targetNote}
              onChange={(event) => {
                setTargetNote(event.target.value);
                setPendingKey(null);
              }}
              maxLength={300}
              placeholder="The woman on the left, in the grey coat"
              aria-label="Describe the person to recast"
              className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </fieldset>
        )}

        {kind === "character" && (
          <fieldset className="revision-reveal">
            <legend className="text-sm font-medium">Wardrobe</legend>
            <div className="mt-2 flex flex-col gap-1">
              {(Object.keys(wardrobeIntents) as WardrobeIntent[]).map(
                (option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer gap-3 rounded-lg px-2 py-2 hover:bg-surface has-focus-visible:ring-2 has-focus-visible:ring-ring"
                  >
                    <input
                      type="radio"
                      name="wardrobe"
                      checked={wardrobe === option}
                      onChange={() => {
                        setWardrobe(option);
                        setPendingKey(null);
                      }}
                      className="mt-1 accent-(--tungsten)"
                    />
                    <span>
                      <span className="block text-sm">
                        {wardrobeIntents[option].label}
                      </span>
                      <span className="block text-xs leading-5 text-muted-foreground">
                        {wardrobeIntents[option].detail}
                      </span>
                    </span>
                  </label>
                ),
              )}
            </div>
            {wardrobe === "describe" && (
              <input
                value={wardrobeNote}
                onChange={(event) => setWardrobeNote(event.target.value)}
                maxLength={400}
                autoFocus
                placeholder="A rain-dark oilskin coat over a fisherman’s sweater"
                aria-label="Wardrobe for this shot"
                className="revision-reveal mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            )}
          </fieldset>
        )}

        <div>
          <label htmlFor="revision-direction" className="text-sm font-medium">
            {kind === "background"
              ? element
                ? "Direction (optional)"
                : "Describe the new setting"
              : "Direction (optional)"}
          </label>
          <Textarea
            id="revision-direction"
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value);
              setPendingKey(null);
            }}
            maxLength={1500}
            rows={3}
            className="mt-2 text-sm leading-6"
            placeholder={
              kind === "background"
                ? "Harbor at dusk, sodium lights coming on, light rain"
                : "Slightly older, the same quiet intensity"
            }
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">
            What stays exactly as shot
          </legend>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {OFFERED[kind].map((aspect) => {
              const locked = LOCKED[kind].includes(aspect);
              const on = preserved.has(aspect) || locked;
              return (
                <li key={aspect}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-disabled={locked}
                    title={
                      locked
                        ? "Always kept for this kind of revision"
                        : undefined
                    }
                    onClick={() => togglePreserved(aspect)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "border-transparent bg-secondary text-foreground"
                        : "border-dashed border-border text-muted-foreground hover:text-foreground",
                      locked && "cursor-default",
                    )}
                  >
                    {locked ? (
                      <Lock
                        aria-hidden="true"
                        className="size-3 text-subtle-foreground"
                      />
                    ) : on ? (
                      <Check aria-hidden="true" className="size-3" />
                    ) : null}
                    {preservedLabels[aspect]}
                  </button>
                </li>
              );
            })}
          </ul>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs leading-5 text-muted-foreground">
            <input
              type="checkbox"
              checked={allowIntegration}
              onChange={(event) => setAllowIntegration(event.target.checked)}
              className="mt-0.5 accent-(--tungsten)"
            />
            <span>
              Allow scoped integration: contact shadows, edge light and colour
              matching where the change meets the shot.
            </span>
          </label>
        </fieldset>

        <section
          aria-label="Before you generate"
          className="rounded-xl bg-surface p-4"
        >
          <p className="text-sm leading-6">{intentSentence()}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Changes</dt>
            <dd>
              {kind === "background"
                ? "Only the setting behind the people and Things"
                : "Only the marked person"}
            </dd>
            <dt className="text-muted-foreground">Keeps</dt>
            <dd>
              {[...new Set([...LOCKED[kind], ...preserved])]
                .filter((a) => OFFERED[kind].includes(a))
                .map((a) => preservedLabels[a].toLowerCase())
                .join(", ")}
            </dd>
            <dt className="text-muted-foreground">Cost</dt>
            <dd className="tabular">{estimate.cost}</dd>
            <dt className="text-muted-foreground">Time</dt>
            <dd className="tabular">
              {estimate.time} · {estimate.basis.toLowerCase()}
            </dd>
          </dl>
          {estimate.note && (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {estimate.note}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            The original stays untouched. You compare the result against it and
            decide whether to keep it.
          </p>
        </section>

        {error && (
          <p role="alert" className="text-sm leading-6 text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button
            type="submit"
            size="lg"
            disabled={busy || problems.length > 0}
          >
            {busy
              ? "Starting…"
              : pendingKey
                ? "Retry request"
                : replacementKinds[kind].label}
            <ArrowRight aria-hidden="true" />
          </Button>
          {problems.length > 0 && (
            <p className="text-xs leading-5 text-muted-foreground">
              {problems[0]}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

/** The chosen clip, large; in recast mode a click marks the person on that frame. */
function SourceStage({
  source,
  markTarget,
  target,
  onTarget,
  onDuration,
}: {
  source: MediaItem | null;
  markTarget: boolean;
  target: Target | null;
  onTarget: (target: Target) => void;
  onDuration: (seconds: number) => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [frameRatio, setFrameRatio] = useState(16 / 9);
  if (!source)
    return (
      <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border bg-surface text-center">
        <div className="max-w-xs px-6">
          <Film
            aria-hidden="true"
            className="mx-auto size-6 text-subtle-foreground"
          />
          <p className="mt-3 text-sm font-medium">Choose a clip to revise</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Upload footage or pick a generated shot below. The original is never
            changed.
          </p>
        </div>
      </div>
    );

  function mark(event: PointerEvent<HTMLDivElement>) {
    const v = video.current;
    if (!markTarget || !v || !v.videoWidth) return;
    const rect = event.currentTarget.getBoundingClientRect();
    // object-contain letterboxes the frame; map the click into frame space.
    const scale = Math.min(
      rect.width / v.videoWidth,
      rect.height / v.videoHeight,
    );
    const width = v.videoWidth * scale;
    const height = v.videoHeight * scale;
    const x = (event.clientX - rect.left - (rect.width - width) / 2) / width;
    const y = (event.clientY - rect.top - (rect.height - height) / 2) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    v.pause();
    onTarget({ x, y, timeMs: Math.round(v.currentTime * 1000) });
  }

  return (
    <figure className="m-0">
      <div
        className={cn(
          "relative aspect-video overflow-hidden rounded-xl bg-black",
          markTarget && "cursor-crosshair",
        )}
        style={{ containerType: "size" }}
        onPointerUp={mark}
      >
        <video
          key={source.id}
          ref={video}
          src={source.url}
          controls={!markTarget}
          playsInline
          preload="metadata"
          className="absolute inset-0 size-full object-contain"
          onLoadedMetadata={(event) => {
            const v = event.currentTarget;
            onDuration(v.duration);
            if (v.videoWidth) setFrameRatio(v.videoWidth / v.videoHeight);
          }}
          onClick={markTarget ? (event) => event.preventDefault() : undefined}
        />
        {markTarget && target && (
          <TargetMarker target={target} ratio={frameRatio} />
        )}
      </div>
      {markTarget && <ScrubBar video={video} />}
      <figcaption className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate text-foreground">{source.title}</span>
        {source.durationSeconds && (
          <span className="tabular">
            {formatDuration(source.durationSeconds)}
          </span>
        )}
        <span>· {source.origin === "upload" ? "Uploaded" : "Generated"}</span>
        {markTarget && (
          <span className="ml-auto flex items-center gap-1">
            <Crosshair aria-hidden="true" className="size-3" /> Click the person
            to recast
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Positioned in the letterboxed frame box, so percentages match frame space. */
function TargetMarker({ target, ratio }: { target: Target; ratio: number }) {
  return (
    <div
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{
        width: `min(100cqw, ${ratio * 100}cqh)`,
        height: `min(100cqh, ${100 / ratio}cqw)`,
      }}
    >
      <span
        key={`${target.x}-${target.y}`}
        className="target-marker absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-tungsten bg-tungsten/20 shadow-[0_0_0_4px_rgb(0_0_0/0.35)]"
        style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
      >
        <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-tungsten" />
      </span>
    </div>
  );
}

/** Frame scrubbing for target marking; writes to the video without re-rendering. */
function ScrubBar({ video }: { video: { current: HTMLVideoElement | null } }) {
  return (
    <input
      type="range"
      min={0}
      max={1000}
      defaultValue={0}
      aria-label="Choose a frame"
      className="compare-scrubber mt-2 w-full"
      onChange={(event) => {
        const v = video.current;
        if (!v || !v.duration) return;
        v.pause();
        v.currentTime = (Number(event.target.value) / 1000) * v.duration;
      }}
    />
  );
}

/** Recent clips at hand; the library picker covers everything else, uploads included. */
function ClipStrip({
  videos,
  loading,
  selected,
  onSelect,
}: {
  videos: readonly MediaItem[];
  loading: boolean;
  selected: MediaItem | null;
  onSelect: (item: MediaItem) => void;
}) {
  const [picking, setPicking] = useState(false);
  const recent = videos.slice(0, 7);
  if (selected && !recent.some((v) => v.id === selected.id))
    recent.splice(6, 1, selected);
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Your clips</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setPicking(true)}
        >
          <Library aria-hidden="true" /> Browse or upload
        </Button>
      </div>
      {loading && !videos.length ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading clips…</p>
      ) : videos.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          No clips yet. Upload footage from your library, or make a video in
          Studio first.
        </p>
      ) : (
        <ul
          className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-7"
          aria-label="Recent clips"
        >
          {recent.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={item.id === selected?.id}
                onClick={() => onSelect(item)}
                className="group block w-full text-left outline-none"
              >
                <span
                  className={cn(
                    "relative block overflow-hidden rounded-lg ring-offset-2 ring-offset-background transition-shadow group-focus-visible:ring-2 group-focus-visible:ring-ring",
                    item.id === selected?.id && "ring-2 ring-tungsten",
                  )}
                >
                  <Thumbnail
                    src={item.thumbnailUrl}
                    kind="video"
                    className="aspect-video"
                  />
                  {item.durationSeconds && (
                    <span className="tabular absolute right-1 bottom-1 rounded bg-black/70 px-1 text-[0.6875rem] text-white">
                      {formatDuration(item.durationSeconds)}
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground group-hover:text-foreground">
                  {item.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        kind="video"
        title="Choose a clip to revise"
        description="Pick footage you uploaded or a video you generated, or upload a new clip."
        onSelect={onSelect}
      />
    </div>
  );
}

function ElementChoice({
  kind,
  loading,
  candidates,
  elementId,
  stateId,
  onChoose,
}: {
  kind: ReplacementKind;
  loading: boolean;
  candidates: Element[];
  elementId: string | null;
  stateId: string | null;
  onChoose: (elementId: string | null, stateId: string | null) => void;
}) {
  const noun = kind === "background" ? "Location" : "Character";
  const selected = candidates.find((e) => e.id === elementId) ?? null;
  const cover = (element: Element, state: ElementState | null) => {
    const reference = approvedReferences(element, state?.id)[0];
    return reference ? elementAssetUrl(reference.asset) : null;
  };
  return (
    <fieldset>
      <legend className="text-sm font-medium">
        {kind === "background" ? "New setting" : "New character"}
      </legend>
      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">Loading Elements…</p>
      ) : candidates.length === 0 ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          No {noun}s yet.{" "}
          <Link to="/elements/new" className="text-foreground">
            Create a {noun}
          </Link>{" "}
          {kind === "background"
            ? "to reuse a place across shots, or describe the setting below."
            : "with approved references to cast them."}
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1" aria-label={`${noun}s`}>
          {candidates.map((element) => {
            const active = element.id === elementId;
            const count = approvedReferences(element).length;
            const image = cover(element, null);
            return (
              <li key={element.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChoose(
                      active && kind === "background" ? null : element.id,
                      null,
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring",
                    active && "bg-surface",
                  )}
                >
                  <span className="size-10 shrink-0 overflow-hidden rounded-md bg-secondary">
                    {image ? (
                      <img
                        src={image}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageOff
                        aria-hidden="true"
                        className="m-auto mt-3 size-4 text-subtle-foreground"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {element.name}
                    </span>
                    <span
                      className={cn(
                        "block text-xs",
                        count ? "text-muted-foreground" : "text-warning",
                      )}
                    >
                      @{element.handle} ·{" "}
                      {count
                        ? `${count} approved ${count === 1 ? "reference" : "references"}`
                        : "No approved references"}
                    </span>
                  </span>
                  {active && (
                    <Check
                      aria-hidden="true"
                      className="mr-1 size-4 text-tungsten"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selected && selected.states.length > 0 && (
        <div className="revision-reveal mt-3">
          <p className="text-xs text-muted-foreground" id="state-choice">
            {kind === "background" ? "Conditions" : "State"}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="state-choice"
            className="mt-1.5 flex flex-wrap gap-1.5"
          >
            {[null, ...selected.states].map((state) => (
              <button
                key={state?.id ?? "default"}
                type="button"
                role="radio"
                aria-checked={(state?.id ?? null) === stateId}
                onClick={() => onChoose(selected.id, state?.id ?? null)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-tungsten/70 aria-checked:text-foreground"
              >
                {state && cover(selected, state) && (
                  <img
                    src={cover(selected, state)!}
                    alt=""
                    className="-ml-1.5 size-5 rounded-full object-cover"
                  />
                )}
                {state?.name ?? "As established"}
              </button>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  );
}
