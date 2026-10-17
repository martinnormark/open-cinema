import {
  jobSchema,
  promptToRequest,
  resolvedMentionSchema,
  workflowCommandSchema,
  workflowGraphSchema,
  workflowKindSchema,
} from "@open-cinema/contracts";
import { z } from "zod";

/** v4 and earlier stored the prompt-only command; it always meant `image.flux`. */
const legacyCommandSchema = z.object({
  idempotencyKey: z.string().min(1),
  prompt: z.string(),
  seed: z.number().int().optional(),
});
const commandSchema = z.preprocess((value) => {
  const legacy = legacyCommandSchema.safeParse(value);
  return legacy.success && !("request" in (value as object))
    ? {
        idempotencyKey: legacy.data.idempotencyKey,
        request: promptToRequest(legacy.data.prompt),
      }
    : value;
}, workflowCommandSchema);

export const executionSchema = z.object({
  provider: z.enum(["cloud-workflow", "router"]).default("cloud-workflow"),
  workflowKind: workflowKindSchema.default("image.flux"),
  assetsPending: z.boolean().default(false),
  command: commandSchema,
  /** Element versions and approved references captured at acceptance. */
  mentions: z.array(resolvedMentionSchema).default([]),
  requestHash: z.string(),
  /**
   * Cloud: the API graph. Router v4: the full provider request. Router v5: only
   * `{ model }`; the input is rebuilt from `command.request` at submission so
   * short-lived media URLs are never persisted.
   */
  workflow: workflowGraphSchema,
  submissionKey: z.string(),
  nextAttemptAt: z.number(),
  deadline: z.number(),
  attempts: z.number().int(),
  pendingProjection: z.boolean(),
  cancelRequested: z.boolean(),
});
export type ExecutionRecord = z.infer<typeof executionSchema>;
export const COORDINATOR_SCHEMA_VERSION = 5;
const current = z.object({
  schemaVersion: z.literal(COORDINATOR_SCHEMA_VERSION),
  ownerId: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  jobs: z.array(jobSchema),
  executions: z.record(z.string(), executionSchema),
});
// v1 was transport-only and could not accept jobs.
export const coordinatorRecordSchema = z.preprocess((value) => {
  if (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    typeof value.schemaVersion === "number" &&
    value.schemaVersion >= 1 &&
    value.schemaVersion < COORDINATOR_SCHEMA_VERSION
  ) {
    const from = value.schemaVersion;
    // v5 adds workflow kinds; defaults and the command preprocess upgrade v4 executions.
    const upgraded = current.parse({
      ...value,
      schemaVersion: COORDINATOR_SCHEMA_VERSION,
      ...(from === 1 ? { executions: {} } : {}),
    });
    if (from <= 3)
      for (const job of upgraded.jobs) {
        const execution = upgraded.executions[job.id];
        if (
          execution &&
          job.state === "succeeded" &&
          job.outputs.some((o) => !o.r2Key)
        ) {
          job.state = "persisting";
          job.version++;
          upgraded.sequence++;
          execution.assetsPending = true;
          execution.pendingProjection = true;
          execution.attempts = 0;
          execution.nextAttemptAt = Date.now();
          execution.deadline = Date.now() + 15 * 60_000;
        }
      }
    return upgraded;
  }
  return value;
}, current);
export type CoordinatorRecord = z.infer<typeof current>;
