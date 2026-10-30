import { useMemo, useSyncExternalStore } from "react";
import {
  isActiveJob,
  type GenerationRequest,
  type AssetRef,
  type Job,
} from "@open-cinema/contracts";
import { estimateGeneration } from "@open-cinema/comfy/estimates";
import {
  formatCost,
  shouldShowEstimate,
  type CostPreferences,
} from "@/features/settings/preferences";
import { assetUrl } from "@/lib/media-url";
import { beginLocalSession } from "@/server/functions";
import { submitWorkflow } from "@/server/generation";
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
import { elementTypes, viewRequest } from "./model";
import { reloadElements } from "./store";

export interface JobView {
  state: Job["state"];
  active: boolean;
  progress: number | null;
  /** Set once the image or clip is stored and can be added to a reference sheet. */
  output: {
    jobId: string;
    outputId: string;
    url: string;
    kind: "image" | "video";
  } | null;
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
        (o) =>
          o.r2Key &&
          (o.mediaType.startsWith("image/") ||
            o.mediaType.startsWith("video/")),
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
                url: assetUrl({
                  type: "job-output",
                  jobId: job.id,
                  outputId: output.id,
                }),
                kind: output.mediaType.startsWith("video/") ? "video" : "image",
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

/**
 * Submits one image job per slot, conditioned on the approved references;
 * results arrive as explorations to review.
 */
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
    const request = viewRequest(element, slot, state);
    if (request.workflowKind === "image.character-sheet")
      request.inputs.cacheNonce = crypto.getRandomValues(
        new Uint32Array(1),
      )[0]!;
    const result = await submitWorkflow({
      data: { idempotencyKey: crypto.randomUUID(), request },
    });
    if (!result.ok) {
      failure = result.error;
      break;
    }
    acceptSnapshot(result.snapshot);
    if (!result.jobId) continue;
    submitted++;
    writePending([
      ...readPending(),
      {
        jobId: result.jobId,
        elementId: element.id,
        stateId: state?.id ?? null,
        view: slot.id,
        prompt: request.inputs.prompt ?? "",
        createdAt: new Date().toISOString(),
      },
    ]);
  }
  if (failure) throw new Error(failure);
  return submitted;
}

/** What one view request runs on, in words. */
function requestModel(request: GenerationRequest) {
  if (request.workflowKind === "image.character-sheet")
    return "FLUX 3 Image · ComfyUI workflow";
  if (request.workflowKind !== "video.ltx") return "FLUX 3 Image";
  return request.inputs.firstFrame
    ? "FLUX 3 Video, continuing from the establishing view"
    : `LTX 2.5, ${request.inputs.durationSeconds} s from the description`;
}

/**
 * "FLUX 3 Image · guided by 4 approved references · about 12 credits,
 * 20–80 s" for one or more view requests made together.
 */
export function describeViewRequests(
  requests: readonly GenerationRequest[],
  preferences: CostPreferences,
) {
  const parts = [...new Set(requests.map(requestModel))];
  const guides = requests.flatMap((r) =>
    r.workflowKind === "image.flux-reference" ||
    r.workflowKind === "image.character-sheet"
      ? [r.inputs.references.length]
      : [],
  );
  if (guides.some((count) => count > 0)) {
    const n = Math.max(...guides);
    parts.push(
      `guided by ${n} approved ${n === 1 ? "reference" : "references"}`,
    );
  }
  const video = requests.some((r) => r.workflowKind === "video.ltx");
  const estimates = requests.map((r) => estimateGeneration(r));
  if (
    shouldShowEstimate(preferences, video ? "video" : "image") &&
    estimates.every((e) => e.credits)
  ) {
    const credits = {
      min: estimates.reduce((n, e) => n + e.credits!.min, 0),
      max: estimates.reduce((n, e) => n + e.credits!.max, 0),
    };
    // Side by side the wait is the longest view; queued one at a time
    // (the default job limit) it is all of them.
    const seconds = {
      min: Math.max(...estimates.map((e) => e.seconds.min)),
      max: estimates.reduce((n, e) => n + e.seconds.max, 0),
    };
    parts.push(
      `about ${formatCost(credits, preferences.unit)}, ${Math.round(seconds.min)}–${Math.round(seconds.max)} s`,
    );
  } else
    parts.push(
      requests.some((r) => r.workflowKind === "image.character-sheet")
        ? "uses your Comfy Cloud credits"
        : "uses your Comfy Router credits",
    );
  return parts.join(" · ");
}

/** Keep the source approved until the creator accepts the new edit. */
export async function editCharacterReference(
  element: Element,
  view: ReferenceView,
  stateId: string | null,
  source: AssetRef,
  edit: string,
) {
  const slot = elementTypes.character.slots.find((s) => s.id === view);
  if (!slot?.shot)
    throw new Error("Choose a character sheet or close portrait to edit");
  const state = element.states.find((s) => s.id === stateId) ?? null;
  const original = viewRequest(element, slot, state);
  if (original.workflowKind !== "image.character-sheet")
    throw new Error("Choose a character reference");
  const request: GenerationRequest = {
    ...original,
    inputs: {
      ...original.inputs,
      source,
      edit,
      references: [],
      cacheNonce: crypto.getRandomValues(new Uint32Array(1))[0]!,
    },
  };
  const result = await submitWorkflow({
    data: { idempotencyKey: crypto.randomUUID(), request },
  });
  if (!result.ok) throw new Error(result.error);
  acceptSnapshot(result.snapshot);
  if (result.jobId)
    writePending([
      ...readPending(),
      {
        jobId: result.jobId,
        elementId: element.id,
        stateId,
        view,
        prompt: edit,
        createdAt: new Date().toISOString(),
      },
    ]);
}
