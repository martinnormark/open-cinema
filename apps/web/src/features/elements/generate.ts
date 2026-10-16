import { useMemo } from "react";
import { isActiveJob, type Job } from "@open-cinema/contracts";
import { beginLocalSession, submitGeneration } from "@/server/functions";
import {
  acceptSnapshot,
  reconnectGeneration,
  useGeneration,
} from "@/features/generation/store";
import type { CreativeElement, ElementState, GuidanceSlot } from "./model";
import { elementTypes, viewPrompt } from "./model";
import { addReferences } from "./store";

export interface JobView {
  state: Job["state"];
  active: boolean;
  progress: number | null;
  imageUrl: string | null;
  error: string | null;
}

/** Live status and stored image for every generation job in this session. */
export function useJobViews(): {
  jobs: ReadonlyMap<string, JobView>;
  outputs: ReadonlyMap<string, string>;
  ready: boolean;
} {
  const { snapshot } = useGeneration();
  return useMemo(() => {
    const jobs = new Map<string, JobView>();
    const outputs = new Map<string, string>();
    for (const job of snapshot?.jobs ?? []) {
      const output = job.outputs.find(
        (o) => o.r2Key && o.mediaType.startsWith("image/"),
      );
      const imageUrl =
        job.state === "succeeded" && output
          ? `/api/jobs/output?job=${encodeURIComponent(job.id)}&output=${encodeURIComponent(output.id)}`
          : null;
      if (imageUrl) outputs.set(job.id, imageUrl);
      jobs.set(job.id, {
        state: job.state,
        active: isActiveJob(job.state),
        progress: job.progress,
        imageUrl,
        error: job.error,
      });
    }
    return { jobs, outputs, ready: !!snapshot };
  }, [snapshot]);
}

/** Starts a local generation session when this browser has none yet. */
export async function ensureGenerationSession(hasSnapshot: boolean) {
  if (hasSnapshot) return;
  await beginLocalSession();
  reconnectGeneration();
}

/** Submits one image job per slot and files each as an exploration on the sheet. */
export async function generateViews(
  element: CreativeElement,
  slots: GuidanceSlot[],
  state: ElementState | null,
  hasSession: boolean,
) {
  await ensureGenerationSession(hasSession);
  const submitted: { jobId: string; prompt: string; view: string }[] = [];
  let failure: string | null = null;
  for (const slot of slots) {
    const prompt = viewPrompt(element, slot, state);
    const result = await submitGeneration({
      data: { prompt, idempotencyKey: crypto.randomUUID() },
    });
    if (!result.ok) {
      failure = result.error;
      break;
    }
    acceptSnapshot(result.snapshot);
    // The newest job carrying this prompt is the one just accepted.
    const job = [...result.snapshot.jobs]
      .filter((j) => j.prompt === prompt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (job) submitted.push({ jobId: job.id, prompt, view: slot.id });
  }
  if (submitted.length)
    await addReferences(
      element.id,
      submitted.map((s) => ({
        source: { kind: "generated", jobId: s.jobId, prompt: s.prompt },
        view: s.view,
        stateId: state?.id ?? null,
      })),
    );
  if (failure) throw new Error(failure);
  return submitted.length;
}

/** The required slots still missing, else the first optional one. */
export function nextSlots(
  element: CreativeElement,
  missing: GuidanceSlot[],
  count: number,
) {
  const slots = missing.length
    ? missing
    : elementTypes[element.type].slots.filter((s) => !s.required);
  return slots.slice(0, count);
}
