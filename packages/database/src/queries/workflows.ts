import {
  workflowSchema,
  type OwnerScope,
  type Workflow,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";

export async function getWorkflow(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<Workflow | null> {
  const row = await getClient(db).workflow.findFirst({
    where: { id, ownerId: scope.ownerId },
  });
  return row
    ? workflowSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })
    : null;
}

export async function listWorkflows(
  db: DatabaseContext,
  scope: OwnerScope,
): Promise<Workflow[]> {
  const rows = await getClient(db).workflow.findMany({
    where: { ownerId: scope.ownerId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((row) =>
    workflowSchema.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
}
