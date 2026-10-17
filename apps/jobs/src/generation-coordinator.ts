import { DurableObject } from "cloudflare:workers";
import {
  assetRefKey,
  isActiveJob,
  resultOutputs,
  ownerScopeSchema,
  parseMentionHandles,
  requestMentions,
  promptCommandSchema,
  promptToRequest,
  requestAssetRefs,
  requestPrompt,
  workflowCommandSchema,
  type GenerationCoordinatorApi,
  type JobSnapshot,
  type OwnerScope,
  type PromptCommand,
  type CommandResult,
  type Job,
  type JobOutput,
  type AssetRef,
  type ResolvedMention,
  type WorkflowCommand,
  type WorkflowCommandInput,
} from "@open-cinema/contracts";
import {
  initializeCoordinator,
  mutateCoordinator,
  readCoordinator,
  scheduleCoordinatorWake,
  replaceCoordinatorWake,
  type CoordinatorRecord,
} from "@open-cinema/database/durable";
import { createDatabase } from "@open-cinema/database";
import { applyJobSnapshot } from "@open-cinema/database/mutations";
import { resolveAssetRef } from "@open-cinema/database/queries";
import {
  createComfyClient,
  getWorkflowDefinition,
  submissionFailure,
  workflowStage,
  workflowStages,
  type ComfyJobStatus,
  type MediaStage,
  type StageContext,
  type WorkflowDefinition,
} from "@open-cinema/comfy";
import {
  AssetUnavailableError,
  createAssetResolver,
  storedAsset,
  type UploadCache,
} from "./asset-resolver";
import { MediaRejectedError, renderMedia } from "./media";
import { MentionError, resolveMentions } from "./mentions";

import {
  archiveOutput,
  posterObjectKey,
  storedPoster,
  storeProducedOutput,
  storeRenderedPoster,
  type PosterFacts,
} from "@open-cinema/assets";
import { recordPoster } from "@open-cinema/database/mutations";

const POLL_MS = 2000;
const DEADLINE_MS = 30 * 60_000;
// Provider fetch links outlive monitoring so a recovered submission can still read them.
const LINK_GRACE_MS = 60 * 60_000;
/** Router's shared queue can hold a job for hours; past this, ask the creator. */
const MAX_QUEUE_WAIT_MS = 6 * 60 * 60_000;
/**
 * How many jobs one creator may have running at Router or Comfy Cloud at once.
 * `MAX_ACTIVE_JOBS` raises it; unset or invalid means one. Capped at the four
 * active jobs a creator's queue holds.
 */
export function maxActiveJobs(value: string | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 4) : 1;
}
/** Comfy storage links last about 24 h; reuse one only while it has hours left. */
const UPLOAD_REUSE_MS = 16 * 60 * 60_000;
type Execution = CoordinatorRecord["executions"][string];
/**
 * When signed media links expire. They must outlive the whole watch window,
 * since a provider may fetch them only after hours in Router's queue. Fixed per
 * job so a request rebuilt after a lost receipt is byte-identical.
 */
export function mediaLinkExpiry(createdAt: string, deadline: number) {
  return (
    Math.max(Date.parse(createdAt) + MAX_QUEUE_WAIT_MS, deadline) +
    LINK_GRACE_MS
  );
}
const stageOf = (execution: Execution) =>
  workflowStage(
    execution.workflowKind,
    execution.stage,
    execution.command.request.inputs,
  );
const deadlineFor = (execution: Execution) =>
  stageOf(execution)?.deadlineMs ??
  getWorkflowDefinition(execution.workflowKind)?.deadlineMs ??
  DEADLINE_MS;
