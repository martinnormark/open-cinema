import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import {
  serveObject,
  storePoster,
  UploadError,
  uploadObjectKey,
  verifyMediaPath,
} from "@open-cinema/assets";
import { createDatabase } from "@open-cinema/database";
import { recordPoster } from "@open-cinema/database/mutations";
import { getMediaAsset } from "@open-cinema/database/queries";
import { getCoordinator } from "@/server/jobs";
import { requireSameOrigin, requireSession } from "@/server/session";

async function owner(request: Request, id: string) {
  const query = new URL(request.url).searchParams;
  const signed = query.get("owner");
  if (signed === null) return (await requireSession()).userId;
  // Signed links cover the original only; posters stay session-scoped.
  if (query.get("variant")) return null;
  const valid = await verifyMediaPath(
    env.LOCAL_SESSION_SECRET,
    `${signed}/${id}/original`,
    query.get("expires"),
    query.get("signature"),
  );
  return valid ? signed : null;
}

async function stream(request: Request, id: string) {
  const ownerId = await owner(request, id);
  if (!ownerId) return new Response("Link expired", { status: 403 });
  try {
    const asset = await getMediaAsset(createDatabase(env.DB), { ownerId }, id);
    if (asset?.status !== "ready")
      return new Response("Media not found", { status: 404 });
    if (new URL(request.url).searchParams.get("variant") === "poster") {
      if (asset.kind === "video") {
        // Made at upload; an older clip gets its poster on first view.
        const made = asset.posterKey
          ? { posterKey: asset.posterKey }
          : await getCoordinator(ownerId).ensurePoster(
              { ownerId },
              { type: "media-asset", assetId: id },
            );
        return made
          ? await serveObject(env.GENERATED_ASSETS, made.posterKey, request)
          : new Response("Poster not available", { status: 404 });
      }
      const poster = await serveObject(
        env.GENERATED_ASSETS,
        asset.posterKey ?? uploadObjectKey(ownerId, id, "poster"),
        request,
      );
      // Small images have no separate poster; they are their own thumbnail.
      if (poster.status !== 404) return poster;
    }
    const response = await serveObject(
      env.GENERATED_ASSETS,
      asset.r2Key,
      request,
    );
    // Upload bytes never change under an ID; a poster fallback may be replaced.
    if (response.ok && !new URL(request.url).searchParams.has("variant"))
      response.headers.set(
        "Cache-Control",
        "private, max-age=86400, immutable",
      );
    return response;
  } catch {
    return new Response("Media is temporarily unavailable. Try again.", {
      status: 503,
    });
  }
}

/** Browser-rendered thumbnail for an existing image upload. */
async function putPoster(request: Request, id: string) {
  requireSameOrigin();
  const session = await requireSession();
  const asset = await getMediaAsset(
    createDatabase(env.DB),
    { ownerId: session.userId },
    id,
  );
  if (asset?.status !== "ready")
    return new Response("Media not found", { status: 404 });
  try {
    const length = Number(request.headers.get("Content-Length"));
    if (!(length > 0 && length <= 2 * 1024 * 1024))
      throw new UploadError("The poster is missing or too large.", 413);
    // Videos get their poster from ffmpeg (see media/server.mjs), not the browser.
    if (asset.kind === "video")
      throw new UploadError("Video posters are made by the studio.", 415);
    const stored = await storePoster(
      env.GENERATED_ASSETS,
      session.userId,
      id,
      await request.arrayBuffer(),
      request.headers.get("Content-Type") ?? "",
    );
    await recordPoster(
      createDatabase(env.DB),
      { ownerId: session.userId },
      { type: "media-asset", assetId: id },
      { posterKey: stored.r2Key },
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return error instanceof UploadError
      ? Response.json({ error: error.message }, { status: error.status })
      : new Response("Storage is temporarily unavailable.", { status: 503 });
  }
}

export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => stream(request, params.id),
      HEAD: ({ request, params }) => stream(request, params.id),
      PUT: ({ request, params }) => putPoster(request, params.id),
    },
  },
});
