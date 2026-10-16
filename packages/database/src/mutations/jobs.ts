import type { Job } from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import type { ExecutionRecord } from "../durable/schema";

/** Idempotent D1 projection. Only strictly newer versions can replace a job row. */
export async function applyJobSnapshot(
  db: DatabaseContext,
  job: Job,
  execution: ExecutionRecord,
): Promise<void> {
  const client = getClient(db);
  await client.user.upsert({
    where: { id: job.ownerId },
    create: { id: job.ownerId },
    update: {},
  });
  const data = {
    state: job.state,
    version: job.version,
    providerJobId: job.providerJobId,
    prompt: job.prompt,
    model: job.model,
    seed: job.seed,
    progress: job.progress,
    error: job.error,
    updatedAt: new Date(job.updatedAt),
  };
  await client.generationJob.upsert({
    where: { id: job.id },
    update: {},
    create: {
      ...data,
      id: job.id,
      ownerId: job.ownerId,
      createdAt: new Date(job.createdAt),
      idempotencyKey: execution.command.idempotencyKey,
      requestHash: execution.requestHash,
      workflowSnapshot: JSON.parse(JSON.stringify(execution.workflow)),
      inputsSnapshot: { prompt: job.prompt, seed: job.seed },
    },
  });
  // Output IDs are immutable provider asset IDs scoped to this job. Repeated writes are safe.
  for (const output of job.outputs) {
    await client.jobOutput.upsert({
      where: { id: output.id },
      create: output,
      update: {},
    });
    // Storage references only advance from absent to present. A delayed pre-copy
    // projection must never erase a saved asset or overwrite immutable metadata.
    if (output.r2Key)
      await client.jobOutput.updateMany({
        where: { id: output.id, jobId: job.id, r2Key: null },
        data: {
          r2Key: output.r2Key,
          sizeBytes: output.sizeBytes,
          etag: output.etag,
          mediaType: output.mediaType,
        },
      });
  }
  await client.generationJob.updateMany({
    where: { id: job.id, ownerId: job.ownerId, version: { lt: job.version } },
    data,
  });
}
