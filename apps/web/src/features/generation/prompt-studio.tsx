import { useRef, useState, type ReactNode } from "react";
import {
  CAMERA_MOVES,
  WORKFLOW_DESCRIPTORS,
  type DirectionSnapshot,
  type CameraMove,
  type GenerationRequest,
  type ImageAspectRatio,
  type Look,
  type Project,
  type ShotDirection,
  type WorkflowCommandInput,
} from "@open-cinema/contracts";
import { estimateGeneration } from "@open-cinema/comfy/estimates";
import {
  Shuffle,
  ArrowUp,
  ArrowRight,
  ChevronDown,
  CircleHelp,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { beginLocalSession } from "@/server/functions";
import { submitWorkflow } from "@/server/generation";
import {
  MentionSummary,
  MentionTextarea,
  blockingMentionProblem,
  mentionPayload,
  useMentions,
} from "@/features/elements/mentions";
import { reloadElements } from "@/features/elements/store";
import {
  formatCost,
  shouldShowEstimate,
  useCostPreferences,
} from "@/features/settings/preferences";
import { StudioDirection } from "@/features/direction/studio-direction";
import {
  reloadProjects,
  setCurrentProject,
  useProjects,
} from "@/features/direction/projects";
import { acceptSnapshot, reconnectGeneration, useGeneration } from "./store";
import { takeStudioDraft, type StudioDraft } from "./draft";
import {
  canUseReferences,
  prefersReferences,
  studioDirection,
  studioRequest,
  type Medium,
} from "./request";
import { JobList, rememberJobFrames } from "./job-list";

const prompts = [
  "A red fox standing in fresh snow at sunrise, golden side light, pine forest in the distance, quiet wildlife photograph.",
  "A tiny bookshop in Copenhagen on a rainy evening, warm windows, a bicycle by the door, reflections on cobblestones, cinematic street photography.",
  "A glass greenhouse on the surface of the moon, lush orange trees inside, Earth rising over the horizon, wide science-fiction film still.",
  "A handmade cobalt-blue ceramic teapot on a linen tablecloth, one sliced pear beside it, soft window light, editorial still life.",
  "An abandoned coastal observatory at blue hour, tall grass moving in the sea breeze, a single amber light in the dome, atmospheric film still.",
];
const ASPECTS = [
  { value: "1:1", label: "Square" },
  { value: "16:9", label: "16:9" },
  { value: "21:9", label: "Scope" },
  { value: "9:16", label: "Vertical" },
] as const satisfies readonly { value: ImageAspectRatio; label: string }[];

export function PromptStudio({
  introduction,
  projectId,
}: {
  introduction: ReactNode;
  /** A project chosen by link, e.g. "Make a shot" on a project page. */
  projectId?: string;
}) {
  const { snapshot, connection } = useGeneration();
  const form = useRef<HTMLFormElement>(null);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [draft] = useState<StudioDraft | null>(takeStudioDraft);
  const [prompt, setPrompt] = useState(draft?.prompt ?? "");
  const [medium, setMedium] = useState<Medium>(draft?.medium ?? "image");
  const [aspect, setAspect] = useState<ImageAspectRatio>(
    draft?.aspectRatio ?? "1:1",
  );
  const [overrides, setOverrides] = useState<Look>(draft?.overrides ?? {});
  const [shot, setShot] = useState<ShotDirection>(draft?.shot ?? {});
  const [recipe, setRecipe] = useState(draft?.recipe ?? null);
  const projects = useProjects();
  // A linked project wins until the creator picks another.
  const [chosen, setChosen] = useState<string | null | undefined>(projectId);
  const selectedId = chosen !== undefined ? chosen : projects.currentId;
  const project = projects.projects.find((p) => p.id === selectedId) ?? null;
  function chooseProject(id: string | null) {
    setChosen(id);
    setCurrentProject(id);
  }
  const [camera, setCamera] = useState<CameraMove | null>(
    draft?.camera ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState<WorkflowCommandInput | null>(null);
  const mentions = useMentions(prompt);
  // Null follows the mentions: references once a Location brings a move.
  const [source, setSource] = useState<"words" | "references" | null>(null);
  const referencesOffered = medium === "video" && canUseReferences(mentions);
  const fromReferences =
    referencesOffered &&
    (source ?? (prefersReferences(mentions) ? "references" : "words")) ===
      "references";
  const direction = studioDirection(project, overrides, shot, recipe);
  const request = studioRequest(
    prompt,
    mentions,
    medium,
    aspect,
    direction,
    fromReferences ? null : camera,
    draft?.durationSeconds as 4 | 5 | 6 | 8 | 10 | undefined,
    fromReferences,
  );
  const preferences = useCostPreferences();
  const estimate = estimateGeneration(request);
  async function start() {
    setBusy(true);
    setError("");
    try {
      await beginLocalSession();
      reconnectGeneration();
      await reloadElements();
      await reloadProjects();
    } catch {
      setError(
        "Local sessions are unavailable. Check AUTH_MODE and LOCAL_MVP_ENABLED in your .env file.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (
      busy ||
      !snapshot ||
      (!uncertain &&
        (prompt.trim().length < 3 || blockingMentionProblem(mentions)))
    )
      return;
    const command: WorkflowCommandInput = uncertain ?? {
      idempotencyKey: crypto.randomUUID(),
      request,
      ...(project ? { projectId: project.id } : {}),
    };
    setBusy(true);
    setError("");
    // Keep the same key until a definite response arrives, even if the request disconnects.
    setUncertain(command);
    try {
      const known = new Set(snapshot?.jobs.map((job) => job.id));
      const result = await submitWorkflow({ data: command });
      setUncertain(null);
      if (result.ok) {
        rememberJobFrames(
          result.snapshot.jobs
            .filter((job) => !known.has(job.id))
            .map((job) => job.id),
          command.request.workflowKind.startsWith("video.") ? "16:9" : aspect,
        );
        acceptSnapshot(result.snapshot);
      } else setError(result.error);
    } catch {
      setError(
        "The response was interrupted. Retry this request to check whether it was accepted; it will use the same request key.",
      );
    } finally {
      setBusy(false);
    }
  }
  function choosePrompt(value: string) {
    setPrompt(value);
    form.current
      ?.querySelector<HTMLTextAreaElement>("#generation-prompt")
      ?.focus();
  }
  const canGenerate =
    !!snapshot &&
    !busy &&
    (!!uncertain ||
      (prompt.trim().length >= 3 && !blockingMentionProblem(mentions)));
  return (
    <section
      className="mx-auto w-full max-w-6xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <div className="max-w-4xl">
        {introduction}
        <form
          ref={form}
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
          <div className="studio-composer">
            <label
              htmlFor="generation-prompt"
              className="mb-2 flex items-center gap-2 text-sm font-medium"
            >
              <ImageIcon aria-hidden="true" className="size-4" /> Your prompt
            </label>
            <MentionTextarea
              id="generation-prompt"
              value={prompt}
              onValueChange={setPrompt}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  if (canGenerate) event.currentTarget.form?.requestSubmit();
                }
              }}
              // Opened from an Element or a recipe: keep writing after it.
              focusAtEnd={!!draft}
              disabled={!!uncertain}
              maxLength={2000}
              minLength={3}
              required
              rows={5}
              placeholder="A place, a subject, a moment. Type @ to bring in your Elements."
              aria-describedby="generation-estimate prompt-hint"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                disabled={!!uncertain}
                onClick={() => {
                  const alternatives = prompts.filter((p) => p !== prompt);
                  choosePrompt(
                    alternatives[
                      Math.floor(Math.random() * alternatives.length)
                    ]!,
                  );
                }}
              >
                <Shuffle aria-hidden="true" /> Surprise me
              </Button>
              <div className="flex items-center gap-2">
                <span className="tabular text-xs text-muted-foreground">
                  {prompt.length.toLocaleString()} / 2,000
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Clear prompt"
                  disabled={!prompt || !!uncertain}
                  onClick={() => choosePrompt("")}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
          <p
            id="prompt-hint"
            className="mt-3 text-xs leading-5 text-muted-foreground"
          >
            {uncertain
              ? "Your prompt is kept safe. Retry to check this request."
              : !snapshot
                ? "Start a local session below to generate. Your prompt stays here."
                : "Describe your scene, then generate. Ctrl / ⌘ + Enter to send."}
          </p>
          <div className="t-acc prompt-ideas" data-open={ideasOpen}>
            <button
              type="button"
              className="t-acc-head ideas-trigger"
              aria-expanded={ideasOpen}
              aria-controls="prompt-ideas"
              onClick={() => setIdeasOpen(!ideasOpen)}
            >
              <span className="flex items-center gap-2">
                <CircleHelp aria-hidden="true" className="size-4" /> Need a
                starting point?
              </span>
              <span
                className="t-icon-swap"
                data-state={ideasOpen ? "b" : "a"}
                aria-hidden="true"
              >
                <ChevronDown className="t-icon size-4" data-icon="a" />
                <X className="t-icon size-4" data-icon="b" />
              </span>
            </button>
            <div
              id="prompt-ideas"
              className="t-acc-panel"
              inert={!ideasOpen}
              aria-hidden={!ideasOpen}
            >
              <div className="t-acc-panel-inner">
                <div className="ideas-content">
                  <p className="mb-3 text-sm text-muted-foreground">
                    Choose a scene, then make it your own. This replaces your
                    prompt.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {prompts.map((idea, index) => (
                      <button
                        type="button"
                        key={idea}
                        className="prompt-choice"
                        disabled={!!uncertain}
                        onClick={() => choosePrompt(idea)}
                      >
                        {
                          [
                            "Wildlife at sunrise",
                            "Rainy Copenhagen",
                            "A lunar greenhouse",
                            "An editorial still life",
                            "A coastal observatory",
                          ][index]
                        }
                        <ArrowRight aria-hidden="true" className="size-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <MentionSummary mentions={mentions} className="mt-3" />
          <StudioDirection
            projects={projects.projects}
            project={project}
            onProject={chooseProject}
            overrides={overrides}
            onOverrides={setOverrides}
            shot={shot}
            onShot={setShot}
            medium={medium}
            recipe={recipe}
            onClearRecipe={() => setRecipe(null)}
            disabled={!!uncertain}
          />
          {referencesOffered && (
            <fieldset className="mt-4">
              <legend className="text-sm font-medium">Picture from</legend>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={fromReferences ? "references" : "words"}
                onValueChange={(value) =>
                  value && setSource(value as "words" | "references")
                }
                disabled={!!uncertain}
                aria-label="Picture from"
                className="mt-2"
              >
                <ToggleGroupItem value="references" className="px-3">
                  References
                </ToggleGroupItem>
                <ToggleGroupItem value="words" className="px-3">
                  Words only
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {fromReferences
                  ? "Your Elements' references show the faces and the place. Say the rest in the prompt: who stands where, which side the camera is on, what the light does."
                  : "LTX 2.5 reads only the words, so each mention is described in text."}
              </p>
            </fieldset>
          )}
          {medium === "video" && !fromReferences && (
            <CameraMoves
              value={camera}
              onChange={setCamera}
              disabled={!!uncertain}
            />
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={medium}
                onValueChange={(value) => value && setMedium(value as Medium)}
                disabled={!!uncertain}
                aria-label="Make"
              >
                <ToggleGroupItem value="image" className="px-3">
                  Image
                </ToggleGroupItem>
                <ToggleGroupItem value="video" className="px-3">
                  Video
                </ToggleGroupItem>
              </ToggleGroup>
              {medium === "image" && (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={aspect}
                  onValueChange={(value) =>
                    value && setAspect(value as ImageAspectRatio)
                  }
                  disabled={!!uncertain}
                  aria-label="Frame"
                >
                  {ASPECTS.map((a) => (
                    <ToggleGroupItem
                      key={a.value}
                      value={a.value}
                      className="px-2.5"
                    >
                      {a.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            </div>
            {!snapshot ? (
              <Button
                type="button"
                className="max-sm:w-full"
                disabled={busy}
                onClick={() => void start()}
              >
                {busy ? "Connecting…" : "Start local session"}
                <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="submit"
                className="max-sm:w-full"
                disabled={!canGenerate}
              >
                {busy
                  ? "Sending…"
                  : uncertain
                    ? "Retry request"
                    : medium === "video"
                      ? "Generate video"
                      : "Generate image"}
                <ArrowUp aria-hidden="true" />
              </Button>
            )}
          </div>
          <p
            id="generation-estimate"
            className="tabular mt-3 text-xs leading-5 text-muted-foreground"
          >
            {WORKFLOW_DESCRIPTORS[request.workflowKind].label} ·{" "}
            {request.workflowKind === "video.reference"
              ? `Kling 3.0 Omni · ${request.inputs.durationSeconds} s · 720p, no sound`
              : request.workflowKind === "video.ltx"
                ? request.inputs.camera
                  ? `LTX-2 with the ${CAMERA_MOVES[request.inputs.camera].label.toLowerCase()} camera LoRA · ${request.inputs.durationSeconds} s · 720p with sound · on Comfy Cloud`
                  : `LTX 2.5 Fast · ${request.inputs.durationSeconds} s · 720p with sound`
                : `FLUX 3 · 1K ${aspect === "1:1" ? "square" : aspect}`}
            {project && ` · filed under ${project.name}`}
            {request.workflowKind === "image.flux-reference" &&
              ` · ${request.inputs.references.length} ${request.inputs.references.length === 1 ? "reference" : "references"} from your Elements`}
            {shouldShowEstimate(preferences, medium) &&
              estimate.credits &&
              ` · about ${formatCost(estimate.credits, preferences.unit)}, ${Math.round(estimate.seconds.min)}–${Math.round(estimate.seconds.max)} s`}
            {shouldShowEstimate(preferences, medium) &&
              !estimate.credits &&
              request.workflowKind === "video.ltx" &&
              request.inputs.camera &&
              ` · GPU time, about ${Math.round(estimate.seconds.min / 60)}–${Math.round(estimate.seconds.max / 60)} min`}
          </p>
        </form>
        {error && (
          <p role="alert" className="mt-4 text-sm leading-6 text-destructive">
            {error}
          </p>
        )}
        {snapshot && connection !== "live" && (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            Reconnecting to live updates. Jobs continue in the background.
          </p>
        )}
        <div className="mt-12 border-t border-border pt-6">
          <h2 className="text-lg font-medium">Your generations</h2>
          {snapshot?.jobs.length ? (
            <JobList jobs={snapshot.jobs.slice(0, 10)} />
          ) : (
            <EmptyState
              icon={ImageIcon}
              title="Your first frame lands here"
              className="mt-5"
            >
              <p>
                Each generation shows its progress, then its picture. Everything
                you make is also kept in your Library.
              </p>
            </EmptyState>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Real camera control: each move is an LTX-2 camera LoRA, not prompt
 * wording. "Free" leaves the camera to the model and keeps LTX 2.5 on Router.
 */
function CameraMoves({
  value,
  onChange,
  disabled,
}: {
  value: CameraMove | null;
  onChange: (move: CameraMove | null) => void;
  disabled: boolean;
}) {
  const options: (CameraMove | null)[] = [
    null,
    ...(Object.keys(CAMERA_MOVES) as CameraMove[]),
  ];
  return (
    <fieldset className="mt-4" disabled={disabled}>
      <legend className="text-sm font-medium">Camera</legend>
      <div
        role="radiogroup"
        aria-label="Camera move"
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {options.map((move) => (
          <button
            key={move ?? "free"}
            type="button"
            role="radio"
            aria-checked={value === move}
            title={move ? CAMERA_MOVES[move].description : undefined}
            onClick={() => onChange(move)}
            className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-checked:border-tungsten/70 aria-checked:bg-surface aria-checked:text-foreground"
          >
            {move ? CAMERA_MOVES[move].label : "Free"}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {value
          ? `${CAMERA_MOVES[value].description} A camera-control LoRA makes the move, so describe the scene, not the camera.`
          : "The model chooses the camera. Pick a move to control it."}
      </p>
    </fieldset>
  );
}
