import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "./generated/prisma/client";

// Opaque outside this package: consumers receive a context, never Prisma delegates.
const clients = new WeakMap<DatabaseContext, PrismaClient>();
const contextBrand: unique symbol = Symbol("DatabaseContext");
export interface DatabaseContext {
  readonly [contextBrand]: true;
}

export function createDatabase(binding: D1Database): DatabaseContext {
  const context: DatabaseContext = Object.freeze({
    [contextBrand]: true as const,
  });
  clients.set(context, new PrismaClient({ adapter: new PrismaD1(binding) }));
  return context;
}

export function getClient(context: DatabaseContext): PrismaClient {
  const client = clients.get(context);
  if (!client) throw new Error("Invalid database context");
  return client;
}
