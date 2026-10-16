import { z } from "zod";

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
});
export type JobOutput = z.infer<typeof jobOutputSchema>;
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
  seed: z.number().int().nonnegative().nullable().default(null),
  progress: z.number().min(0).max(1).nullable().default(null),
  outputs: z.array(jobOutputSchema),
});
export type Job = z.infer<typeof jobSchema>;
export const generationCommandSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  workflowId: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()),
});
export type GenerationCommand = z.infer<typeof generationCommandSchema>;
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
  z.object({ ok: z.literal(true), snapshot: snapshotSchema }),
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

/** Transport contract; no dependency on the Worker implementation. */
export interface GenerationCoordinatorApi {
  getSnapshot(scope: OwnerScope): Promise<JobSnapshot | null>;
  submit(scope: OwnerScope, command: PromptCommand): Promise<CommandResult>;
  cancel(scope: OwnerScope, jobId: string): Promise<CommandResult>;
  reconcile(scope: OwnerScope, jobId: string): Promise<CommandResult>;
  getStoredOutput(
    scope: OwnerScope,
    jobId: string,
    outputId: string,
  ): Promise<JobOutput | null>;
}
