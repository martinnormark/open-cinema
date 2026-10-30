import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { env, dataDirectory } from "@open-cinema/runtime";
import { authorizeHttp, publicRequest } from "@open-cinema/runtime/auth";
import {
  upgrades,
  type SocketConnection,
  type StatusSocket,
  type UpgradeContext,
} from "@open-cinema/runtime/transport";
import { closeDatabases } from "@open-cinema/database";
import { migrateDatabase } from "@open-cinema/database/migrate";
import { jobService } from "@open-cinema/jobs";

type SocketData = { connection: SocketConnection; socket: StatusSocket };
const directory = fileURLToPath(new URL(".", import.meta.url));
const clientDirectory = resolve(directory, "dist/client");
migrateDatabase(env.DB);
await env.GENERATED_ASSETS.cleanupStaging();
// Load the built handler only after local persistence is ready.
const entry = resolve(directory, "dist/server/server.js");
const { default: handler } = await import(entry);
const jobs = jobService();
jobs.start();
const server = Bun.serve<SocketData>({
  hostname: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  maxRequestBodySize: 512 * 1024 * 1024,
  idleTimeout: 60,
  async fetch(original, server) {
    const request = publicRequest(original);
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && ["GET", "HEAD"].includes(request.method))
      return Response.json({ ok: true });
    const denied = authorizeHttp(request);
    if (denied) return denied;
    if (["GET", "HEAD"].includes(request.method)) {
      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        return new Response("Bad path", { status: 400 });
      }
      const path = resolve(clientDirectory, `.${pathname}`);
      if (path.startsWith(clientDirectory + sep)) {
        const file = Bun.file(path);
        if (await file.exists())
          return new Response(request.method === "HEAD" ? null : file, {
            headers: {
              "Content-Type": file.type,
              "Content-Length": String(file.size),
              "Cache-Control": url.pathname.startsWith("/assets/")
                ? "public, max-age=31536000, immutable"
                : "no-cache",
            },
          });
      }
    }
    const context: UpgradeContext = {
      upgraded: false,
      upgrade(connection, expiresAt) {
        const socket: StatusSocket = {
          expiresAt,
          send: () => {},
          close: () => {},
        };
        return server.upgrade(original, { data: { connection, socket } });
      },
    };
    return upgrades.run(context, async () => {
      const response = await handler.fetch(request);
      return context.upgraded ? undefined : response;
    });
  },
  websocket: {
    open(ws) {
      const socket = ws.data.socket;
      socket.send = (data) => ws.send(data);
      socket.close = (code, reason) => ws.close(code, reason);
      void ws.data.connection
        .open(socket)
        .catch(() => ws.close(1011, "Reconnect to synchronize"));
    },
    message(ws) {
      ws.close(1008, "Read-only status stream");
    },
    close(ws) {
      ws.data.connection.close(ws.data.socket);
    },
    maxPayloadLength: 1024,
    backpressureLimit: 1024 * 1024,
    closeOnBackpressureLimit: true,
  },
  error(error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  },
});
console.log(`Open Cinema listening on ${server.url} (data: ${dataDirectory})`);
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    // Persisted watchdogs resume interrupted work if the container stop deadline wins.
    void (async () => {
      jobs.disconnect();
      await server.stop(false);
      await jobs.close();
      await closeDatabases();
      process.exit(0);
    })();
  });
