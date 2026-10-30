import { createFileRoute } from "@tanstack/react-router";
import { env } from "@open-cinema/runtime";
import { createDatabase } from "@open-cinema/database";
import { getJobOutput } from "@open-cinema/database/queries";
import {
  posterObjectKey,
  serveObject,
  serveStoredOutput,
} from "@open-cinema/assets";
import type { JobOutput } from "@open-cinema/contracts";
import { putPoster } from "@/server/media-items";
import { requireSession } from "@/server/session";
import { getCoordinator } from "@/server/jobs";

/**
 * A video output's poster still. The browser makes it on first view after this
 * 404 (features/library/poster-repair.ts). An image is its own poster.
 */
async function poster(request: Request, projected: JobOutput | null) {
  if (projected?.mediaType.startsWith("image/"))
    return serveStoredOutput(env.GENERATED_ASSETS, projected, request);
  return projected?.posterKey
    ? serveObject(env.GENERATED_ASSETS, projected.posterKey, request)
    : new Response("Poster not available", { status: 404 });
}

function outputParams(request: Request) {
  const query = new URL(request.url).searchParams;
  const jobId = query.get("job") ?? "";
  const outputId = query.get("output") ?? "";
  return jobId && outputId && jobId.length <= 100 && outputId.length <= 200
    ? { jobId, outputId }
    : null;
}

async function outputResponse(request: Request) {
  const session = await requireSession();
  const params = outputParams(request);
  if (!params) return new Response("Invalid request", { status: 400 });
  const { jobId, outputId } = params;
  const query = new URL(request.url).searchParams;
  try {
    const scope = { ownerId: session.userId };
    const projected = await getJobOutput(
      createDatabase(env.DB),
      scope,
      jobId,
      outputId,
    );
    if (query.get("variant") === "poster")
      return await poster(request, projected);
    if (projected?.r2Key)
      return await serveStoredOutput(env.GENERATED_ASSETS, projected, request);
    // The checkpoint covers a delayed SQLite projection and starts legacy asset migration.
    const live = await getCoordinator(session.userId).getStoredOutput(
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
      // The poster frame the browser drew for a stored video output.
      PUT: ({ request }) =>
        putPoster(request, async (db, scope) => {
          const params = outputParams(request);
          if (!params) return new Response("Invalid request", { status: 400 });
          const output = await getJobOutput(
            db,
            scope,
            params.jobId,
            params.outputId,
          );
          if (!output?.r2Key || !output.mediaType.startsWith("video/"))
            return new Response("Output not found", { status: 404 });
          const ref = { type: "job-output", ...params } as const;
          return {
            ref,
            key: posterObjectKey(scope.ownerId, ref, output.r2Key),
            measured: true,
          };
        }),
    },
  },
});
