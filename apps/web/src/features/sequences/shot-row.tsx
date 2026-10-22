import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clapperboard,
  Film,
  ImageIcon,
  Link2,
  MoreHorizontal,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  approvedTake,
  assetRefKey,
  type Element,
  type GenerationRequest,
  type Job,
  type Project,
  type Revision,
  type Sequence,
  type Shot,
  type ShotCamera,
  type ShotDuration,
  type ShotFraming,
  type TakeRole,
  type UpdateShotInput,
} from "@open-cinema/contracts";
import { estimateGeneration } from "@open-cinema/comfy/estimates";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Thumbnail } from "@/features/library";
import { MentionTextarea } from "@/features/elements/mentions";
import { acceptSnapshot } from "@/features/generation/store";
import {
  formatCost,
  shouldShowEstimate,
  useCostPreferences,
} from "@/features/settings/preferences";
import { submitWorkflow } from "@/server/generation";
import {
  addMyTake,
  deleteMyShot,
  moveMyShot,
  setMyTakeStatus,
  updateMyShot,
} from "@/server/sequences";
import { Field } from "./fields";
import { captureLastFrame } from "./last-frame";
import {
  cameraLabels,
  DURATIONS,
  EMPTY_FRAME_HINT,
  MIN_MOTION_SECONDS,
  framingLabels,
  keyframeRequest,
  motionRequest,
  prefersReferenceMotion,
  referenceMotionRequest,
  shotWarnings,
  takeUrl,
  takeView,
  type TakeView,
} from "./model";
import { posterFor } from "./picture";

type Apply = (work: Promise<Sequence>) => Promise<void>;

