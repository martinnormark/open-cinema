import {
  elementSchema,
  type Element,
  type ElementType,
  type OwnerScope,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import type { ElementGetPayload } from "../generated/prisma/models";
import { assetRefFromColumns, timestamps } from "../rows";

const include = {
  references: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  },
  states: { orderBy: { createdAt: "asc" as const } },
};

type ElementRow = ElementGetPayload<{ include: typeof include }>;

export function toElement(row: ElementRow): Element {
  return elementSchema.parse({
    ...row,
    ...timestamps(row),
    references: row.references.map((ref) => ({
      ...ref,
      ...timestamps(ref),
      asset: assetRefFromColumns(ref),
      roles: Array.isArray(ref.roles) ? ref.roles : [],
    })),
    states: row.states.map((state) => ({ ...state, ...timestamps(state) })),
  });
}

export async function listElements(
  db: DatabaseContext,
  scope: OwnerScope,
  filter: { type?: ElementType } = {},
): Promise<Element[]> {
  const rows = await getClient(db).element.findMany({
    where: {
      ownerId: scope.ownerId,
      ...(filter.type ? { type: filter.type } : {}),
    },
    include,
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return rows.map(toElement);
}

export async function getElement(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<Element | null> {
  const row = await getClient(db).element.findFirst({
    where: { id, ownerId: scope.ownerId },
    include,
  });
  return row ? toElement(row) : null;
}

/** Resolves `@Handle` mentions; unknown handles are simply absent from the result. */
export async function getElementsByHandles(
  db: DatabaseContext,
  scope: OwnerScope,
  handles: readonly string[],
): Promise<Element[]> {
  if (handles.length === 0) return [];
  const rows = await getClient(db).element.findMany({
    where: { ownerId: scope.ownerId, handle: { in: [...handles] } },
    include,
  });
  return rows.map(toElement);
}

export async function getElementsByIds(
  db: DatabaseContext,
  scope: OwnerScope,
  ids: readonly string[],
): Promise<Element[]> {
  if (ids.length === 0) return [];
  const rows = await getClient(db).element.findMany({
    where: { ownerId: scope.ownerId, id: { in: [...ids] } },
    include,
  });
  return rows.map(toElement);
}
