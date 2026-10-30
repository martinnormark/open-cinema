import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { getResponse, type RequestHandler } from "msw";
import { FileAssetStore } from "@open-cinema/assets";
import type { RuntimeEnv } from "@open-cinema/runtime";
import {
  migrateDatabase,
  migrationsDirectory,
} from "@open-cinema/database/migrate";
import type { CheckpointStorage } from "@open-cinema/database/storage";
import { closeDatabases } from "@open-cinema/database";
import { JobService } from "../src/index";
import type { GenerationCoordinator } from "../src/generation-coordinator";

let directory = mkdtempSync(join(tmpdir(), "open-cinema-test-"));
const directories = new Set([directory]);
process.once("exit", () => {
  for (const path of directories)
    rmSync(path, { recursive: true, force: true });
});
export const env: RuntimeEnv & {
  TEST_MIGRATIONS: string[];
  GENERATION_COORDINATORS: { getByName(owner: string): GenerationCoordinator };
} = {
  DB: join(directory, "catalog.sqlite"),
  GENERATED_ASSETS: new FileAssetStore(join(directory, "assets")),
  COMFY_API_KEY: "integration-test-key",
  COMFY_BASE_URL: "",
  COMFY_CLOUD_API_KEY: "",
  COMFY_ROUTER_API_KEY: "",
  COMFY_CLOUD_BASE_URL: "",
  COMFY_ROUTER_BASE_URL: "",
  MEDIA_PUBLIC_ORIGIN: "",
  MEDIA_SIGNING_SECRET: "",
  MAX_ACTIVE_JOBS: "",
  AUTH_MODE: "local",
  LOCAL_MVP_ENABLED: "true",
  LOCAL_SESSION_SECRET: "test-session-secret-32-characters-long",
  BASIC_AUTH_USER: "studio",
  BASIC_AUTH_PASSWORD: "",
  APP_ORIGIN: "",
  TEST_MIGRATIONS: readdirSync(migrationsDirectory)
    .filter((n) => n.endsWith(".sql"))
    .sort(),
  GENERATION_COORDINATORS: {
    getByName(owner) {
      const coordinator = service.get(owner);
      owners.set(coordinator, owner);
      return coordinator;
    },
  },
};
let service = new JobService(directory, env);
const owners = new WeakMap<GenerationCoordinator, string>();
export async function restartJobs() {
  await service.close();
  service = new JobService(directory, env);
}
export async function reset() {
  await service.close();
  await closeDatabases();
  directory = mkdtempSync(join(tmpdir(), "open-cinema-test-"));
  directories.add(directory);
  env.DB = join(directory, "catalog.sqlite");
  env.GENERATED_ASSETS = new FileAssetStore(join(directory, "assets"));
  service = new JobService(directory, env);
}
export function applyMigrations(filename: string, names: string[]) {
  migrateDatabase(filename, names);
}
export async function runWake(coordinator: GenerationCoordinator) {
  if ((await coordinator.storage.getAlarm()) === null) return false;
  await service.wake(owners.get(coordinator)!);
  return true;
}
export function withCoordinator<T>(
  coordinator: GenerationCoordinator,
  callback: (
    coordinator: GenerationCoordinator,
    state: { storage: CheckpointStorage },
  ) => T,
) {
  return callback(coordinator, { storage: coordinator.storage });
}
export function sql(statement: string) {
  const db = new Database(env.DB);
  try {
    db.exec(statement);
  } finally {
    db.close();
  }
}
/** Use MSW's public resolver with Bun fetch: Node's socket interceptor is not a Bun API. */
export function setupNetwork() {
  let handlers: RequestHandler[] = [];
  let original: typeof fetch;
  return {
    enable() {
      original = globalThis.fetch;
      globalThis.fetch = Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
          const request = new Request(input, init);
          if (request.signal.aborted) throw request.signal.reason;
          const response = await getResponse(handlers, request);
          if (!response)
            throw new Error(
              `Unmocked network request: ${request.method} ${request.url}`,
            );
          if (response.type === "error") throw new TypeError("Network error");
          return response;
        },
        { preconnect: original.preconnect },
      );
    },
    disable() {
      globalThis.fetch = original;
    },
    use(...added: RequestHandler[]) {
      handlers.unshift(...added);
    },
    resetHandlers() {
      handlers = [];
    },
  };
}
export type Coordinator = GenerationCoordinator;

import {
  upgrades,
  type SocketConnection,
  type StatusSocket,
} from "@open-cinema/runtime/transport";
export async function subscribe(
  coordinator: GenerationCoordinator,
  owner: string,
) {
  type Data = { connection: SocketConnection; socket: StatusSocket };
  const server = Bun.serve<Data>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      const context = {
        upgraded: false,
        upgrade(connection: SocketConnection, expiresAt: number) {
          return server.upgrade(request, {
            data: { connection, socket: { expiresAt, send() {}, close() {} } },
          });
        },
      };
      return upgrades.run(context, async () => {
        const response = await coordinator.fetch(
          new Request(request.url, {
            headers: {
              Upgrade: "websocket",
              "X-Owner-Id": owner,
              "X-Session-Expires-At": String(Date.now() + 60_000),
            },
          }),
        );
        return context.upgraded ? undefined : response;
      });
    },
    websocket: {
      open(ws) {
        ws.data.socket.send = (data) => ws.send(data);
        ws.data.socket.close = (code, reason) => ws.close(code, reason);
        void ws.data.connection.open(ws.data.socket);
      },
      close(ws) {
        ws.data.connection.close(ws.data.socket);
        void server.stop(true);
      },
      message(ws) {
        ws.close(1008, "Read-only status stream");
      },
    },
  });
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}`);
  const first = new Promise<MessageEvent>((resolve) =>
    socket.addEventListener("message", resolve, { once: true }),
  );
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = reject;
  });
  return { socket, first };
}

export function assetFiles() {
  try {
    return readdirSync(join(directory, "assets"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
