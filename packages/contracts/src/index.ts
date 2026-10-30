import { z } from "zod";
import { workflowKindSchema } from "./workflow-kinds";
import type { WorkflowCommandInput } from "./workflows";
import type { AssetRef } from "./media";
import type { PlanSequenceInput, SequencePlan } from "./sequences";

export const jobStateSchema = z.enum([
  "queued",
  "submitting",
  "running",
  "persisting",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
  "needs_attention",
]);
export type JobState = z.infer<typeof jobStateSchema>;
export const ownerScopeSchema = z.object({ ownerId: z.string().min(1) });
export type OwnerScope = z.infer<typeof ownerScopeSchema>;
export const workflowGraphSchema = z.record(z.string(), z.unknown());
export const workflowSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  version: z.number().int().positive(),
  graph: workflowGraphSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Workflow = z.infer<typeof workflowSchema>;
export const jobOutputSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  providerAssetId: z.string(),
  mediaType: z.string(),
  r2Key: z.string().nullable().default(null),
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  etag: z.string().nullable().default(null),
  /** A video's poster still, and the size and length measured while making it. */
  posterKey: z.string().nullish(),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  durationMs: z.number().int().nonnegative().nullish(),
});
export type JobOutput = z.infer<typeof jobOutputSchema>;

/**
 * Alternative results of one job that a creator chooses between. Background
 * replacement offers the foreground lock (the source performers composited over
 * the generated background) and the unlocked edit (the model's own relit
 * performers), both conformed to the source's frame rate and audio.
 */
export const resultVariantSchema = z.enum(["locked", "unlocked"]);
export type ResultVariant = z.infer<typeof resultVariantSchema>;
/** Outputs of a job's later stages are stored as `{stage}:{asset}`. */
export const LOCK_STAGE = "lock";
/** A recast's edit retimed onto the source's frame grid with its audio. */
export const CONFORM_STAGE = "conform";
export function outputVariant(
  output: Pick<JobOutput, "providerAssetId">,
): ResultVariant | null {
  const [stage, asset] = output.providerAssetId.split(":");
  const variant = resultVariantSchema.safeParse(asset);
  return stage === LOCK_STAGE && variant.success ? variant.data : null;
}
/**
 * The outputs a creator sees: the variants when a job made them (locked first),
 * else a conformed output, otherwise every output. Intermediates such as a matte or the unconformed edit
 * stay stored with the job but are not results.
 */
export function resultOutputs<T extends Pick<JobOutput, "providerAssetId">>(
  outputs: readonly T[],
): T[] {
  const variants = outputs.filter((o) => outputVariant(o));
  if (!variants.length) {
    const conformed = outputs.filter((o) =>
      o.providerAssetId.startsWith(`${CONFORM_STAGE}:`),
    );
    return conformed.length ? conformed : [...outputs];
  }
  const order = resultVariantSchema.options;
  return variants.sort(
    (a, b) =>
      order.indexOf(outputVariant(a)!) - order.indexOf(outputVariant(b)!),
  );
}
export const jobSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  state: jobStateSchema,
  version: z.number().int().positive(),
  providerJobId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().nullable(),
  prompt: z.string().default(""),
  model: z.string().default("FLUX 3 Image Klein"),
  workflowKind: workflowKindSchema.default("image.flux"),
  seed: z.number().int().nonnegative().nullable().default(null),
  progress: z.number().min(0).max(1).nullable().default(null),
  /** Creator-facing step of a multi-step job, e.g. "Locking the performers". */
  stage: z.string().nullable().optional(),
  outputs: z.array(jobOutputSchema),
});
export type Job = z.infer<typeof jobSchema>;
export const promptCommandSchema = z.object({
  idempotencyKey: z.string().uuid(),
  prompt: z.string().trim().min(3).max(2000),
  // Retained for decoding legacy Cloud workflow checkpoints; Router does not accept it.
  seed: z.number().int().min(0).max(2147483647).optional(),
});
export type PromptCommand = z.infer<typeof promptCommandSchema>;
const envelope = {
  protocolVersion: z.literal(1),
  sequence: z.number().int().nonnegative(),
  emittedAt: z.string(),
};
export const snapshotSchema = z.object({
  ...envelope,
  type: z.literal("snapshot"),
  jobs: z.array(jobSchema),
});
export type JobSnapshot = z.infer<typeof snapshotSchema>;
export const commandResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    snapshot: snapshotSchema,
    /** The job a submit accepted, or the existing job its idempotency key maps to. */
    jobId: z.string().optional(),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type CommandResult = z.infer<typeof commandResultSchema>;
export const jobEventSchema = z.discriminatedUnion("type", [
  snapshotSchema,
  z.object({
    ...envelope,
    type: z.literal("job.updated"),
    jobId: z.string(),
    jobVersion: z.number().int(),
    job: jobSchema,
  }),
  z.object({
    ...envelope,
    type: z.literal("job.output"),
    jobId: z.string(),
    jobVersion: z.number().int(),
    output: jobOutputSchema,
  }),
  z.object({
    ...envelope,
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);
export type JobEvent = z.infer<typeof jobEventSchema>;
export function isActiveJob(state: JobState): boolean {
  return (
    state === "queued" ||
    state === "submitting" ||
    state === "running" ||
    state === "persisting" ||
    state === "cancelling"
  );
}
export function getOrbState(
  jobs: readonly Pick<Job, "state">[],
): "idle" | "thinking" {
  return jobs.some((job) => isActiveJob(job.state)) ? "thinking" : "idle";
}

/** Transport contract; no dependency on the server implementation. */
export interface GenerationCoordinatorApi {
  getSnapshot(scope: OwnerScope): Promise<JobSnapshot | null>;
  /** A bare prompt is shorthand for an `image.flux` workflow command. */
  submit(
    scope: OwnerScope,
    command: PromptCommand | WorkflowCommandInput,
  ): Promise<CommandResult>;
  cancel(scope: OwnerScope, jobId: string): Promise<CommandResult>;
  reconcile(scope: OwnerScope, jobId: string): Promise<CommandResult>;
  /** Display-safe: whether the job service holds Comfy credentials. Never the key. */
  getProviderStatus(): Promise<{ comfyConfigured: boolean }>;
  /** Proposes shots for an idea; falls back to a sentence split, never throws. */
  planSequence(
    scope: OwnerScope,
    input: PlanSequenceInput,
  ): Promise<SequencePlan>;
  getStoredOutput(
    scope: OwnerScope,
    jobId: string,
    outputId: string,
  ): Promise<JobOutput | null>;
}

export * from "./media";
export * from "./elements";
export * from "./replacement";
export * from "./workflows";
export * from "./sequences";
export * from "./world";
export * from "./direction";
export * from "./capabilities";
export * from "./recipes";
export * from "./camera";
export * from "./take-edits";
export * from "./vfx";
export * from "./moves";
export * from "./model-cards";
