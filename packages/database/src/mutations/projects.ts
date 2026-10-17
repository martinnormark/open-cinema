import {
  createProjectInputSchema,
  projectSchema,
  updateProjectInputSchema,
  type CreateProjectInput,
  type OwnerScope,
  type Project,
  type UpdateProjectInput,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import { timestamps } from "../rows";
import { ensureUser } from "./users";

export async function createProject(
  db: DatabaseContext,
  scope: OwnerScope,
  input: CreateProjectInput,
): Promise<Project> {
  const data = createProjectInputSchema.parse(input);
  await ensureUser(db, scope);
  const row = await getClient(db).project.create({
    data: {
      id: crypto.randomUUID(),
      ownerId: scope.ownerId,
      name: data.name,
      direction: data.direction ?? "",
      look: data.look ?? {},
    },
  });
  return projectSchema.parse({ ...row, ...timestamps(row) });
}

export async function updateProject(
  db: DatabaseContext,
  scope: OwnerScope,
  input: UpdateProjectInput,
): Promise<Project | null> {
  const { id, ...changes } = updateProjectInputSchema.parse(input);
  const client = getClient(db);
  const { count } = await client.project.updateMany({
    where: { id, ownerId: scope.ownerId },
    data: {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(changes.direction !== undefined
        ? { direction: changes.direction }
        : {}),
      ...(changes.look !== undefined ? { look: changes.look } : {}),
    },
  });
  if (count === 0) return null;
  const row = await client.project.findUniqueOrThrow({ where: { id } });
  return projectSchema.parse({ ...row, ...timestamps(row) });
}
