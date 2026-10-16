import {
  jobSchema,
  promptCommandSchema,
  workflowGraphSchema,
} from "@open-cinema/contracts";
import { z } from "zod";
export const executionSchema = z.object({
  provider: z.enum(["cloud-workflow", "router"]).default("cloud-workflow"),
  assetsPending: z.boolean().default(false),
  command: promptCommandSchema,
  requestHash: z.string(),
  workflow: workflowGraphSchema,
  submissionKey: z.string(),
  nextAttemptAt: z.number(),
  deadline: z.number(),
  attempts: z.number().int(),
  pendingProjection: z.boolean(),
  cancelRequested: z.boolean(),
});
export type ExecutionRecord = z.infer<typeof executionSchema>;
const current = z.object({
  schemaVersion: z.literal(4),
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
    (value.schemaVersion === 1 ||
      value.schemaVersion === 2 ||
      value.schemaVersion === 3)
  ) {
    const upgraded = current.parse({
      ...value,
      schemaVersion: 4,
      ...(value.schemaVersion === 1 ? { executions: {} } : {}),
    });
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
