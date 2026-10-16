import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { storeUpload, UploadError } from "@open-cinema/assets";
import { requireSameOrigin, requireSession } from "@/server/session";
import { mediaStore, uploadToItem } from "@/server/media";
import type { UploadRecord } from "@/server/media-store";
import { MAX_VIDEO_SECONDS } from "@/features/library/model";

function dimension(value: string | null) {
  const n = Number(value);
  return value && Number.isSafeInteger(n) && n > 0 && n <= 16384 ? n : null;
}
function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Raw-body upload: the file is the request body so it streams straight into R2
 * without buffering a multipart form. Browser-measured dimensions and duration
 * travel in headers and are advisory.
 */
async function upload(request: Request) {
  requireSameOrigin();
  const session = await requireSession();
  if (!request.body) return json({ error: "Choose a file to upload." }, 400);
  const length = request.headers.get("Content-Length");
  const declaredLength =
    length !== null && Number.isSafeInteger(Number(length))
      ? Number(length)
      : null;
  const rawName = request.headers.get("X-Media-Filename") ?? "";
  let filename = "Untitled";
  try {
    filename = decodeURIComponent(rawName).trim().slice(0, 200) || filename;
  } catch {
    /* Keep the default for malformed names. */
  }
  const duration = Number(request.headers.get("X-Media-Duration"));
  const id = crypto.randomUUID();
  try {
    const stored = await storeUpload(
      env.GENERATED_ASSETS,
      session.userId,
      id,
      request.body,
      request.headers.get("Content-Type") ?? "",
      declaredLength,
    );
    const durationSeconds =
      stored.kind === "video" && Number.isFinite(duration) && duration > 0
        ? Math.round(duration * 100) / 100
        : null;
    if (durationSeconds !== null && durationSeconds > MAX_VIDEO_SECONDS) {
      await env.GENERATED_ASSETS.delete(stored.r2Key);
      return json(
        { error: `Videos can be up to ${MAX_VIDEO_SECONDS / 60} minutes.` },
        422,
      );
    }
    const record: UploadRecord = {
      id,
      ownerId: session.userId,
      kind: stored.kind,
      mediaType: stored.mediaType,
      filename,
      sizeBytes: stored.sizeBytes,
      etag: stored.etag,
      r2Key: stored.r2Key,
      posterKey: null,
      width: dimension(request.headers.get("X-Media-Width")),
      height: dimension(request.headers.get("X-Media-Height")),
      durationSeconds,
      createdAt: new Date().toISOString(),
      attachments: [],
    };
    await mediaStore().put(record);
    return json(uploadToItem(record), 201);
  } catch (error) {
    if (error instanceof UploadError)
      return json({ error: error.message }, error.status);
    return json(
      { error: "Storage is temporarily unavailable. Try again." },
      503,
    );
  }
}

export const Route = createFileRoute("/api/media/upload")({
  server: { handlers: { POST: ({ request }) => upload(request) } },
});
