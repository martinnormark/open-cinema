import "@tanstack/react-start/server-only";
import { env } from "@open-cinema/runtime";
import type { OwnerScope } from "@open-cinema/contracts";
import { createDatabase, type DatabaseContext } from "@open-cinema/database";
import { requireSameOrigin, requireSession } from "./session";

export interface OwnerContext {
  db: DatabaseContext;
  scope: OwnerScope;
}

/** The signed-in creator's scope, for reads. */
export async function ownerScope(): Promise<OwnerScope> {
  const session = await requireSession();
  return { ownerId: session.userId };
}

/** As `ownerScope`, for writes: also refuses cross-origin requests. */
export async function mutationScope(): Promise<OwnerScope> {
  requireSameOrigin();
  return ownerScope();
}

export async function owner(): Promise<OwnerContext> {
  return { db: createDatabase(env.DB), scope: await ownerScope() };
}

export async function mutate(): Promise<OwnerContext> {
  return { db: createDatabase(env.DB), scope: await mutationScope() };
}

/** Driver and query-engine messages describe the database, not the creator's input. */
const INTERNAL_MESSAGE = /SQLITE_|libsql|prisma/i;

/**
 * Owner-scoped errors become messages the creator can act on. Plain `Error`s
 * our own mutations throw deliberately keep their message; anything else (a
 * database or runtime error) is logged and replaced with `fallback`.
 */
export function saveFailure(error: unknown, fallback: string): never {
  if (error instanceof Response) throw error;
  const deliberate =
    error instanceof Error &&
    Object.getPrototypeOf(error) === Error.prototype &&
    !!error.message &&
    !INTERNAL_MESSAGE.test(error.message);
  if (!deliberate) console.error(error);
  throw new Error(deliberate ? error.message : fallback);
}
