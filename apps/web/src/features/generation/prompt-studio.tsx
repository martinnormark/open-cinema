import { useState, type ReactNode } from "react";
import {
  CAMERA_MOVES,
  WORKFLOW_DESCRIPTORS,
  type CameraMove,
  type GenerationRequest,
  type WorkflowCommandInput,
} from "@open-cinema/contracts";
import { estimateGeneration } from "@open-cinema/comfy/estimates";
import { Shuffle, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { beginLocalSession } from "@/server/functions";
import { submitWorkflow } from "@/server/generation";
import {
  MentionSummary,
  MentionTextarea,
  mentionPayload,
  useMentions,
} from "@/features/elements/mentions";
import { reloadElements } from "@/features/elements/store";
import {
  formatCost,
  shouldShowEstimate,
  useCostPreferences,
} from "@/features/settings/preferences";
import { acceptSnapshot, reconnectGeneration, useGeneration } from "./store";
import { JobList } from "./job-list";

const prompts = [
  "A red fox standing in fresh snow at sunrise, golden side light, pine forest in the distance, quiet wildlife photograph.",
  "A tiny bookshop in Copenhagen on a rainy evening, warm windows, a bicycle by the door, reflections on cobblestones, cinematic street photography.",
  "A glass greenhouse on the surface of the moon, lush orange trees inside, Earth rising over the horizon, wide science-fiction film still.",
  "A handmade cobalt-blue ceramic teapot on a linen tablecloth, one sliced pear beside it, soft window light, editorial still life.",
  "An abandoned coastal observatory at blue hour, tall grass moving in the sea breeze, a single amber light in the dome, atmospheric film still.",
];
type Medium = "image" | "video";

export function PromptStudio({ introduction }: { introduction: ReactNode }) {
  const { snapshot, connection } = useGeneration();
  const [prompt, setPrompt] = useState("");
  const [medium, setMedium] = useState<Medium>("image");
  const [camera, setCamera] = useState<CameraMove | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState<WorkflowCommandInput | null>(null);
  const mentions = useMentions(prompt);
  const request = studioRequest(prompt, mentions, medium, camera);
  const preferences = useCostPreferences();
  const estimate = estimateGeneration(request);
  async function start() {
    setBusy(true);
    setError("");
    try {
      await beginLocalSession();
      reconnectGeneration();
      await reloadElements();
    } catch {
      setError(
        "Local testing is not configured. Set up the local session variables in apps/web/.dev.vars.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    if (busy) return;
    const command: WorkflowCommandInput = uncertain ?? {
      idempotencyKey: crypto.randomUUID(),
      request,
    };
    setBusy(true);
    setError("");
    // Keep the same key until a definite response arrives, even if the request disconnects.
    setUncertain(command);
    try {
      const result = await submitWorkflow({ data: command });
      setUncertain(null);
      if (result.ok) acceptSnapshot(result.snapshot);
      else setError(result.error);
    } catch {
      setError(
        "The response was interrupted. Retry this request to check whether it was accepted; it will use the same request key.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="mx-auto max-w-5xl px-6 pt-10 pb-32 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      {introduction}
      <form
        className="mt-8"
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <label
          htmlFor="generation-prompt"
          className="mb-2 block text-sm font-medium"
        >
          Your prompt
        </label>
        <MentionTextarea
          id="generation-prompt"
          value={prompt}
          onValueChange={setPrompt}
          disabled={!!uncertain}
          maxLength={2000}
          minLength={3}
          required
          rows={5}
          placeholder="A place, a subject, a moment. Type @ to bring in your Elements."
          aria-describedby="generation-estimate"
        />
        <MentionSummary mentions={mentions} className="mt-3" />
        {medium === "video" && (
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
            <Button
              type="button"
              variant="ghost"
              disabled={!!uncertain}
              onClick={() => {
                const alternatives = prompts.filter((p) => p !== prompt);
                setPrompt(
                  alternatives[
                    Math.floor(Math.random() * alternatives.length)
                  ]!,
                );
              }}
            >
              <Shuffle aria-hidden="true" /> Surprise me
            </Button>
          </div>
          <Button
            type="submit"
            disabled={
              !snapshot || busy || (!uncertain && prompt.trim().length < 3)
            }
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
        </div>
        <p
          id="generation-estimate"
          className="tabular mt-3 text-xs leading-5 text-muted-foreground"
        >
          {WORKFLOW_DESCRIPTORS[request.workflowKind].label} ·{" "}
          {request.workflowKind === "video.ltx"
            ? request.inputs.camera
              ? `LTX-2 with the ${CAMERA_MOVES[request.inputs.camera].label.toLowerCase()} camera LoRA · ${request.inputs.durationSeconds} s · 720p with sound · on Comfy Cloud`
              : `LTX 2.5 Fast · ${request.inputs.durationSeconds} s · 720p with sound`
            : "FLUX 3 · 1K square"}
          {request.workflowKind === "image.flux-reference" &&
            ` · ${request.inputs.references.length} ${request.inputs.references.length === 1 ? "reference" : "references"} from your Elements`}
          {shouldShowEstimate(preferences, "image") &&
            estimate.credits &&
            ` · about ${formatCost(estimate.credits, preferences.unit)}, ${Math.round(estimate.seconds.min)}–${Math.round(estimate.seconds.max)} s`}
          {!estimate.credits &&
            request.workflowKind === "video.ltx" &&
            request.inputs.camera &&
            ` · GPU time, about ${Math.round(estimate.seconds.min / 60)}–${Math.round(estimate.seconds.max / 60)} min`}
        </p>
      </form>
      {(!snapshot || connection === "unavailable") && (
        <div className="mt-6 rounded-lg bg-muted p-4">
          <p className="text-sm leading-6">
            Start a local test session to generate images. Jobs stay with this
            browser session.
          </p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={busy}
            onClick={() => void start()}
          >
            Start local session
          </Button>
        </div>
      )}
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
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Your images and generation status will appear here.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Video is LTX 2.5 text-to-video: a short, 720p clip keeps the first take cheap.
 * Mentions with approved references condition Flux; otherwise a plain image.
 */
function studioRequest(
  prompt: string,
  mentions: ReturnType<typeof useMentions>,
  medium: Medium,
  camera: CameraMove | null,
): GenerationRequest {
  const payload = mentionPayload(mentions);
  if (medium === "video")
    return {
      workflowKind: "video.ltx",
      inputs: {
        prompt: prompt.trim(),
        // A camera move runs on a Cloud GPU billed by time; four seconds
        // show the move and keep the run short.
        durationSeconds: camera ? 4 : 6,
        ...(camera ? { camera } : {}),
        resolution: "1280x720",
        fps: 25,
        generateAudio: true,
        quality: "fast",
        mentions: payload.mentions.slice(0, 8),
      },
    };
  const base = {
    prompt: prompt.trim(),
    aspectRatio: "1:1" as const,
    resolution: "1k" as const,
    mentions: payload.mentions.slice(0, 8),
  };
  return payload.references.length
    ? {
        workflowKind: "image.flux-reference",
        inputs: { ...base, references: payload.references.slice(0, 10) },
      }
    : { workflowKind: "image.flux", inputs: base };
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
