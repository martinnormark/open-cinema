import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/server/session";
import { getCoordinator } from "@/server/jobs";

export const Route = createFileRoute("/api/jobs/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
          return new Response("WebSocket upgrade required", { status: 426 });
        if (request.headers.get("Origin") !== new URL(request.url).origin)
          return new Response("Forbidden", { status: 403 });
        const session = await requireSession();
        const coordinator = getCoordinator(session.userId);
        const headers = new Headers({
          Upgrade: "websocket",
          "X-Owner-Id": session.userId,
          "X-Session-Expires-At": String(session.expiresAt),
        });
        return coordinator.fetch(new Request(request.url, { headers }));
      },
    },
  },
});