/** Later stages store their outputs as `{stage}:{asset}` beside earlier ones. */
const stagePrefix = (execution: Execution) => {
  const stage = stageOf(execution);
  return stage ? `${stage.id}:` : "";
};
/** Posters the container makes at once for one creator; the rest wait their turn. */
const POSTER_CONCURRENCY = 2;
function measured(headers: Headers): PosterFacts {
  const read = (name: string) => {
    const n = Number(headers.get(name));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const seconds = read("x-media-duration");
  return {
    width: read("x-media-width"),
    height: read("x-media-height"),
    durationMs: seconds === undefined ? undefined : Math.round(seconds * 1000),
  };
}
/** Media steps retry on their own; past this many failures the creator decides. */
const MEDIA_ATTEMPTS = 5;
/**
 * Moves a job whose current stage's outputs are all saved to its next stage,
 * or to succeeded after the last one. Runs inside a coordinator mutation.
 */
function advanceStage(job: Job, execution: Execution) {
  execution.assetsPending = false;
  execution.cancelRequested = false;
  execution.attempts = 0;
  const next = workflowStage(
    execution.workflowKind,
    execution.stage + 1,
    execution.command.request.inputs,
  );
  if (!next) {
    job.state = "succeeded";
    job.progress = 1;
    job.stage = null;
    return;
  }
  execution.stage++;
  execution.nextAttemptAt = Date.now();
  execution.deadline = Date.now() + next.deadlineMs;
  job.stage = next.label;
  job.progress = null;
  job.error = null;
  if (next.kind === "router") {
    // A fresh Router request: new model, new receipt, new idempotency key.
    execution.workflow = { model: next.model };
    execution.submissionKey = crypto.randomUUID();
    job.providerJobId = null;
    job.state = "queued";
  } else {
    job.state = "running";
  }
}
async function sha256(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
const terminal = (job: Job) => !isActiveJob(job.state);
const snapshot = (record: CoordinatorRecord): JobSnapshot => ({
  protocolVersion: 1,
  type: "snapshot",
  sequence: record.sequence,
  emittedAt: new Date().toISOString(),
  jobs: record.jobs,
});
const failure = (error: string): CommandResult => ({ ok: false, error });
function touch(record: CoordinatorRecord, job: Job) {
  job.version++;
  job.updatedAt = new Date().toISOString();
  record.sequence++;
  record.executions[job.id]!.pendingProjection = true;
}

export class GenerationCoordinator
  extends DurableObject<JobsEnv>
  implements GenerationCoordinatorApi
{
  /** Posters being made, by ref, so concurrent requests share one render. */
  private posters = new Map<string, Promise<{ posterKey: string } | null>>();
  private posterSlots = POSTER_CONCURRENCY;
  private posterQueue: (() => void)[] = [];

  async getSnapshot(scope: OwnerScope): Promise<JobSnapshot | null> {
    const record = await initializeCoordinator(
      this.ctx.storage,
      ownerScopeSchema.parse(scope),
    );
    return record ? snapshot(record) : null;
  }

  async submit(
    scope: OwnerScope,
    input: PromptCommand | WorkflowCommandInput,
  ): Promise<CommandResult> {
    scope = ownerScopeSchema.parse(scope);
    let command: WorkflowCommand;
    let requestHash: string;
    if (input && typeof input === "object" && "request" in input) {
      const parsed = workflowCommandSchema.safeParse(input);
      if (!parsed.success)
        return failure(
          "This request is incomplete. Check its inputs and try again.",
        );
      command = parsed.data;
    } else {
      const parsed = promptCommandSchema.safeParse(input);
      if (!parsed.success)
        return failure("Enter a prompt between 3 and 2,000 characters.");
      if (parsed.data.seed !== undefined)
        return failure(
          "FLUX 3 Image does not accept a seed. Reload the studio and try again.",
        );
      command = {
        idempotencyKey: parsed.data.idempotencyKey,
        request: promptToRequest(parsed.data.prompt),
      };
    }
    const definition = getWorkflowDefinition(
      command.request.workflowKind,
    ) as WorkflowDefinition | null;
    if (!definition)
      return failure("That kind of generation is not available yet.");
    if (!this.env.COMFY_API_KEY?.trim())
      return failure("Comfy Router credentials are not configured.");
    const model = definition.model(command.request.inputs as never);
    // Prompt-only commands keep their pre-v5 hash so retries across a deploy still match.
    requestHash =
      "request" in input
        ? await sha256({ request: command.request, model })
        : await sha256({ prompt: requestPrompt(command.request), model });
    let mentions: ResolvedMention[] = [];
    const assets = requestAssetRefs(command.request);
    const needsLookup =
      assets.length > 0 ||
      requestMentions(command.request).length > 0 ||
      parseMentionHandles(requestPrompt(command.request)).length > 0;
    // Plain prompts never touch D1, so a D1 outage cannot block them.
    if (needsLookup)
      try {
        const db = createDatabase(this.env.DB);
        mentions = await resolveMentions(db, scope, command.request);
        for (const ref of assets)
          if (!(await resolveAssetRef(db, scope, ref)))
            return failure(
              "Some media in this request is no longer available. Choose it again.",
            );
      } catch (error) {
        if (error instanceof MentionError) return failure(error.message);
        return failure(
          "Your Elements and media could not be loaded. Try again.",
        );
      }
    let error: string | null = null;
    let jobId: string | null = null;
    const record = await mutateCoordinator(
      this.ctx.storage,
      scope,
      (record) => {
        error = null;
        jobId = null;
        const existing = Object.values(record.executions).find(
          (e) => e.command.idempotencyKey === command.idempotencyKey,
        );
        if (existing) {
          jobId =
            Object.entries(record.executions).find(
              ([, e]) => e === existing,
            )?.[0] ?? null;
          if (existing.requestHash !== requestHash)
            error =
              "This request key was already used for a different request.";
          return;
        }
        if (record.jobs.some((j) => j.state === "needs_attention")) {
          error =
            "Resolve the uncertain job in Activity before starting another generation.";
          return;
        }
        if (record.jobs.filter((j) => isActiveJob(j.state)).length >= 4) {
          error =
            "Your queue is full. Wait for a job to finish or cancel a queued job.";
          return;
        }
        if (record.jobs.length >= 100) {
          error = "This MVP session has reached its 100-job limit.";
          return;
        }
        const now = new Date().toISOString();
        const job: Job = {
          id: crypto.randomUUID(),
          ownerId: scope.ownerId,
          state: "queued",
          version: 1,
          providerJobId: null,
          createdAt: now,
          updatedAt: now,
          // A revision reads as the creator's stated change; its prompt is
          // only the extra direction (a recast's may be a wardrobe note).
          prompt:
            command.revision?.intent || requestPrompt(command.request) || "",
          model:
            typeof definition.displayModel === "function"
              ? definition.displayModel(command.request.inputs as never)
              : definition.displayModel,
          workflowKind: command.request.workflowKind,
          projectId: command.projectId ?? null,
          seed: null,

          progress: null,
          stage: workflowStages(
            command.request.workflowKind,
            command.request.inputs,
          ).length
            ? (definition.label ?? null)
            : null,
          error: null,
          outputs: [],
        };
        record.jobs.unshift(job);
        jobId = job.id;
        record.executions[job.id] = {
          command,
          requestHash,
          provider:
            definition.provider?.(command.request.inputs as never) ?? "router",
          workflowKind: command.request.workflowKind,
          mentions,
          assetsPending: false,
          workflow: { model },
          submissionKey: crypto.randomUUID(),
          uploads: {},
          stage: 0,
          nextAttemptAt: Date.now(),
          deadline: Date.now() + definition.deadlineMs,
          attempts: 0,
          pendingProjection: true,
          cancelRequested: false,
        };
        record.sequence++;
      },
    );
    if (!record) return failure("Forbidden");
    if (error) return failure(error);
    this.broadcast(record);
    return {
      ok: true,
      snapshot: snapshot(record),
      ...(jobId ? { jobId } : {}),
    };
  }

  async cancel(scope: OwnerScope, jobId: string): Promise<CommandResult> {
    const record = await mutateCoordinator(
      this.ctx.storage,
      ownerScopeSchema.parse(scope),
      (record) => {
        const job = record.jobs.find((j) => j.id === jobId);
        // With no receipt there is nothing to check again, so the creator can
        // dismiss it; otherwise it would pause admission for good.
        if (job?.state === "needs_attention" && !job.providerJobId) {
          record.executions[jobId]!.cancelRequested = true;
          job.state = "cancelled";
          job.error =
            "Dismissed. Comfy may still have run it, so check your Comfy usage.";
          touch(record, job);
          return;
        }
        if (!job || terminal(job) || job.state === "persisting") return;
        const execution = record.executions[jobId]!;
        execution.cancelRequested = true;
        execution.nextAttemptAt = Date.now();
        job.state =
          job.state === "queued" && !job.providerJobId
            ? "cancelled"
            : "cancelling";
        touch(record, job);
      },
    );
    if (!record || !record.jobs.some((j) => j.id === jobId))
      return failure("Job not found");
    this.broadcast(record);
    return { ok: true, snapshot: snapshot(record) };
  }

  async reconcile(scope: OwnerScope, jobId: string): Promise<CommandResult> {
    const initial = await initializeCoordinator(
      this.ctx.storage,
      ownerScopeSchema.parse(scope),
    );
    const job = initial?.jobs.find((j) => j.id === jobId);
    if (!job?.providerJobId)
      return failure(
        "No provider job ID was received. Check your Comfy Cloud history; automatic resubmission is disabled.",
      );
    const record = await mutateCoordinator(
      this.ctx.storage,
      scope,
      (record) => {
        const current = record.jobs.find((j) => j.id === jobId)!;
        if (current.state !== "needs_attention") return;
        current.state = record.executions[jobId]!.assetsPending
          ? "persisting"
          : record.executions[jobId]!.cancelRequested
            ? "cancelling"
            : "running";
        // A media stage has no provider job to reconcile; it simply retries.
        current.error = null;
        Object.assign(record.executions[jobId]!, {
          nextAttemptAt: Date.now(),
          deadline: Date.now() + deadlineFor(record.executions[jobId]!),
          attempts: 0,
        });
        touch(record, current);
      },
    );
    if (!record) return failure("Forbidden");
    this.broadcast(record);
    return { ok: true, snapshot: snapshot(record) };
  }

  async getProviderStatus(): Promise<{ comfyConfigured: boolean }> {
    // Reads no storage, so probing a throwaway DO name creates no coordinator.
    return { comfyConfigured: Boolean(this.env.COMFY_API_KEY?.trim()) };
  }

  async getStoredOutput(
    scope: OwnerScope,
    jobId: string,
    outputId: string,
  ): Promise<JobOutput | null> {
    const record = await initializeCoordinator(
      this.ctx.storage,
      ownerScopeSchema.parse(scope),
    );
    return (
      record?.jobs
        .find((j) => j.id === jobId)
        ?.outputs.find((o) => o.id === outputId) ?? null
    );
  }
  async ensurePoster(
    scope: OwnerScope,
    ref: AssetRef,
  ): Promise<{ posterKey: string } | null> {
    const { ownerId } = ownerScopeSchema.parse(scope);
    const key = assetRefKey(ref);
    let pending = this.posters.get(key);
    if (!pending) {
      pending = this.makePoster(ownerId, ref)
        .catch((error: unknown) => {
          // No poster leaves the placeholder; the next view tries again.
          console.warn(
            JSON.stringify({
              event: "poster_failed",
              ref: key,
              message:
                error instanceof Error ? error.message.slice(0, 300) : null,
            }),
          );
          return null;
        })
        .finally(() => this.posters.delete(key));
      this.posters.set(key, pending);
    }
    return pending;
  }

  private async makePoster(ownerId: string, ref: AssetRef) {
    const db = createDatabase(this.env.DB);
    const record = await readCoordinator(this.ctx.storage);
    const own =
      ref.type === "job-output" && record?.ownerId === ownerId
        ? (record.jobs.find((j) => j.id === ref.jobId)?.outputs ?? [])
        : [];
    const stored = await storedAsset(db, { ownerId }, ref, own);
    if (!stored?.mediaType.startsWith("video/")) return null;
    if (stored.posterKey) return { posterKey: stored.posterKey };
    const posterKey = posterObjectKey(ownerId, ref, stored.r2Key);
    // A poster saved before its record was written (or for an output D1 had
    // not projected yet) is reused, never rendered twice.
    let facts = await storedPoster(this.env.GENERATED_ASSETS, posterKey);
    if (!facts) {
      await this.posterSlot();
      try {
        const rendered = await renderMedia(
          this.env,
          "poster",
          [{ name: "source", r2Key: stored.r2Key }],
          AbortSignal.timeout(2 * 60_000),
        );
        facts = await storeRenderedPoster(
          this.env.GENERATED_ASSETS,
          posterKey,
          ownerId,
          rendered,
          measured(rendered.headers),
        );
      } finally {
        this.posterSlots++;
        this.posterQueue.shift()?.();
      }
    }
    await recordPoster(db, { ownerId }, ref, { posterKey, ...facts });
    return { posterKey };
  }

  private async posterSlot() {
    if (this.posterSlots > 0) {
      this.posterSlots--;
      return;
    }
    // A finishing render hands its slot straight to the next in line.
    await new Promise<void>((resolve) => this.posterQueue.push(resolve));
  }

  /** Posters for a finished job's video results, so they show at once. */
  private postersFor(ownerId: string, job: Job | undefined) {
    if (job?.state !== "succeeded") return;
    for (const output of resultOutputs(job.outputs))
      if (output.r2Key && output.mediaType.startsWith("video/"))
        this.ctx.waitUntil(
          this.ensurePoster(
            { ownerId },
            { type: "job-output", jobId: job.id, outputId: output.id },
          ),
        );
  }

  private client(execution: Execution) {
    return createComfyClient({
      apiKey: this.env.COMFY_API_KEY ?? "",
      baseUrl: (this.env as { COMFY_BASE_URL?: string }).COMFY_BASE_URL,
      provider: execution.provider,
      workflow: execution.workflow,
      ...(execution.provider === "router"
        ? {
            outputs: (() => {
              const stage = stageOf(execution);
              return stage?.kind === "router"
                ? stage.outputs
                : getWorkflowDefinition(execution.workflowKind)?.outputs;
            })(),
          }
        : {
            outputNodes: getWorkflowDefinition(execution.workflowKind)
              ?.cloudOutputNodes,
          }),
    });
  }

  /**
   * v4 Router checkpoints persisted the full request, and legacy Cloud jobs
   * their graph. v5 keeps only `{ model }` and rebuilds the request (a Router
   * input or a Cloud graph with its media) from the typed command, so media
   * links are created fresh and never stored.
   */
  private async providerRequest(
    ownerId: string,
    job: Job,
    execution: Execution,
  ): Promise<Record<string, unknown>> {
    if (
      "input" in execution.workflow ||
      typeof execution.workflow.model !== "string"
    )
      return execution.workflow;
    const { request } = execution.command;
    const definition = getWorkflowDefinition(
      request.workflowKind,
    ) as WorkflowDefinition | null;
    if (!definition) throw new AssetUnavailableError(request.workflowKind);
    const stage = stageOf(execution);
    const created = new Map<string, string>();
    const context = this.stageContext(ownerId, job, execution, created);
    const built =
      stage?.kind === "router"
        ? await stage.build(request.inputs as never, context)
        : await definition.build(request.inputs as never, context);
    // Saved before submitting, so a restart mid-submit rebuilds the same request.
    if (created.size)
      await mutateCoordinator(this.ctx.storage, { ownerId }, (record) => {
        const current = record.executions[job.id];
        if (!current) return;
        for (const [key, url] of created)
          current.uploads[key] = { url, at: Date.now() };
      });
    return { model: built.model, input: built.input };
  }

  /** Request media and this job's saved outputs, as a stage builder sees them. */
  private stageContext(
    ownerId: string,
    job: Job,
    execution: Execution,
    /** Collects storage links created while building, for the caller to save. */
    created?: Map<string, string>,
  ): StageContext {
    const saved = job.outputs.filter((o) => o.r2Key);
    const now = Date.now();
    const uploads: UploadCache = {
      get(key) {
        const upload = execution.uploads[key];
        return upload && now - upload.at < UPLOAD_REUSE_MS
          ? upload.url
          : undefined;
      },
      set: (key, url) => created?.set(key, url),
    };
    return {
      mentions: execution.mentions,
      asset: createAssetResolver(
        this.env,
        { ownerId },
        mediaLinkExpiry(job.createdAt, execution.deadline),
        saved,
        uploads,
      ),
      saved: saved.map((o) => o.providerAssetId),
      output(providerAssetId): AssetRef | null {
        const output = saved.find((o) => o.providerAssetId === providerAssetId);
        return output
          ? { type: "job-output", jobId: job.id, outputId: output.id }
          : null;
      },
    };
  }

  private async change(
    ownerId: string,
    id: string,
    update: (job: Job, record: CoordinatorRecord) => void,
  ) {
    let finished: Job | undefined;
    const record = await mutateCoordinator(
      this.ctx.storage,
      { ownerId },
      (record) => {
        const job = record.jobs.find((j) => j.id === id);
        if (!job) return;
        const before = job.state;
        update(job, record);
        touch(record, job);
        if (before !== "succeeded" && job.state === "succeeded") finished = job;
      },
    );
    if (record) this.broadcast(record);
    this.postersFor(ownerId, finished);
  }
  private async acceptStatus(
    ownerId: string,
    id: string,
    status: ComfyJobStatus,
  ) {
    await this.change(ownerId, id, (job, record) => {
      const execution = record.executions[id]!;
      job.providerJobId = status.providerJobId;
      job.state =
        execution.cancelRequested && isActiveJob(status.state)
          ? "cancelling"
          : status.state;
      job.progress = status.progress ?? job.progress;
      job.error = status.error;
      const prefix = stagePrefix(execution);
      // A later stage's poll replaces only its own outputs; earlier ones are saved.
      job.outputs = [
        ...(prefix
          ? job.outputs.filter((o) => !o.providerAssetId.startsWith(prefix))
          : []),
        ...status.outputs.map((o) => ({
          ...o,
          providerAssetId: `${prefix}${o.providerAssetId}`,
          id: `${id}:${prefix}${o.providerAssetId}`,
          jobId: id,
          r2Key: null,
          sizeBytes: null,
          etag: null,
        })),
      ];
      if (job.state === "succeeded") {
        job.state = "persisting";
        job.progress = null;
        execution.assetsPending = true;
        execution.cancelRequested = false;
        execution.deadline = Date.now() + 15 * 60_000;
      }
      if (job.state === "needs_attention")
        job.error =
          "Comfy returned an unknown status. Check again to reconcile this job.";
      // The monitoring deadline covers generation, not waiting in Router's queue:
      // while the provider confirms the job is queued, keep the window open.
      if (status.state === "queued" && !execution.cancelRequested)
        execution.deadline = Math.min(
          Date.parse(job.createdAt) + MAX_QUEUE_WAIT_MS,
          Math.max(execution.deadline, Date.now() + deadlineFor(execution)),
        );
      execution.attempts = 0;
      execution.nextAttemptAt = Date.now() + POLL_MS;
    });
  }

  private async archiveNextOutput(
    ownerId: string,
    job: Job,
    execution: CoordinatorRecord["executions"][string],
  ) {
    try {
      const output = job.outputs.find((o) => !o.r2Key);
      if (!job.outputs.length) throw new Error("No output assets returned");
      const prefix = stagePrefix(execution);
      const saved = output
        ? await archiveOutput(this.env.GENERATED_ASSETS, ownerId, output, () =>
            this.client(execution).getOutputUrl(
              job.providerJobId!,
              output.providerAssetId.slice(prefix.length),
            ),
          )
        : null;
      await this.change(ownerId, job.id, (current, record) => {
        const e = record.executions[job.id]!;
        if (output && saved)
          Object.assign(
            current.outputs.find((o) => o.id === output.id)!,
            saved,
          );
        e.attempts = 0;
        e.nextAttemptAt = Date.now() + 100;
        current.error = null;
        if (current.outputs.every((o) => o.r2Key)) advanceStage(current, e);
      });
    } catch {
      console.warn(
        JSON.stringify({ event: "asset_archive_retry", jobId: job.id }),
      );
      await this.change(ownerId, job.id, (current, record) => {
        const e = record.executions[job.id]!;
        e.attempts++;
        e.nextAttemptAt =
          Date.now() +
          Math.min(30_000, 1000 * 2 ** Math.min(e.attempts, 5)) +
          Math.random() * 500;
        if (e.attempts >= 8) current.state = "needs_attention";
        current.error =
          current.state === "needs_attention"
            ? "Generation finished, but its assets could not be saved. Check again to retry saving without generating again."
            : "Retrying asset storage. Your image is not saved yet.";
      });
    }
  }

  /**
   * One media task per alarm, like asset archiving: each task's MP4 is saved
   * under a deterministic key, so a repeated alarm never renders twice.
   */
  private async runMediaStage(ownerId: string, job: Job, execution: Execution) {
    if (execution.cancelRequested) {
      await this.change(ownerId, job.id, (j) => {
        j.state = "cancelled";
        j.stage = null;
        j.progress = null;
      });
      return;
    }
    const stage = stageOf(execution) as MediaStage;
    try {
      const context = this.stageContext(ownerId, job, execution);
      const tasks = stage.tasks(
        execution.command.request.inputs as never,
        context,
      );
      const done = (output: string) =>
        context.saved.includes(`${stage.id}:${output}`);
      const task = tasks.find((t) => !done(t.output));
      if (!task) {
        await this.change(ownerId, job.id, (j, r) =>
          advanceStage(j, r.executions[j.id]!),
        );
        return;
      }
      const providerAssetId = `${stage.id}:${task.output}`;
      const output: JobOutput = {
        id: `${job.id}:${providerAssetId}`,
        jobId: job.id,
        providerAssetId,
        mediaType: "video/mp4",
        r2Key: null,
        sizeBytes: null,
        etag: null,
      };
      const db = createDatabase(this.env.DB);
      const parts = await Promise.all(
        task.parts.map(async (part) => {
          const stored = await storedAsset(
            db,
            { ownerId },
            part.ref,
            job.outputs,
          );
          if (!stored) throw new AssetUnavailableError(part.name);
          return { name: part.name, r2Key: stored.r2Key };
        }),
      );
      const saved = await storeProducedOutput(
        this.env.GENERATED_ASSETS,
        ownerId,
        output,
        () =>
          renderMedia(
            this.env,
            task.operation,
            parts,
            AbortSignal.timeout(10 * 60_000),
          ),
      );
      await this.change(ownerId, job.id, (j, r) => {
        const e = r.executions[j.id]!;
        if (!j.outputs.some((o) => o.id === output.id))
          j.outputs.push({ ...output, ...saved });
        j.progress =
          (tasks.filter((t) => done(t.output)).length + 1) / tasks.length;
        j.error = null;
        e.attempts = 0;
        e.nextAttemptAt = Date.now() + 100;
      });
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "media_retry",
          jobId: job.id,
          stage: stage.id,
          message: error instanceof Error ? error.message.slice(0, 300) : null,
        }),
      );
      await this.change(ownerId, job.id, (j, r) => {
        const e = r.executions[j.id]!;
        e.attempts++;
        e.nextAttemptAt =
          Date.now() + Math.min(30_000, 1000 * 2 ** Math.min(e.attempts, 5));
        // A refusal is about the media itself; retrying the same bytes cannot help.
        const definite =
          error instanceof AssetUnavailableError ||
          error instanceof MediaRejectedError;
        if (e.attempts >= MEDIA_ATTEMPTS || definite) {
          j.state = "needs_attention";
          j.error =
            error instanceof AssetUnavailableError
              ? "Some media this result needs is no longer available."
              : error instanceof MediaRejectedError
                ? `${stage.label} could not process this clip. The generated parts are saved.`
                : `${stage.label} did not finish. Check again to retry; the generated parts are saved.`;
        }
      });
    }
  }

  async alarm(): Promise<void> {
    // Schedule a watchdog BEFORE external I/O. Crashes never lose the recovery wake.
    await scheduleCoordinatorWake(this.ctx.storage, Date.now() + 30_000);
    let record = await readCoordinator(this.ctx.storage);
    if (!record) return;
    const now = Date.now();
    // Up to MAX_ACTIVE_JOBS provider executions per owner (one by default);
    // a suspended job keeps the queue paused.
    const limit = maxActiveJobs(this.env.MAX_ACTIVE_JOBS);
    const active = record.jobs.filter(
      (j) =>
        j.state === "submitting" ||
        j.state === "running" ||
        j.state === "persisting" ||
        j.state === "cancelling" ||
        (j.state === "queued" && j.providerJobId),
    );
    const waiting = record.jobs.some((j) => j.state === "needs_attention")
      ? []
      : [...record.jobs]
          .reverse()
          .filter((j) => j.state === "queued" && !j.providerJobId);
    const due = [
      ...active,
      ...waiting.slice(0, Math.max(0, limit - active.length)),
    ].filter((j) => record!.executions[j.id]!.nextAttemptAt <= now);
    for (const job of due) {
      const execution = record.executions[job.id]!;
      if (now > execution.deadline) {
        await this.change(record.ownerId, job.id, (j) => {
          j.state = "needs_attention";
          j.error = execution.assetsPending
            ? "Generation finished, but saving its assets timed out. Check again to retry saving without generating again."
            : stageOf(execution)?.kind === "media"
              ? "Finishing the result timed out. Check again to retry; the generated parts are saved."
              : "Monitoring timed out. The provider may still be running. Check again to reconcile.";
        });
      } else if (stageOf(execution)?.kind === "media") {
        await this.runMediaStage(record.ownerId, job, execution);
      } else if (execution.assetsPending) {
        await this.archiveNextOutput(record.ownerId, job, execution);
      } else if (
        !job.providerJobId &&
        job.state !== "queued" &&
        execution.provider !== "router"
      ) {
        await this.change(record.ownerId, job.id, (j) => {
          j.state = "needs_attention";
          j.error =
            "Submission was interrupted before its receipt was saved. Check Comfy Cloud before trying again.";
        });
      } else if (!job.providerJobId) {
        const claimed = await mutateCoordinator(
          this.ctx.storage,
          { ownerId: record.ownerId },
          (r) => {
            const current = r.jobs.find((j) => j.id === job.id)!;
            if (current.state === "queued" && !current.providerJobId) {
              current.state = "submitting";
              touch(r, current);
            }
          },
        );
        if (
          !claimed ||
          !["submitting", "cancelling"].includes(
            claimed.jobs.find((j) => j.id === job.id)!.state,
          )
        ) {
          await this.reschedule(Date.now() + 100);
          return;
        }
        this.broadcast(claimed);
        let providerRequest: Record<string, unknown> | null = null;
        try {
          providerRequest = await this.providerRequest(
            record.ownerId,
            job,
            execution,
          );
        } catch (error) {
          // Nothing reached the provider, so failing or retrying here is safe.
          const unavailable = error instanceof AssetUnavailableError;
          await this.change(record.ownerId, job.id, (j, r) => {
            const e = r.executions[j.id]!;
            e.attempts++;
            e.nextAttemptAt =
              Date.now() +
              Math.min(30_000, 1000 * 2 ** Math.min(e.attempts, 5));
            if (unavailable || e.attempts >= 8) {
              j.state = "failed";
              j.error = unavailable
                ? "Some media in this request is no longer available. Choose it again."
                : "This generation's media could not be prepared. Try again.";
            }
          });
        }
        if (providerRequest)
          try {
            const result = await this.client(execution).submit(
              providerRequest,
              execution.submissionKey,
              AbortSignal.timeout(20_000),
            );
            await this.acceptStatus(record.ownerId, job.id, result);
          } catch (error) {
            console.warn(
              JSON.stringify({
                event: "submission_error",
                jobId: job.id,
                name: error instanceof Error ? error.name : "unknown",
                code:
                  typeof error === "object" && error !== null && "code" in error
                    ? error.code
                    : null,
                httpStatus:
                  typeof error === "object" &&
                  error !== null &&
                  "httpStatus" in error
                    ? error.httpStatus
                    : null,
              }),
            );
            const reason = submissionFailure(error, execution.provider);
            await this.change(record.ownerId, job.id, (j, r) => {
              const e = r.executions[j.id]!;
              // A rejection while recovering a lost receipt cannot prove that the
              // earlier call was rejected (credentials may have changed meanwhile).
              const rejectedRecovery =
                execution.provider === "router" &&
                job.state !== "queued" &&
                !reason.ambiguous;
              e.attempts++;
              e.nextAttemptAt =
                Date.now() +
                Math.min(30_000, 1000 * 2 ** Math.min(e.attempts, 5)) +
                Math.random() * 500;
              j.state = rejectedRecovery
                ? "needs_attention"
                : !reason.ambiguous
                  ? "failed"
                  : execution.provider === "router" && e.attempts < 8
                    ? e.cancelRequested
                      ? "cancelling"
                      : "submitting"
                    : "needs_attention";
              j.error =
                j.state === "needs_attention"
                  ? "The submission receipt could not be recovered. Check Comfy before starting another generation."
                  : reason.message;
            });
          }
      } else {
        try {
          const result = execution.cancelRequested
            ? await this.client(execution).cancel(
                job.providerJobId,
                AbortSignal.timeout(20_000),
              )
            : await this.client(execution).getStatus(job.providerJobId);
          await this.acceptStatus(record.ownerId, job.id, result);
        } catch {
          await this.change(record.ownerId, job.id, (j, r) => {
            const e = r.executions[j.id]!;
            e.attempts++;
            e.nextAttemptAt =
              Date.now() +
              Math.min(30_000, 1000 * 2 ** Math.min(e.attempts, 5)) +
              Math.random() * 500;
            if (e.attempts >= 8) {
              j.state = "needs_attention";
              j.error =
                "Comfy is not responding. Your job may still be running; check again to reconcile.";
            }
          });
        }
      }
    }
    record = (await readCoordinator(this.ctx.storage))!;
    for (const job of record.jobs
      .filter((j) => record!.executions[j.id]?.pendingProjection)
      .slice(0, 8)) {
      try {
        await applyJobSnapshot(
          createDatabase(this.env.DB),
          job,
          record.executions[job.id]!,
        );
        await mutateCoordinator(
          this.ctx.storage,
          { ownerId: record.ownerId },
          (r) => {
            if (r.jobs.find((j) => j.id === job.id)?.version === job.version)
              r.executions[job.id]!.pendingProjection = false;
          },
        );
      } catch {
        console.warn(
          JSON.stringify({ event: "projection_retry", jobId: job.id }),
        );
      }
    }
    record = (await readCoordinator(this.ctx.storage))!;
    let next = Infinity;
    for (const socket of this.ctx.getWebSockets()) {
      const expiry = this.socketExpiry(socket);
      if (expiry <= Date.now()) socket.close(1008, "Session expired");
      else next = Math.min(next, expiry);
    }
    // Replace the watchdog with the actual earliest due time (or remove it when idle).
    await this.reschedule(next);
  }

  private async reschedule(next: number) {
    // Keep storage access inside the database package, including alarm cancellation.
    await replaceCoordinatorWake(
      this.ctx.storage,
      Number.isFinite(next) ? Math.max(Date.now() + 100, next) : null,
    );
  }
  private socketExpiry(socket: WebSocket): number {
    const value: unknown = socket.deserializeAttachment();
    return typeof value === "object" &&
      value !== null &&
      "expiresAt" in value &&
      typeof value.expiresAt === "number"
      ? value.expiresAt
      : 0;
  }
  private broadcast(record: CoordinatorRecord) {
    const data = JSON.stringify(snapshot(record));
    for (const socket of this.ctx.getWebSockets()) {
      try {
        if (this.socketExpiry(socket) <= Date.now())
          socket.close(1008, "Session expired");
        else if (data.length > 512_000)
          socket.close(1013, "Snapshot too large");
        else socket.send(data);
      } catch {
        socket.close(1011, "Reconnect to synchronize");
      }
    }
  }
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket upgrade required", { status: 426 });
    const scope = ownerScopeSchema.safeParse({
      ownerId: request.headers.get("X-Owner-Id"),
    });
    const expiresAt = Number(request.headers.get("X-Session-Expires-At"));
    if (
      !scope.success ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    )
      return new Response("Unauthorized", { status: 401 });
    const initial = await this.getSnapshot(scope.data);
    if (!initial) return new Response("Forbidden", { status: 403 });
    await scheduleCoordinatorWake(this.ctx.storage, expiresAt);
    // Refresh AFTER awaiting the alarm; no await between final snapshot and socket registration.
    const latest = await readCoordinator(this.ctx.storage);
    if (this.ctx.getWebSockets().length >= 10)
      return new Response("Too many connections", { status: 429 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ expiresAt });
    pair[1].send(JSON.stringify(snapshot(latest!)));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  webSocketMessage(socket: WebSocket) {
    socket.close(1008, "Read-only status stream");
  }
  webSocketClose(socket: WebSocket) {
    socket.close(1000, "Connection closed");
  }
  webSocketError(socket: WebSocket) {
    socket.close(1011, "Connection error");
  }
}
