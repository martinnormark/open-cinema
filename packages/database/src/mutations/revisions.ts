import {
  setRevisionStatusInputSchema,
  type AssetRef,
  type OwnerScope,
  type Revision,
  type SetRevisionStatusInput,
  type WorkflowKind,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import { toRevision } from "../queries/revisions";
import { resolveAssetRef } from "../queries/media";
import { ensureUser } from "./users";

/** Records the intended change before generation so the original stays linked. */
export async function createRevision(
  db: DatabaseContext,
  scope: OwnerScope,
  input: {
    source: AssetRef;
    workflowKind: WorkflowKind;
    intent: string;
    jobId?: string;
    projectId?: string;
    parentRevisionId?: string;
  },
): Promise<Revision> {
  if (!(await resolveAssetRef(db, scope, input.source)))
    throw new Error("The source media is not available");
  await ensureUser(db, scope);
  const source =
    input.source.type === "media-asset"
      ? { sourceAssetId: input.source.assetId }
      : {
          sourceJobId: input.source.jobId,
          sourceOutputId: input.source.outputId,
        };
  const row = await getClient(db).revision.create({
    data: {
      id: crypto.randomUUID(),
      ownerId: scope.ownerId,
      projectId: input.projectId ?? null,
      parentRevisionId: input.parentRevisionId ?? null,
      sourceType: input.source.type,
      ...source,
      jobId: input.jobId ?? null,
      workflowKind: input.workflowKind,
      intent: input.intent,
      status: "pending",
    },
  });
  return toRevision(row);
}

/** Idempotent: a pending revision becomes proposed (with its result) or failed. */
export async function settleRevisionForJob(
  db: DatabaseContext,
  scope: OwnerScope,
  jobId: string,
  outcome: { result: { jobId: string; outputId: string } } | { failed: true },
): Promise<void> {
  await getClient(db).revision.updateMany({
    where: { jobId, ownerId: scope.ownerId, status: "pending" },
    data:
      "failed" in outcome
        ? { status: "failed" }
        : {
            status: "proposed",
            resultJobId: outcome.result.jobId,
            resultOutputId: outcome.result.outputId,
          },
  });
}

/** Keeping or rejecting is the creator's decision and never touches the source. */
export async function setRevisionStatus(
  db: DatabaseContext,
  scope: OwnerScope,
  input: SetRevisionStatusInput,
): Promise<Revision | null> {
  const { id, status, resultOutputId } =
    setRevisionStatusInputSchema.parse(input);
  const client = getClient(db);
  let variant: { resultOutputId: string } | null = null;
  if (resultOutputId) {
    // Only another saved output of the revision's own result job qualifies.
    const revision = await client.revision.findFirst({
      where: { id, ownerId: scope.ownerId },
    });
    const output =
      revision?.resultJobId &&
      (await client.jobOutput.findFirst({
        where: {
          id: resultOutputId,
          jobId: revision.resultJobId,
          r2Key: { not: null },
        },
      }));
    if (!output) return null;
    variant = { resultOutputId: output.id };
  }
  const { count } = await client.revision.updateMany({
    where: {
      id,
      ownerId: scope.ownerId,
      status: { in: ["proposed", "kept", "rejected"] },
    },
    data: { status, ...variant },
  });
  if (count === 0) return null;
  return toRevision(await client.revision.findUniqueOrThrow({ where: { id } }));
}
