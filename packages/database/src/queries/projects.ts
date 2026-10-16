import {
  projectSchema,
  type OwnerScope,
  type Project,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import { timestamps } from "../rows";

export async function listProjects(
  db: DatabaseContext,
  scope: OwnerScope,
): Promise<Project[]> {
  const rows = await getClient(db).project.findMany({
    where: { ownerId: scope.ownerId },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return rows.map((row) => projectSchema.parse({ ...row, ...timestamps(row) }));
}

export async function getProject(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<Project | null> {
  const row = await getClient(db).project.findFirst({
    where: { id, ownerId: scope.ownerId },
  });
  return row ? projectSchema.parse({ ...row, ...timestamps(row) }) : null;
}
