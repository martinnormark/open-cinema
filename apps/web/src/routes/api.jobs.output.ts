import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createDatabase } from "@open-cinema/database";
import { getJobOutput } from "@open-cinema/database/queries";
import { recordPoster } from "@open-cinema/database/mutations";
import {
  posterObjectKey,
  serveObject,
  serveStoredOutput,
  storePoster,
  UploadError,
} from "@open-cinema/assets";
import type { JobOutput } from "@open-cinema/contracts";
import { requireSameOrigin, requireSession } from "@/server/session";
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

/** Positive whole numbers the browser measured while drawing the poster. */
function measured(headers: Headers, name: string) {
  const n = Number(headers.get(name));
  return Number.isSafeInteger(n) && n > 0 && n <= 24 * 3600 * 1000
    ? n
    : undefined;
}

/** Saves the poster frame the browser drew for a stored video output. */
async function putPoster(request: Request) {
  requireSameOrigin();
  const session = await requireSession();
  const params = outputParams(request);
  if (!params) return new Response("Invalid request", { status: 400 });
  const scope = { ownerId: session.userId };
  const db = createDatabase(env.DB);
  try {
    const output = await getJobOutput(db, scope, params.jobId, params.outputId);
    if (!output?.r2Key || !output.mediaType.startsWith("video/"))
      return new Response("Output not found", { status: 404 });
    const length = Number(request.headers.get("Content-Length"));
    if (!(length > 0 && length <= 2 * 1024 * 1024))
      throw new UploadError("The poster is missing or too large.", 413);
    const ref = { type: "job-output", ...params } as const;
    const stored = await storePoster(
      env.GENERATED_ASSETS,
      posterObjectKey(session.userId, ref, output.r2Key),
      session.userId,
      await request.arrayBuffer(),
      request.headers.get("Content-Type") ?? "",
    );
    await recordPoster(db, scope, ref, {
      posterKey: stored.r2Key,
      width: measured(request.headers, "X-Poster-Width"),
      height: measured(request.headers, "X-Poster-Height"),
      durationMs: measured(request.headers, "X-Poster-Duration-Ms"),
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return error instanceof UploadError
      ? Response.json({ error: error.message }, { status: error.status })
      : new Response("Storage is temporarily unavailable.", { status: 503 });
  }
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
      PUT: ({ request }) => putPoster(request),
    },
  },
});
