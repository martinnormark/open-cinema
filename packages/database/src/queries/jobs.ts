import {
  jobOutputSchema,
  jobSchema,
  type Job,
  type OwnerScope,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";

export async function listJobs(
  db: DatabaseContext,
  scope: OwnerScope,
): Promise<Job[]> {
  const rows = await getClient(db).generationJob.findMany({
    where: { ownerId: scope.ownerId },
    include: { outputs: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) =>
    jobSchema.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
}

export async function getJob(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<Job | null> {
  const row = await getClient(db).generationJob.findFirst({
    where: { id, ownerId: scope.ownerId },
    include: { outputs: true },
  });
  return row
    ? jobSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })
    : null;
}

/** Asset lookup always joins through the owning job; storage keys are not authorization. */
export async function getJobOutput(
  db: DatabaseContext,
  scope: OwnerScope,
  jobId: string,
  outputId: string,
) {
  const output = await getClient(db).jobOutput.findFirst({
    where: { id: outputId, jobId, job: { ownerId: scope.ownerId } },
  });
  return output ? jobOutputSchema.parse(output) : null;
}
