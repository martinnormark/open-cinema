import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import {
  serveObject,
  storePoster,
  UploadError,
  verifyMediaPath,
} from "@open-cinema/assets";
import { requireSameOrigin, requireSession } from "@/server/session";
import { mediaStore } from "@/server/media";

async function owner(request: Request, id: string, variant: string) {
  const query = new URL(request.url).searchParams;
  const signed = query.get("owner");
  if (signed !== null) {
    const valid = await verifyMediaPath(
      env.LOCAL_SESSION_SECRET,
      `${signed}/${id}/${variant}`,
      query.get("expires"),
      query.get("signature"),
    );
    return valid ? signed : null;
  }
  return (await requireSession()).userId;
}

async function stream(request: Request, id: string) {
  const variant =
    new URL(request.url).searchParams.get("variant") === "poster"
      ? "poster"
      : "original";
  const ownerId = await owner(request, id, variant);
  if (!ownerId) return new Response("Link expired", { status: 403 });
  try {
    const record = await mediaStore().get(ownerId, id);
    const key = variant === "poster" ? record?.posterKey : record?.r2Key;
    if (!key) return new Response("Media not found", { status: 404 });
    const response = await serveObject(env.GENERATED_ASSETS, key, request);
    // Uploads are immutable; posters may be added later, so revalidate those.
    if (response.ok && variant === "original")
      response.headers.set("Cache-Control", "private, max-age=3600");
    return response;
  } catch {
    return new Response("Media is temporarily unavailable. Try again.", {
      status: 503,
    });
  }
}

/** Browser-rendered thumbnail or poster frame for an existing upload. */
async function putPoster(request: Request, id: string) {
  requireSameOrigin();
  const session = await requireSession();
  const store = mediaStore();
  const record = await store.get(session.userId, id);
  if (!record) return new Response("Media not found", { status: 404 });
  try {
    const length = Number(request.headers.get("Content-Length"));
    if (!(length > 0 && length <= 2 * 1024 * 1024))
      throw new UploadError("The poster is missing or too large.", 413);
    const stored = await storePoster(
      env.GENERATED_ASSETS,
      session.userId,
      id,
      await request.arrayBuffer(),
      request.headers.get("Content-Type") ?? "",
    );
    await store.put({ ...record, posterKey: stored.r2Key });
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