export function ShotRow({
  shot,
  index,
  count,
  previous,
  project,
  elements,
  jobs,
  revisions,
  live,
  apply,
}: {
  shot: Shot;
  index: number;
  count: number;
  previous: Shot | null;
  project: Project | null;
  elements: readonly Element[];
  jobs: readonly Job[];
  revisions: readonly Revision[];
  live: boolean;
  apply: Apply;
}) {
  const [draft, setDraft] = useState({
    title: shot.title,
    beat: shot.beat,
    prompt: shot.prompt,
    staging: shot.staging,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const preferences = useCostPreferences();
  const keyframe = approvedTake(shot, "keyframe");
  const motion = approvedTake(shot, "motion");
  // Generate from what is on screen, even before the field saves on blur.
  const current: Shot = { ...shot, ...draft };
  const warnings = shotWarnings(current, elements);
  const views = shot.takes
    .filter((t) => t.status !== "rejected")
    .map((t) => takeView(t, jobs));
  const working = views.some((v) => v.phase === "working");
  const previousMotion = previous ? approvedTake(previous, "motion") : null;
  const continuing = shot.continuity === "continue" && !!previous;
  const motionKey = motion?.asset ? assetRefKey(motion.asset) : null;
  const taken = new Set(
    shot.takes.flatMap((t) => (t.asset ? [assetRefKey(t.asset)] : [])),
  );
  const offered = revisions.filter(
    (r) =>
      motionKey &&
      assetRefKey(r.source) === motionKey &&
      r.result &&
      (r.status === "proposed" || r.status === "kept") &&
      !taken.has(assetRefKey(r.result)),
  );

  function save(changes: Omit<UpdateShotInput, "id">) {
    return apply(updateMyShot({ data: { id: shot.id, ...changes } })).catch(
      () => {},
    );
  }

  async function run(label: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "That did not work. Try again.",
      );
    } finally {
      setBusy(null);
    }
  }

  const pending = useRef<{ key: string; body: string } | null>(null);

  async function generate(role: TakeRole, request: GenerationRequest) {
    // An interrupted request keeps its key, so trying the same take again
    // finds the job it may already have started instead of running it twice.
    const body = JSON.stringify([request, project?.id]);
    const key =
      pending.current?.body === body
        ? pending.current.key
        : crypto.randomUUID();
    pending.current = { key, body };
    const result = await submitWorkflow({
      data: {
        idempotencyKey: key,
        request,
        ...(project ? { projectId: project.id } : {}),
      },
    });
    pending.current = null;
    if (!result.ok) throw new Error(result.error);
    acceptSnapshot(result.snapshot);
    if (!result.jobId) throw new Error("The job was accepted without an id.");
    await apply(
      addMyTake({
        data: {
          shotId: shot.id,
          role,
          origin: "generated",
          jobId: result.jobId,
          prompt: request.inputs.prompt ?? "",
        },
      }),
    );
  }

  const keyframeJob = keyframeRequest(current, elements);
  const motionJob = keyframe?.asset
    ? motionRequest(current, keyframe.asset, elements)
    : null;
  const referenceJob = continuing
    ? null
    : referenceMotionRequest(current, elements);
  // A Location's moving reference makes references the way in; a
  // continuation keeps its keyframe so the cut has no jump.
  const referencesFirst =
    !!referenceJob && !motion && prefersReferenceMotion(current, elements);

  return (
    <article
      id={`shot-${shot.id}`}
      aria-labelledby={`shot-${shot.id}-title`}
      className="scroll-mt-20 rounded-xl border border-border bg-surface/40 p-4 md:p-5"
    >
      <div className="grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="min-w-0">
          <Picture
            shot={shot}
            views={views}
            referencesFirst={referencesFirst}
          />
          <Takes
            views={views}
            busy={!!busy}
            onDecide={(view, status) =>
              run("decide", () =>
                apply(
                  setMyTakeStatus({
                    data: {
                      id: view.take.id,
                      status,
                      ...(view.asset && !view.take.asset
                        ? { asset: view.asset }
                        : {}),
                    },
                  }),
                ),
              )
            }
          />
          {offered.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Revisions of this take
              </p>
              <ul className="mt-2 space-y-2">
                {offered.map((revision) => (
                  <li key={revision.id} className="flex items-center gap-3">
                    <Thumbnail
                      src={posterFor({
                        asset: revision.result!,
                        kind: "video",
                      })}
                      kind="video"
                      className="aspect-video w-20 shrink-0 rounded"
                    />
                    <span className="min-w-0 flex-1 text-xs leading-5">
                      <span className="line-clamp-2">{revision.intent}</span>
                      {revision.status === "kept" && (
                        <span className="text-success">Kept</span>
                      )}
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={!!busy}
                      onClick={() =>
                        run("revision", () =>
                          apply(
                            addMyTake({
                              data: {
                                shotId: shot.id,
                                role: "motion",
                                origin: "revision",
                                asset: revision.result!,
                                prompt: revision.intent,
                                approve: true,
                              },
                            }),
                          ),
                        )
                      }
                    >
                      Use in shot
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="tabular mt-1.5 text-sm font-medium text-muted-foreground"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor={`shot-${shot.id}-title`} className="sr-only">
                Shot {index + 1} title
              </label>
              <input
                id={`shot-${shot.id}-title`}
                value={draft.title}
                maxLength={120}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, title: e.target.value }))
                }
                onBlur={() => {
                  const title = draft.title.trim();
                  if (!title) setDraft((d) => ({ ...d, title: shot.title }));
                  else if (title !== shot.title) void save({ title });
                }}
                className="-mx-1.5 w-full rounded-md bg-transparent px-1.5 py-0.5 text-base font-medium outline-none hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
            <ShotMenu
              shot={shot}
              index={index}
              count={count}
              project={project}
              motion={motionKey}
              busy={!!busy}
              onMove={(direction) =>
                run("move", () =>
                  apply(moveMyShot({ data: { id: shot.id, direction } })),
                )
              }
              onDelete={() =>
                run("delete", () =>
                  apply(deleteMyShot({ data: { id: shot.id } })),
                )
              }
            />
          </div>

          <Field label="Beat" htmlFor={`shot-${shot.id}-beat`} className="mt-3">
            <Textarea
              id={`shot-${shot.id}-beat`}
              value={draft.beat}
              rows={2}
              maxLength={2000}
              placeholder="What this moment does for the story."
              onChange={(e) =>
                setDraft((d) => ({ ...d, beat: e.target.value }))
              }
              onBlur={() => {
                if (draft.beat !== shot.beat) void save({ beat: draft.beat });
              }}
              className="min-h-0 resize-none"
            />
          </Field>
          <Field
            label="What the frame shows"
            htmlFor={`shot-${shot.id}-prompt`}
            className="mt-3"
          >
            <MentionTextarea
              id={`shot-${shot.id}-prompt`}
              value={draft.prompt}
              onValueChange={(prompt) => setDraft((d) => ({ ...d, prompt }))}
              onBlur={() => {
                if (draft.prompt !== shot.prompt)
                  void save({ prompt: draft.prompt });
              }}
              rows={3}
              maxLength={2000}
              placeholder="Who is in it, where, doing what, in what light. Type @ for your Elements."
            />
          </Field>
          <Field
            label="Staging"
            htmlFor={`shot-${shot.id}-staging`}
            className="mt-3"
          >
            <Textarea
              id={`shot-${shot.id}-staging`}
              value={draft.staging}
              rows={2}
              maxLength={2000}
              placeholder="Where everyone stands, which side the camera is on, where the light comes from. Mara by the window on the left, Theo at the door; we look past Theo toward her; low sun from behind her."
              onChange={(e) =>
                setDraft((d) => ({ ...d, staging: e.target.value }))
              }
              onBlur={() => {
                if (draft.staging !== shot.staging)
                  void save({ staging: draft.staging });
              }}
              className="min-h-0 resize-none"
            />
          </Field>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <Choice
              id={`shot-${shot.id}-framing`}
              label="Framing"
              value={shot.framing}
              options={framingLabels}
              onChange={(framing) =>
                void save({ framing: framing as ShotFraming })
              }
            />
            <Choice
              id={`shot-${shot.id}-camera`}
              label="Camera"
              value={shot.camera}
              options={cameraLabels}
              onChange={(camera) => void save({ camera: camera as ShotCamera })}
            />
            <Choice
              id={`shot-${shot.id}-duration`}
              label="Length"
              value={String(shot.durationSeconds)}
              options={Object.fromEntries(
                DURATIONS.map((d) => [
                  String(d),
                  d < MIN_MOTION_SECONDS
                    ? `${d} s (motion runs ${MIN_MOTION_SECONDS} s)`
                    : `${d} s`,
                ]),
              )}
              onChange={(seconds) =>
                void save({ durationSeconds: Number(seconds) as ShotDuration })
              }
            />
          </div>
          {previous && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shot.continuity === "continue"}
                onChange={(e) =>
                  void save({
                    continuity: e.target.checked ? "continue" : "fresh",
                  })
                }
                className="size-4 accent-[var(--tungsten)]"
              />
              Pick up where shot {index} ends
            </label>
          )}

          {warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs leading-5">
              {warnings.map((w) => (
                <li
                  key={w}
                  className={
                    w === EMPTY_FRAME_HINT
                      ? "text-muted-foreground"
                      : "text-warning"
                  }
                >
                  {w}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {continuing ? (
              <Button
                variant={keyframe ? "outline" : "default"}
                size="sm"
                disabled={!!busy || !previousMotion?.asset}
                title={
                  previousMotion?.asset
                    ? undefined
                    : `Approve motion for shot ${index} first.`
                }
                onClick={() =>
                  run("continue", async () => {
                    const asset = await captureLastFrame(
                      takeUrl(previousMotion!.asset!),
                      `${shot.title} · continues shot ${index}.png`,
                    );
                    await apply(
                      addMyTake({
                        data: {
                          shotId: shot.id,
                          role: "keyframe",
                          origin: "continued",
                          asset,
                          prompt: `Last frame of shot ${index}`,
                          approve: true,
                        },
                      }),
                    );
                  })
                }
              >
                <Link2 aria-hidden="true" />
                {busy === "continue"
                  ? "Taking the last frame…"
                  : `Start from shot ${index}’s last frame`}
              </Button>
            ) : (
              <Button
                variant={keyframe || referencesFirst ? "outline" : "default"}
                size="sm"
                disabled={
                  !!busy ||
                  !live ||
                  current.prompt.trim().length + current.beat.trim().length < 3
                }
                onClick={() =>
                  run("keyframe", () => generate("keyframe", keyframeJob))
                }
              >
                <ImageIcon aria-hidden="true" />
                {busy === "keyframe"
                  ? "Sending…"
                  : keyframe
                    ? "New keyframe"
                    : "Make keyframe"}
              </Button>
            )}
            {referenceJob && (
              <Button
                variant={referencesFirst ? "default" : "outline"}
                size="sm"
                disabled={!!busy || !live}
                title="Text to video: the references show the faces and the place, the shot's words say the rest."
                onClick={() =>
                  run("references", () => generate("motion", referenceJob))
                }
              >
                <Clapperboard aria-hidden="true" />
                {busy === "references" ? "Sending…" : "Shoot from references"}
              </Button>
            )}
            <Button
              variant={
                keyframe && !motion && !referencesFirst ? "default" : "outline"
              }
              size="sm"
              disabled={!!busy || !live || !motionJob}
              title={motionJob ? undefined : "Approve a keyframe first."}
              onClick={() =>
                motionJob && run("motion", () => generate("motion", motionJob))
              }
            >
              <Film aria-hidden="true" />
              {busy === "motion"
                ? "Sending…"
                : motion
                  ? "New motion take"
                  : "Animate"}
            </Button>
            <Estimate
              request={
                (referencesFirst ? referenceJob : motionJob) ?? keyframeJob
              }
              show={shouldShowEstimate(
                preferences,
                referencesFirst || motionJob ? "video" : "image",
              )}
              unit={preferences.unit}
            />
          </div>
          {working && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              A take is in progress. It keeps going if you leave this page.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function Estimate({
  request,
  show,
  unit,
}: {
  request: GenerationRequest;
  show: boolean;
  unit: ReturnType<typeof useCostPreferences>["unit"];
}) {
  const estimate = estimateGeneration(request);
  if (!show || !estimate.credits) return null;
  return (
    <span className="tabular text-xs text-muted-foreground">
      about {formatCost(estimate.credits, unit)},{" "}
      {Math.round(estimate.seconds.min)}–{Math.round(estimate.seconds.max)} s
    </span>
  );
}

function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([key, text]) => (
            <SelectItem key={key} value={key}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** The shot as it stands: approved motion plays, else the approved keyframe. */
function Picture({
  shot,
  views,
  referencesFirst,
}: {
  shot: Shot;
  views: TakeView[];
  referencesFirst: boolean;
}) {
  const motion = approvedTake(shot, "motion");
  const keyframe = approvedTake(shot, "keyframe");
  const pending = views.find((v) => v.phase === "working");
  if (motion?.asset)
    return (
      <video
        key={assetRefKey(motion.asset)}
        src={takeUrl(motion.asset)}
        poster={posterFor({ asset: motion.asset, kind: "video" })}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded-lg bg-letterbox object-contain"
      />
    );
  if (keyframe?.asset)
    return (
      <img
        src={takeUrl(keyframe.asset)}
        alt={`Approved keyframe for ${shot.title}`}
        className="aspect-video w-full rounded-lg bg-letterbox object-cover"
      />
    );
  return (
    <div className="relative flex aspect-video w-full flex-col items-center justify-center rounded-lg bg-surface text-center">
      <Clapperboard
        aria-hidden="true"
        strokeWidth={1.5}
        className="size-6 text-subtle-foreground"
      />
      <p className="mt-3 max-w-60 text-xs leading-5 text-muted-foreground">
        {pending
          ? (pending.stage ?? "Making the first take…")
          : referencesFirst
            ? "Shoot it from the references, or make a keyframe to fix the frame first."
            : "Make a keyframe to set the frame, then animate it."}
      </p>
    </div>
  );
}

/** Every take this shot has had, newest first; approving one sets the shot. */
function Takes({
  views,
  busy,
  onDecide,
}: {
  views: TakeView[];
  busy: boolean;
  onDecide: (view: TakeView, status: "approved" | "rejected") => void;
}) {
  if (!views.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Takes">
      {views.map((view) => {
        const { take } = view;
        const approved = take.status === "approved";
        const role = take.role === "motion" ? "Motion" : "Keyframe";
        return (
          <li
            key={take.id}
            className={cn(
              "group relative w-28 overflow-hidden rounded-md ring-1",
              approved ? "ring-2 ring-tungsten" : "ring-border",
            )}
          >
            <Thumbnail
              src={
                view.asset
                  ? posterFor({
                      asset: view.asset,
                      kind: take.role === "motion" ? "video" : "image",
                    })
                  : null
              }
              kind={take.role === "motion" ? "video" : "image"}
              className="aspect-video"
            />
            <span className="block truncate bg-surface px-1.5 py-1 text-caption text-muted-foreground">
              {role}
              {take.origin === "continued"
                ? " · continued"
                : take.origin === "revision"
                  ? " · revision"
                  : take.origin === "performance"
                    ? " · performance"
                    : ""}
              {approved && <span className="text-tungsten"> · approved</span>}
            </span>
            {view.phase === "working" && (
              <span className="absolute inset-x-0 top-0 flex aspect-video items-center justify-center bg-surface text-caption text-tungsten">
                <span className="tabular">
                  {view.progress !== null
                    ? `${Math.round(view.progress * 100)}%`
                    : "Working…"}
                </span>
              </span>
            )}
            {view.phase === "failed" && (
              <span
                className="absolute inset-x-0 top-0 flex aspect-video items-center justify-center bg-scrim/85 px-2 text-center text-caption leading-4 text-destructive"
                title={view.error ?? undefined}
              >
                Did not finish
              </span>
            )}
            {view.phase === "ready" && !approved && (
              <span className="absolute inset-x-0 top-0 flex aspect-video items-end justify-end gap-1 p-1 opacity-0 transition-opacity duration-(--duration-quick) group-focus-within:opacity-100 group-hover:opacity-100">
                <Button
                  size="icon-xs"
                  variant="secondary"
                  disabled={busy}
                  aria-label={`Reject this ${role.toLowerCase()} take`}
                  onClick={() => onDecide(view, "rejected")}
                >
                  <X aria-hidden="true" />
                </Button>
                <Button
                  size="icon-xs"
                  disabled={busy}
                  aria-label={`Approve this ${role.toLowerCase()} take`}
                  onClick={() => onDecide(view, "approved")}
                >
                  <Check aria-hidden="true" />
                </Button>
              </span>
            )}
            {view.phase === "failed" && (
              <button
                type="button"
                className="sr-only focus:not-sr-only"
                onClick={() => onDecide(view, "rejected")}
              >
                Dismiss
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ShotMenu({
  shot,
  index,
  count,
  project,
  motion,
  busy,
  onMove,
  onDelete,
}: {
  shot: Shot;
  index: number;
  count: number;
  project: Project | null;
  motion: string | null;
  busy: boolean;
  onMove: (direction: "earlier" | "later") => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={`More for shot ${index + 1}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {motion && (
          <>
            <DropdownMenuItem asChild>
              <Link
                to="/revisions/new"
                search={{
                  source: motion,
                  ...(project ? { project: project.id } : {}),
                }}
              >
                <Wand2 aria-hidden="true" /> Revise this take
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          disabled={index === 0}
          onSelect={() => onMove("earlier")}
        >
          <ArrowUp aria-hidden="true" /> Move earlier
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index === count - 1}
          onSelect={() => onMove("later")}
        >
          <ArrowDown aria-hidden="true" /> Move later
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 aria-hidden="true" /> Delete shot
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
