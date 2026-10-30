import { createFileRoute } from "@tanstack/react-router";
import { env } from "@open-cinema/runtime";
import {
  serveObject,
  uploadObjectKey,
  verifyMediaPath,
} from "@open-cinema/assets";
import { createDatabase } from "@open-cinema/database";
import { getMediaAsset } from "@open-cinema/database/queries";
import { putPoster } from "@/server/media-items";
import { requireSession } from "@/server/session";

async function owner(request: Request, id: string) {
  const query = new URL(request.url).searchParams;
  const signed = query.get("owner");
  if (signed === null) return (await requireSession()).userId;
  // Signed links cover the original only; posters stay session-scoped.
  if (query.get("variant")) return null;
  const valid = await verifyMediaPath(
    env.MEDIA_SIGNING_SECRET,
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
      // The browser makes a video's poster at upload, or for an older clip on
      // first view after this 404 (features/library/poster-repair.ts).
      if (asset.kind === "video")
        return asset.posterKey
          ? await serveObject(env.GENERATED_ASSETS, asset.posterKey, request)
          : new Response("Poster not available", { status: 404 });
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

export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: ({ request, params }) => stream(request, params.id),
      HEAD: ({ request, params }) => stream(request, params.id),
      // Browser-rendered thumbnail for an upload, or a video's poster frame.
      PUT: ({ request, params }) =>
        putPoster(request, async (db, scope) => {
          const asset = await getMediaAsset(db, scope, params.id);
          if (asset?.status !== "ready")
            return new Response("Media not found", { status: 404 });
          return {
            ref: { type: "media-asset", assetId: params.id },
            key: uploadObjectKey(scope.ownerId, params.id, "poster"),
          };
        }),
    },
  },
});
