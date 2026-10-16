import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createDatabase } from "@open-cinema/database";
import { getJobOutput } from "@open-cinema/database/queries";
import { serveStoredOutput } from "@open-cinema/assets";
import { requireSession } from "@/server/session";
import { getCoordinator } from "@/server/jobs";

async function outputResponse(request: Request) {
  const session = await requireSession();
  const query = new URL(request.url).searchParams;
  const jobId = query.get("job") ?? "";
  const outputId = query.get("output") ?? "";
  if (!jobId || !outputId || jobId.length > 100 || outputId.length > 200)
    return new Response("Invalid request", { status: 400 });
  try {
    const scope = { ownerId: session.userId };
    const projected = await getJobOutput(
      createDatabase(env.DB),
      scope,
      jobId,
      outputId,
    );
    if (projected?.r2Key)
      return await serveStoredOutput(env.GENERATED_ASSETS, projected, request);
    // The checkpoint covers a delayed D1 projection and starts legacy asset migration.
    using live = await getCoordinator(session.userId).getStoredOutput(
      scope,
      jobId,
      outputId,
    );
    return live
      ? await serveStoredOutput(env.GENERATED_ASSETS, live, request)
      : new Response("Output not found", { status: 404 });
  } catch {
    return new Response(
      "Stored output is temporarily unavailable. Try again.",
      { status: 503 },
    );
  }
}
export const Route = createFileRoute("/api/jobs/output")({
  server: {
    handlers: {
      GET: ({ request }) => outputResponse(request),
      HEAD: ({ request }) => outputResponse(request),
    },
  },
});
