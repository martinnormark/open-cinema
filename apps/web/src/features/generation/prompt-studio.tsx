import { useState, type ReactNode } from "react";
import {
  WORKFLOW_DESCRIPTORS,
  type GenerationRequest,
  type WorkflowCommandInput,
} from "@open-cinema/contracts";
import { estimateGeneration } from "@open-cinema/comfy/estimates";
import { Shuffle, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
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
export function PromptStudio({ introduction }: { introduction: ReactNode }) {
  const { snapshot, connection } = useGeneration();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState<WorkflowCommandInput | null>(null);
  const mentions = useMentions(prompt);
  const request = studioRequest(prompt, mentions);
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={!!uncertain}
            onClick={() => {
              const alternatives = prompts.filter((p) => p !== prompt);
              setPrompt(
                alternatives[Math.floor(Math.random() * alternatives.length)]!,
              );
            }}
          >
            <Shuffle aria-hidden="true" /> Surprise me
          </Button>
          <Button
            type="submit"
            disabled={
              !snapshot || busy || (!uncertain && prompt.trim().length < 3)
            }
          >
            {busy ? "Sending…" : uncertain ? "Retry request" : "Generate image"}
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
        <p
          id="generation-estimate"
          className="tabular mt-3 text-xs leading-5 text-muted-foreground"
        >
          {WORKFLOW_DESCRIPTORS[request.workflowKind].label} · FLUX 3 · 1K
          square
          {request.workflowKind === "image.flux-reference" &&
            ` · ${request.inputs.references.length} ${request.inputs.references.length === 1 ? "reference" : "references"} from your Elements`}
          {shouldShowEstimate(preferences, "image") &&
            estimate.credits &&
            ` · about ${formatCost(estimate.credits, preferences.unit)}, ${Math.round(estimate.seconds.min)}–${Math.round(estimate.seconds.max)} s`}
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

/** Mentions with approved references condition Flux; otherwise a plain image. */
function studioRequest(
  prompt: string,
  mentions: ReturnType<typeof useMentions>,
): GenerationRequest {
  const payload = mentionPayload(mentions);
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
