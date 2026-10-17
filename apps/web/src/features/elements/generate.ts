import { useMemo, useSyncExternalStore } from "react";
import { isActiveJob, type Job } from "@open-cinema/contracts";
import { beginLocalSession, submitGeneration } from "@/server/functions";
import {
  acceptSnapshot,
  reconnectGeneration,
  useGeneration,
} from "@/features/generation/store";
import type {
  Element,
  ElementState,
  GuidanceSlot,
  ReferenceView,
} from "./model";
import { elementTypes, viewPrompt } from "./model";
import { reloadElements } from "./store";

export interface JobView {
  state: Job["state"];
  active: boolean;
  progress: number | null;
  /** Set once the image is stored and can be added to a reference sheet. */
  output: { jobId: string; outputId: string; url: string } | null;
  error: string | null;
}

/** Live status of every generation job in this session. */
export function useJobViews(): {
  jobs: ReadonlyMap<string, JobView>;
  ready: boolean;
  connection: ReturnType<typeof useGeneration>["connection"];
} {
  const { snapshot, connection } = useGeneration();
  const jobs = useMemo(() => {
    const views = new Map<string, JobView>();
    for (const job of snapshot?.jobs ?? []) {
      const output = job.outputs.find(
        (o) => o.r2Key && o.mediaType.startsWith("image/"),
      );
      views.set(job.id, {
        state: job.state,
        active: isActiveJob(job.state),
        progress: job.progress,
        output:
          job.state === "succeeded" && output
            ? {
                jobId: job.id,
                outputId: output.id,
                url: `/api/jobs/output?job=${encodeURIComponent(job.id)}&output=${encodeURIComponent(output.id)}`,
              }
            : null,
        error: job.error,
      });
    }
    return views;
  }, [snapshot]);
  return { jobs, ready: !!snapshot, connection };
}

/** Starts this browser's local session, then reloads anything scoped to it. */
export async function startSession() {
  await beginLocalSession();
  reconnectGeneration();
  await reloadElements();
}

/**
 * A view submitted for an Element whose image is not on the sheet yet. A
 * reference sheet can only hold stored images, so the job waits here until
 * the creator approves or rejects its result. Kept with the browser session
 * that owns the jobs.
 */
export interface PendingView {
  jobId: string;
  elementId: string;
  stateId: string | null;
  view: ReferenceView;
  prompt: string;
  createdAt: string;
}

const PENDING_KEY = "open-cinema:element-views:v1";
let pending: PendingView[] | null = null;
const pendingListeners = new Set<() => void>();
const noPending: PendingView[] = [];

function readPending(): PendingView[] {
  if (pending) return pending;
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(PENDING_KEY) ?? "[]",
    );
    pending = Array.isArray(parsed) ? (parsed as PendingView[]) : [];
  } catch {
    pending = [];
  }
  return pending;
}
function writePending(next: PendingView[]) {
  pending = next;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(next));
  } catch {
    /* The list still works for this tab. */
  }
  for (const listener of pendingListeners) listener();
}
function subscribePending(listener: () => void) {
  pendingListeners.add(listener);
  const sync = (event: StorageEvent) => {
    if (event.key !== PENDING_KEY) return;
    pending = null;
    listener();
  };
  window.addEventListener("storage", sync);
  return () => {
    pendingListeners.delete(listener);
    window.removeEventListener("storage", sync);
  };
}
export function usePendingViews(elementId: string): PendingView[] {
  const all = useSyncExternalStore(
    subscribePending,
    readPending,
    () => noPending,
  );
  return useMemo(
    () => all.filter((p) => p.elementId === elementId),
    [all, elementId],
  );
}
export function settlePendingView(jobId: string) {
  writePending(readPending().filter((p) => p.jobId !== jobId));
}
export function retagPendingView(jobId: string, view: ReferenceView) {
  writePending(
    readPending().map((p) => (p.jobId === jobId ? { ...p, view } : p)),
  );
}

/** Submits one image job per slot; results arrive as explorations to review. */
export async function generateViews(
  element: Element,
  slots: GuidanceSlot[],
  state: ElementState | null,
  hasSession: boolean,
) {
  if (!hasSession) await startSession();
  let failure: string | null = null;
  let submitted = 0;
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
    const known = new Set(readPending().map((p) => p.jobId));
    // The newest job with this prompt is the one just accepted.
    const job = result.snapshot.jobs
      .filter((j) => j.prompt === prompt && !known.has(j.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!job) continue;
    submitted++;
    writePending([
      ...readPending(),
      {
        jobId: job.id,
        elementId: element.id,
        stateId: state?.id ?? null,
        view: slot.id,
        prompt,
        createdAt: new Date().toISOString(),
      },
    ]);
  }
  if (failure) throw new Error(failure);
  return submitted;
}

/** The required slots still missing, else the optional ones. */
export function nextSlots(
  element: Element,
  missing: GuidanceSlot[],
  count: number,
) {
  const slots = missing.length
    ? missing
    : elementTypes[element.type].slots.filter((s) => !s.required);
  return slots.slice(0, count);
}
