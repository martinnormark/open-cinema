import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "./generated/prisma/client";

const clients = new WeakMap<DatabaseContext, PrismaClient>();
const contexts = new Map<string, DatabaseContext>();
const contextBrand: unique symbol = Symbol("DatabaseContext");
export interface DatabaseContext {
  readonly [contextBrand]: true;
}

/** One connection pool per local catalog, shared by requests and background jobs. */
export function createDatabase(filename: string): DatabaseContext {
  const existing = contexts.get(filename);
  if (existing) return existing;
  const context = Object.freeze({ [contextBrand]: true as const });
  clients.set(
    context,
    new PrismaClient({
      adapter: new PrismaLibSql({ url: `file:${filename}` }),
    }),
  );
  contexts.set(filename, context);
  return context;
}
export function getClient(context: DatabaseContext): PrismaClient {
  const client = clients.get(context);
  if (!client) throw new Error("Invalid database context");
  return client;
}

export async function closeDatabases() {
  for (const context of contexts.values())
    await clients.get(context)?.$disconnect();
  contexts.clear();
}
