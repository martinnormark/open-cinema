import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import { WebSocketServer } from "ws";
import { env } from "@open-cinema/runtime";
import { authorizeHttp, publicRequest } from "@open-cinema/runtime/auth";
import {
  upgrades,
  type StatusSocket,
  type UpgradeContext,
} from "@open-cinema/runtime/transport";
import { migrateDatabase } from "@open-cinema/database/migrate";
import { jobService } from "@open-cinema/jobs";

/** Vite serves development pages; the same coordinator and storage serve jobs. */
export function localServer(): Plugin {
  const resolve = createRequire(
    new URL("./package.json", import.meta.url),
  ).resolve;
  return {
    name: "open-cinema-local-server",
    apply: "serve",
    enforce: "pre",
    resolveId(id) {
      if (
        this.environment.name !== "client" &&
        /^@open-cinema\/(runtime|jobs|database|assets|comfy)(\/|$)/.test(id)
      )
        return { id: pathToFileURL(resolve(id)).href, external: true };
    },
    configureServer(server) {
      migrateDatabase(env.DB);
      const jobs = jobService();
      jobs.start();
      const sockets = new WebSocketServer({ noServer: true });
      server.httpServer?.on("upgrade", async (incoming, socket, head) => {
        if (incoming.url?.split("?")[0] !== "/api/jobs/stream") return;
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers))
          if (value)
            headers.set(
              key,
              Array.isArray(value) ? value.join(", ") : String(value),
            );
        const request = publicRequest(
          new Request(`http://${incoming.headers.host}${incoming.url}`, {
            headers,
          }),
        );
        try {
          const denied = authorizeHttp(request);
          if (denied) {
            socket.end(
              `HTTP/1.1 ${denied.status} Unauthorized\r\nConnection: close\r\n\r\n`,
            );
            return;
          }
          const context: UpgradeContext = {
            upgraded: false,
            upgrade(connection, expiresAt) {
              sockets.handleUpgrade(incoming, socket, head, (ws) => {
                const client: StatusSocket = {
                  expiresAt,
                  send: (data) => ws.send(data),
                  close: (code, reason) => ws.close(code, reason),
                };
                ws.on("message", () =>
                  ws.close(1008, "Read-only status stream"),
                );
                ws.on("close", () => connection.close(client));
                void connection.open(client).catch(() => ws.close(1011));
              });
              return true;
            },
          };
          // Vite's SSR runner keeps Start's request context and route auth intact.
          const environment = server.environments.ssr;
          if (!environment || !("runner" in environment))
            throw new Error("SSR runner unavailable");
          const runner = environment.runner as {
            import(id: string): Promise<{
              default: { fetch(request: Request): Promise<Response> };
            }>;
          };
          const entry = await runner.import(
            "@tanstack/react-start/server-entry",
          );
          const response = await upgrades.run(context, () =>
            entry.default.fetch(request),
          );
          if (!context.upgraded)
            socket.end(
              `HTTP/1.1 ${response.status} Rejected\r\nConnection: close\r\n\r\n`,
            );
        } catch (error) {
          console.error(error);
          socket.destroy();
        }
      });
      server.middlewares.use((req, res, next) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers))
          if (value)
            headers.set(
              name,
              Array.isArray(value) ? value.join(", ") : String(value),
            );
        const denied = authorizeHttp(
          publicRequest(
            new Request(`http://${req.headers.host}${req.url}`, { headers }),
          ),
        );
        if (!denied) {
          next();
          return;
        }
        res.statusCode = denied.status;
        denied.headers.forEach((value, key) => res.setHeader(key, value));
        void denied.text().then((body) => res.end(body));
      });
      // Vite restarts its HTTP server during config edits. Keep the shared
      // job service alive; its unref timer does not keep a closed dev server running.
      server.httpServer?.on("close", () => {
        sockets.close();
      });
    },
  };
}
