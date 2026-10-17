import { useState } from "react";
import { isActiveJob, type Job } from "@open-cinema/contracts";
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
  return (
    <article className="py-6">
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 max-w-2xl flex-1 text-sm leading-6 break-words">
          {job.prompt}
        </p>
        <span className="shrink-0 text-xs font-medium" role="status">
          {labels[job.state]}
          {job.progress !== null && isActiveJob(job.state)
            ? ` · ${Math.round(job.progress * 100)}%`
            : ""}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {job.model}
        {job.seed !== null ? ` · Seed ${job.seed}` : ""}
      </p>
      {job.outputs
        .filter((output) => output.r2Key)
        .map((output) => (
          <figure key={output.id} className="mt-4 max-w-xl">
            {output.mediaType.startsWith("image/") && (
              <img
                src={`/api/jobs/output?job=${encodeURIComponent(job.id)}&output=${encodeURIComponent(output.id)}`}
                alt={job.prompt}
                width={1024}
                height={1024}
                loading="lazy"
                className="aspect-square w-full rounded-lg object-contain"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                  event.currentTarget.nextElementSibling?.removeAttribute(
                    "hidden",
                  );
                }}
              />
            )}
            {output.mediaType.startsWith("video/") && (
              <video
                ref={repairVideoPoster}
                src={`/api/jobs/output?job=${encodeURIComponent(job.id)}&output=${encodeURIComponent(output.id)}`}
                poster={`/api/jobs/output?job=${encodeURIComponent(job.id)}&output=${encodeURIComponent(output.id)}&variant=poster`}
                controls
                playsInline
                preload="metadata"
                aria-label={job.prompt}
                className="aspect-video w-full rounded-lg bg-black object-contain"
              />
            )}
            <figcaption hidden className="text-sm text-muted-foreground">
              Saved image temporarily unavailable. Reload to try again.
            </figcaption>
            <a
              className="mt-2 inline-block text-sm underline underline-offset-4"
              href={`/api/jobs/output?job=${encodeURIComponent(job.id)}&output=${encodeURIComponent(output.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              {output.mediaType.startsWith("image/")
                ? "Open image"
                : output.mediaType.startsWith("video/")
                  ? "Open video"
                  : "Open asset"}
            </a>
          </figure>
        ))}
      {(job.error || error) && (
        <p role="alert" className="mt-3 max-w-2xl text-sm text-destructive">
          {error || job.error}
        </p>
      )}
      {isActiveJob(job.state) &&
        job.state !== "cancelling" &&
        job.state !== "persisting" && (
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
        <div className="mt-3 flex gap-4">
          {!job.providerJobId && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void action("cancel")}
            >
              Dismiss
            </Button>
          )}
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
          <a
            href="https://cloud.comfy.org"
            target="_blank"
            rel="noreferrer"
            className="text-sm underline underline-offset-4"
          >
            Open Comfy Cloud
          </a>
        </div>
      )}
    </article>
  );
}
