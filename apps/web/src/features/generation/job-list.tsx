import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ExternalLink } from "lucide-react";
import { isActiveJob, resultOutputs, type Job } from "@open-cinema/contracts";
import { cancelGeneration, reconcileGeneration } from "@/server/functions";
import { Button } from "@/components/ui/button";
import { repairVideoPoster } from "@/features/library";
import { acceptSnapshot } from "./store";
const labels: Record<Job["state"], string> = {
  queued: "Queued",
  submitting: "Submitting",
  running: "Generating",
  persisting: "Saving",
  cancelling: "Cancelling",
  succeeded: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_attention: "Needs attention",
};
type Tone = "live" | "ready" | "failed" | "attention" | "quiet";
function tone(state: Job["state"]): Tone {
  if (isActiveJob(state)) return "live";
  if (state === "succeeded") return "ready";
  if (state === "failed") return "failed";
  if (state === "needs_attention") return "attention";
  return "quiet";
}

/**
 * The frame a job was asked for, so its placeholder holds the result's shape
 * and the picture lands without the list jumping. Kept for this tab only;
 * after a reload, images fall back to 16:9 until they arrive.
 */
const frames = new Map<string, string>();
export function rememberJobFrames(
  jobIds: readonly string[],
  aspectRatio: string,
) {
  for (const id of jobIds) frames.set(id, aspectRatio.replace(":", " / "));
}
function frameOf(job: Job) {
  return frames.get(job.id) ?? "16 / 9";
}

export function JobList({ jobs }: { jobs: readonly Job[] }) {
  return (
    <div className="divide-y divide-border">
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} />
      ))}
    </div>
  );
}
function JobRow({ job }: { job: Job }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dismissNote = useId();
  async function action(kind: "cancel" | "reconcile") {
    setPending(true);
    setError("");
    try {
      const result = await (
        kind === "cancel" ? cancelGeneration : reconcileGeneration
      )({ data: { jobId: job.id } });
      if (result.ok) acceptSnapshot(result.snapshot);
      else setError(result.error);
    } catch {
      setError("Could not reach your job. Try again.");
    } finally {
      setPending(false);
    }
  }
  const live = isActiveJob(job.state);
  const results = resultOutputs(job.outputs).filter((output) => output.r2Key);
  return (
    <article className="job-row py-6">
      <div className="flex items-start justify-between gap-4">
        <JobPrompt prompt={job.prompt} />
        <span
          className="job-status tabular inline-flex shrink-0 items-center gap-2 text-xs font-medium"
          data-tone={tone(job.state)}
          role="status"
        >
          <span className="job-status-dot" aria-hidden="true" />
          {labels[job.state]}
          {job.progress !== null && live
            ? ` · ${Math.round(job.progress * 100)}%`
            : ""}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {job.model}
        {job.seed !== null ? ` · Seed ${job.seed}` : ""}
      </p>
      {live && !results.length && (
        <div
          className="job-frame mt-4 max-w-xl"
          style={{
            aspectRatio: job.workflowKind.startsWith("video.")
              ? "16 / 9"
              : frameOf(job),
          }}
          aria-hidden="true"
        >
          <div className="generating-sweep" />
          <span className="absolute bottom-3 left-3.5 text-xs text-muted-foreground">
            {job.stage ?? labels[job.state]}
          </span>
          {job.progress !== null && (
            <span className="job-frame-track">
              <span
                className="job-frame-fill"
                style={{ transform: `scaleX(${job.progress})` }}
              />
            </span>
          )}
        </div>
      )}
      {results.map((output) => {
        const src = `/api/jobs/output?job=${encodeURIComponent(job.id)}&output=${encodeURIComponent(output.id)}`;
        const image = output.mediaType.startsWith("image/");
        const video = output.mediaType.startsWith("video/");
        return (
          <figure key={output.id} className="mt-4 max-w-xl">
            {image && (
              <img
                src={src}
                alt={job.prompt}
                // Older results without a recorded size keep their natural shape.
                width={output.width ?? undefined}
                height={output.height ?? undefined}
                loading="lazy"
                decoding="async"
                className="job-image h-auto max-h-[36rem] w-auto max-w-full rounded-lg bg-surface"
                // Fades in once decoded; an already cached image shows at once.
                ref={(node) => {
                  if (node?.complete && node.naturalWidth)
                    node.dataset.loaded = "true";
                }}
                onLoad={(event) => {
                  event.currentTarget.dataset.loaded = "true";
                }}
                onError={(event) => {
                  event.currentTarget.hidden = true;
                  event.currentTarget.nextElementSibling?.removeAttribute(
                    "hidden",
                  );
                }}
              />
            )}
            {video && (
              <video
                ref={repairVideoPoster}
                src={src}
                poster={`${src}&variant=poster`}
                controls
                playsInline
                preload="metadata"
                aria-label={job.prompt}
                className="aspect-video w-full rounded-lg bg-black object-contain"
              />
            )}
            <figcaption hidden className="text-sm text-muted-foreground">
              Saved {image ? "image" : "file"} temporarily unavailable. Reload
              to try again.
            </figcaption>
            <div className="mt-2 -ml-2.5 flex flex-wrap gap-1">
              <Button asChild variant="ghost" size="sm">
                <a href={src} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  {image ? "Open image" : video ? "Open video" : "Open asset"}
                </a>
              </Button>
              {job.state === "succeeded" && (
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                >
                  <Link to="/recipes/new" search={{ job: job.id }}>
                    <BookOpen aria-hidden="true" />
                    Save as recipe
                  </Link>
                </Button>
              )}
            </div>
          </figure>
        );
      })}
      {(job.error || error) && (
        <p role="alert" className="mt-3 max-w-2xl text-sm text-destructive">
          {error || job.error}
        </p>
      )}
      {live && job.state !== "cancelling" && job.state !== "persisting" && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={pending}
          onClick={() => void action("cancel")}
        >
          Cancel
        </Button>
      )}
      {job.state === "needs_attention" && (
        <>
          <div className="mt-3 flex gap-4">
            {job.providerJobId && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void action("reconcile")}
              >
                Check again
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              aria-describedby={dismissNote}
              onClick={() => void action("cancel")}
            >
              Dismiss
            </Button>
            <a
              href="https://cloud.comfy.org"
              target="_blank"
              rel="noreferrer"
              className="text-sm underline underline-offset-4"
            >
              Open Comfy Cloud
            </a>
          </div>
          <p
            id={dismissNote}
            className="mt-2 max-w-2xl text-xs text-muted-foreground"
          >
            Dismissing stops tracking this job and keeps anything already saved.
            Comfy may still have run it, so check your Comfy usage.
          </p>
        </>
      )}
    </article>
  );
}

/**
 * Element sheets, Location views and revisions send long built prompts; the
 * list shows their opening lines and keeps the rest one click away.
 */
const LONG_PROMPT = 240;
function JobPrompt({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  const long = prompt.length > LONG_PROMPT;
  return (
    <div className="min-w-0 max-w-2xl flex-1">
      <p
        className={`text-sm leading-6 break-words ${long && !open ? "line-clamp-3" : ""}`}
      >
        {prompt}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="mt-1 text-xs text-muted-foreground underline underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? "Show less" : "Show full prompt"}
        </button>
      )}
    </div>
  );
}
