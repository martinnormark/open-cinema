import {
  addElementReferenceInputSchema,
  createElementInputSchema,
  createElementStateInputSchema,
  toElementHandle,
  updateElementInputSchema,
  updateElementReferenceInputSchema,
  type AddElementReferenceInput,
  type CreateElementInput,
  type CreateElementStateInput,
  type Element,
  type OwnerScope,
  type UpdateElementInput,
  type UpdateElementReferenceInput,
} from "@open-cinema/contracts";
import { getClient, type DatabaseContext } from "../client";
import { getElement } from "../queries/elements";
import { resolveAssetRef } from "../queries/media";
import { assetRefColumns } from "../rows";
import { ensureUser } from "./users";

async function uniqueHandle(
  db: DatabaseContext,
  scope: OwnerScope,
  base: string,
  exceptId?: string,
): Promise<string> {
  const taken = new Set(
    (
      await getClient(db).element.findMany({
        where: {
          ownerId: scope.ownerId,
          handle: { startsWith: base },
          ...(exceptId ? { id: { not: exceptId } } : {}),
        },
        select: { handle: true },
      })
    ).map((row) => row.handle),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base.slice(0, 38)}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function createElement(
  db: DatabaseContext,
  scope: OwnerScope,
  input: CreateElementInput,
): Promise<Element> {
  const data = createElementInputSchema.parse(input);
  await ensureUser(db, scope);
  const handle = await uniqueHandle(
    db,
    scope,
    data.handle ?? toElementHandle(data.name),
  );
  const row = await getClient(db).element.create({
    data: {
      id: crypto.randomUUID(),
      ownerId: scope.ownerId,
      projectId: data.projectId ?? null,
      type: data.type,
      name: data.name,
      handle,
      description: data.description ?? "",
    },
  });
  const element = await getElement(db, scope, row.id);
  if (!element) throw new Error("Created element is unavailable");
  return element;
}

export async function updateElement(
  db: DatabaseContext,
  scope: OwnerScope,
  input: UpdateElementInput,
): Promise<Element | null> {
  const { id, ...changes } = updateElementInputSchema.parse(input);
  const current = await getElement(db, scope, id);
  if (!current) return null;
  const handle =
    changes.handle && changes.handle !== current.handle
      ? await uniqueHandle(db, scope, changes.handle, id)
      : undefined;
  const identityChanged =
    changes.description !== undefined &&
    changes.description !== current.description;
  await getClient(db).element.updateMany({
    where: { id, ownerId: scope.ownerId },
    data: {
      ...(changes.name !== undefined ? { name: changes.name } : {}),
      ...(handle ? { handle } : {}),
      ...(changes.description !== undefined
        ? { description: changes.description }
        : {}),
      ...(identityChanged ? { version: { increment: 1 } } : {}),
    },
  });
  return getElement(db, scope, id);
}

export async function deleteElement(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<boolean> {
  const { count } = await getClient(db).element.deleteMany({
    where: { id, ownerId: scope.ownerId },
  });
  return count > 0;
}

/** Rejects refs the owner cannot use and states that belong to another Element. */
export async function addElementReference(
  db: DatabaseContext,
  scope: OwnerScope,
  input: AddElementReferenceInput,
): Promise<Element | null> {
  const data = addElementReferenceInputSchema.parse(input);
  const element = await getElement(db, scope, data.elementId);
  if (!element) return null;
  if (data.stateId && !element.states.some((s) => s.id === data.stateId))
    throw new Error("That state belongs to a different Element");
  const stored = await resolveAssetRef(db, scope, data.asset);
  if (!stored) throw new Error("That media is not available to reference");
  if (!stored.mediaType.startsWith("image/"))
    throw new Error("Reference sheets hold images");
  const client = getClient(db);
  await client.elementReference.create({
    data: {
      id: crypto.randomUUID(),
      elementId: element.id,
      stateId: data.stateId ?? null,
      ...assetRefColumns(data.asset),
      status: data.status,
      view: data.view ?? null,
      roles: data.roles ?? [],
      note: data.note ?? "",
      sortOrder: element.references.length,
    },
  });
  await client.element.update({
    where: { id: element.id },
    data:
      data.status === "approved"
        ? { version: { increment: 1 } }
        : { updatedAt: new Date() },
  });
  return getElement(db, scope, element.id);
}

export async function updateElementReference(
  db: DatabaseContext,
  scope: OwnerScope,
  input: UpdateElementReferenceInput,
): Promise<Element | null> {
  const { id, ...changes } = updateElementReferenceInputSchema.parse(input);
  const client = getClient(db);
  const ref = await client.elementReference.findFirst({
    where: { id, element: { ownerId: scope.ownerId } },
  });
  if (!ref) return null;
  await client.elementReference.update({
    where: { id },
    data: {
      ...(changes.status !== undefined ? { status: changes.status } : {}),
      ...(changes.view !== undefined ? { view: changes.view } : {}),
      ...(changes.roles !== undefined ? { roles: changes.roles } : {}),
      ...(changes.note !== undefined ? { note: changes.note } : {}),
      ...(changes.sortOrder !== undefined
        ? { sortOrder: changes.sortOrder }
        : {}),
    },
  });
  // Approval changes what conditions future generations, so it versions the Element.
  const approvalChanged =
    changes.status !== undefined &&
    (changes.status === "approved") !== (ref.status === "approved");
  await client.element.update({
    where: { id: ref.elementId },
    data: approvalChanged
      ? { version: { increment: 1 } }
      : { updatedAt: new Date() },
  });
  return getElement(db, scope, ref.elementId);
}

export async function removeElementReference(
  db: DatabaseContext,
  scope: OwnerScope,
  id: string,
): Promise<Element | null> {
  const client = getClient(db);
  const ref = await client.elementReference.findFirst({
    where: { id, element: { ownerId: scope.ownerId } },
  });
  if (!ref) return null;
  await client.elementReference.delete({ where: { id } });
  await client.element.update({
    where: { id: ref.elementId },
    data:
      ref.status === "approved"
        ? { version: { increment: 1 } }
        : { updatedAt: new Date() },
  });
  return getElement(db, scope, ref.elementId);
}

export async function createElementState(
  db: DatabaseContext,
  scope: OwnerScope,
  input: CreateElementStateInput,
): Promise<Element | null> {
  const data = createElementStateInputSchema.parse(input);
  const element = await getElement(db, scope, data.elementId);
  if (!element) return null;
  if (element.states.some((s) => s.name === data.name))
    throw new Error("This Element already has a state with that name");
  await getClient(db).elementState.create({
    data: {
      id: crypto.randomUUID(),
      elementId: element.id,
      name: data.name,
      description: data.description ?? "",
    },
  });
  return getElement(db, scope, element.id);
}

export async function deleteElementState(
  db: DatabaseContext,
  scope: OwnerScope,
  stateId: string,
): Promise<Element | null> {
  const client = getClient(db);
  const state = await client.elementState.findFirst({
    where: { id: stateId, element: { ownerId: scope.ownerId } },
  });
  if (!state) return null;
  await client.elementState.delete({ where: { id: stateId } });
  return getElement(db, scope, state.elementId);
}
