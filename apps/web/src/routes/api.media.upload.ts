import { createFileRoute } from "@tanstack/react-router";
import { env, waitUntil } from "cloudflare:workers";
import { storeUpload, UploadError, uploadObjectKey } from "@open-cinema/assets";
import { mediaKindFor } from "@open-cinema/contracts";
import { createDatabase } from "@open-cinema/database";
import {
  createPendingMediaAsset,
  markMediaAssetFailed,
  markMediaAssetReady,
} from "@open-cinema/database/mutations";
import { requireSameOrigin, requireSession } from "@/server/session";
import { assetToItem } from "@/server/media-items";
import { getCoordinator } from "@/server/jobs";
import { MAX_VIDEO_SECONDS } from "@/features/library/model";

function dimension(value: string | null) {
  const n = Number(value);
  return value && Number.isSafeInteger(n) && n > 0 && n <= 16384
    ? n
    : undefined;
}
function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Raw-body upload: the file is the request body, so it streams straight into
 * R2 without buffering a multipart form. Browser-measured dimensions,
 * duration, frame rate, pixel aspect and sound travel in headers and are
 * advisory; size and type are verified.
 */
async function upload(request: Request) {
  requireSameOrigin();
  const session = await requireSession();
  const scope = { ownerId: session.userId };
  const mediaType = (request.headers.get("Content-Type") ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase();
  const length = Number(request.headers.get("Content-Length"));
  if (!request.body || !Number.isSafeInteger(length) || length <= 0)
    return json({ error: "Choose a file to upload." }, 411);
  if (!mediaKindFor(mediaType))
    return json(
      {
        error:
          "Upload a PNG, JPEG, or WebP image, or an MP4, WebM, or MOV video.",
      },
      415,
    );
  let filename = "Untitled";
  try {
    filename =
      decodeURIComponent(request.headers.get("X-Media-Filename") ?? "")
        .trim()
        .slice(0, 255) || filename;
  } catch {
    /* Keep the default for malformed names. */
  }
  const seconds = Number(request.headers.get("X-Media-Duration"));
  const durationMs =
    mediaType.startsWith("video/") && Number.isFinite(seconds) && seconds > 0
      ? Math.round(seconds * 1000)
      : undefined;
  if (durationMs !== undefined && durationMs > MAX_VIDEO_SECONDS * 1000)
    return json(
      { error: `Videos can be up to ${MAX_VIDEO_SECONDS / 60} minutes.` },
      422,
    );
  const video = mediaType.startsWith("video/");
  const fps = Number(request.headers.get("X-Media-Fps"));
  const aspect = Number(request.headers.get("X-Media-Pixel-Aspect"));
  const audio = request.headers.get("X-Media-Audio");
  const facts = {
    ...(video && fps > 0 && fps <= 240 ? { fps } : {}),
    ...(video && aspect >= 0.25 && aspect <= 4 ? { pixelAspect: aspect } : {}),
    ...(video && (audio === "1" || audio === "0")
      ? { hasAudio: audio === "1" }
      : {}),
  };
  const id = crypto.randomUUID();
  const db = createDatabase(env.DB);
  let pending = false;
  try {
    const width = dimension(request.headers.get("X-Media-Width"));
    const height = dimension(request.headers.get("X-Media-Height"));
    await createPendingMediaAsset(db, scope, {
      id,
      r2Key: uploadObjectKey(session.userId, id, "original"),
      filename,
      mediaType,
      sizeBytes: length,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...facts,
    });
    pending = true;
    const stored = await storeUpload(
      env.GENERATED_ASSETS,
      session.userId,
      id,
      request.body,
      mediaType,
      length,
    );
    const asset = await markMediaAssetReady(db, scope, id, stored);
    if (asset?.status !== "ready") throw new Error("Upload was not recorded");
    // The poster is made after the response; a thumbnail requested meanwhile
    // waits for the same render (see /api/media/<id>?variant=poster).
    if (video)
      waitUntil(
        getCoordinator(session.userId)
          .ensurePoster(scope, { type: "media-asset", assetId: id })
          .catch(() => null),
      );
    return json(assetToItem(asset), 201);
  } catch (error) {
    if (pending) await markMediaAssetFailed(db, scope, id).catch(() => {});
    if (error instanceof UploadError)
      return json({ error: error.message }, error.status);
    if (error instanceof Error && /larger than/.test(error.message))
      return json({ error: error.message }, 413);
    return json(
      { error: "Storage is temporarily unavailable. Try again." },
      503,
    );
  }
}

export const Route = createFileRoute("/api/media/upload")({
  server: { handlers: { POST: ({ request }) => upload(request) } },
});
