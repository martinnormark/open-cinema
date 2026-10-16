import type { OwnerScope, Workflow } from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import { getWorkflow } from "../queries/workflows";
import { z } from "zod";

export async function createWorkflow(
  db: DatabaseContext,
  scope: OwnerScope,
  input: { name: string; graph: Record<string, unknown> },
): Promise<Workflow> {
  const graph = z.record(z.string(), z.json()).parse(input.graph);
  const row = await getClient(db).workflow.create({
    data: {
      id: crypto.randomUUID(),
      ownerId: scope.ownerId,
      name: input.name,
      graph,
    },
  });
  const workflow = await getWorkflow(db, scope, row.id);
  if (!workflow) throw new Error("Created workflow is unavailable");
  return workflow;
}
