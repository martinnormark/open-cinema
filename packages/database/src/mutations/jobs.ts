import { resultOutputs, type Job } from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import type { ExecutionRecord } from "../durable/schema";

/** Idempotent SQLite projection. Only strictly newer versions can replace a job row. */
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
    workflowKind: job.workflowKind,
    projectId: job.projectId,
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
      inputsSnapshot: JSON.parse(
        JSON.stringify({
          prompt: job.prompt,
          seed: job.seed,
          request: execution.command.request,
          mentions: execution.mentions,
        }),
      ),
    },
  });
  // Output IDs are immutable provider asset IDs scoped to this job. Repeated writes are safe.
  for (const output of job.outputs) {
    // Poster facts are written by recordPoster alone; an image's size only with its copy below.
    const { posterKey, width, height, durationMs, ...stored } = output;
    await client.jobOutput.upsert({
      where: { id: output.id },
      create: stored,
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
          // An image's size is read while it is copied; a video's comes with its poster.
          ...(output.mediaType.startsWith("image/") &&
          output.width &&
          output.height
            ? { width: output.width, height: output.height }
            : {}),
        },
      });
  }
  await client.generationJob.updateMany({
    where: { id: job.id, ownerId: job.ownerId, version: { lt: job.version } },
    data,
  });
  await projectRevision(db, job, execution);
}

/**
 * A selective revision shares its job's ID. It is created with the job's first
 * projection and only ever advances from pending, so replays are harmless.
 */
async function projectRevision(
  db: DatabaseContext,
  job: Job,
  execution: ExecutionRecord,
) {
  const { request, revision } = execution.command;
  if (
    !revision ||
    (request.workflowKind !== "video.background-replace" &&
      request.workflowKind !== "video.character-replace")
  )
    return;
  const source = request.inputs.source;
  const client = getClient(db);
  await client.revision.upsert({
    where: { id: job.id },
    update: {},
    create: {
      id: job.id,
      ownerId: job.ownerId,
      projectId: job.projectId,
      parentRevisionId: revision.parentRevisionId ?? null,
      sourceType: source.type,
      ...(source.type === "media-asset"
        ? { sourceAssetId: source.assetId }
        : { sourceJobId: source.jobId, sourceOutputId: source.outputId }),
      jobId: job.id,
      workflowKind: request.workflowKind,
      intent: revision.intent,
      status: "pending",
      createdAt: new Date(job.createdAt),
    },
  });
  // The first presentable result: the foreground lock when the job made one.
  const output = resultOutputs(job.outputs).find((o) => o.r2Key);
  if (job.state === "succeeded" && output)
    await client.revision.updateMany({
      where: { id: job.id, status: "pending" },
      data: {
        status: "proposed",
        resultJobId: job.id,
        resultOutputId: output.id,
      },
    });
  else if (job.state === "failed" || job.state === "cancelled")
    await client.revision.updateMany({
      where: { id: job.id, status: "pending" },
      data: { status: "failed" },
    });
}
