import { readObjectBase64, signMediaPath } from "@open-cinema/assets";
import {
  assetRefKey,
  type AssetRef,
  type JobOutput,
  type OwnerScope,
} from "@open-cinema/contracts";
import {
  routerBaseUrl,
  uploadToComfyStorage,
  type ResolvedAsset,
} from "@open-cinema/comfy";
import { createDatabase } from "@open-cinema/database";
import { resolveAssetRef } from "@open-cinema/database/queries";
import { renderCloudMedia } from "./media";

/** Optional deployment settings for provider-fetchable upload links. */
interface MediaLinkEnv {
  /** Public https origin of the web Worker, e.g. https://studio.example.com. */
  MEDIA_PUBLIC_ORIGIN?: string;
  /** The web Worker's media signing secret (LOCAL_SESSION_SECRET there). */
  MEDIA_SIGNING_SECRET?: string;
}

/** The request referenced media the owner cannot use (deleted, foreign, or unsaved). */
export class AssetUnavailableError extends Error {}

/**
 * A clip whose pixels are not square (e.g. a 639:640 sample aspect). Kling
 * answers those with a bare provider_error, so they are conformed first. The
 * browser converts them at upload; this covers clips it could not convert.
 */
export function needsSquarePixels(pixelAspect: number | null | undefined) {
  return pixelAspect != null && Math.abs(pixelAspect - 1) > 0.001;
}

/**
 * Comfy storage links this job already created, by asset key. A request
 * rebuilt after a lost receipt must reuse them: a new link changes the request,
 * and Router answers a changed request under the same idempotency key with 409.
 */
export interface UploadCache {
  get(key: string): string | undefined;
  set(key: string, url: string): void;
}

/** Where a ref's bytes are: this job's checkpoint first, then D1. */
export async function storedAsset(
  db: ReturnType<typeof createDatabase>,
  scope: OwnerScope,
  ref: AssetRef,
  ownOutputs: readonly JobOutput[] = [],
) {
  if (ref.type === "job-output") {
    const own = ownOutputs.find(
      (o) => o.jobId === ref.jobId && o.id === ref.outputId && o.r2Key,
    );
    if (own)
      return {
        r2Key: own.r2Key!,
        mediaType: own.mediaType,
        sizeBytes: own.sizeBytes,
        // Generated outputs have square pixels.
        pixelAspect: null,
        posterKey: own.posterKey ?? null,
      };
  }
  return resolveAssetRef(db, scope, ref);
}

/**
 * Resolves refs at submission time. Links expire at a fixed time derived from the
 * job so a rebuilt request after a lost receipt is byte-identical.
 */
export function createAssetResolver(
  env: JobsEnv & MediaLinkEnv,
  scope: OwnerScope,
  linkExpiresAt: number,
  /** This job's saved outputs, read from the checkpoint before D1 has them. */
  ownOutputs: readonly JobOutput[] = [],
  uploads?: UploadCache,
) {
  const db = createDatabase(env.DB);
  const cache = new Map<string, Promise<ResolvedAsset>>();
  async function resolve(ref: AssetRef): Promise<ResolvedAsset> {
    const stored = await storedAsset(db, scope, ref, ownOutputs);
    if (!stored) throw new AssetUnavailableError(assetRefKey(ref));
    let publicUrl: string | null = null;
    const origin = env.MEDIA_PUBLIC_ORIGIN?.replace(/\/+$/, "");
    const square =
      stored.mediaType.startsWith("video/") &&
      needsSquarePixels(stored.pixelAspect);
    if (
      !square &&
      ref.type === "media-asset" &&
      origin?.startsWith("https://") &&
      env.MEDIA_SIGNING_SECRET
    ) {
      const { expires, signature } = await signMediaPath(
        env.MEDIA_SIGNING_SECRET,
        `${scope.ownerId}/${ref.assetId}/original`,
        linkExpiresAt,
      );
      const query = new URLSearchParams({
        owner: scope.ownerId,
        expires,
        signature,
      });
      publicUrl = `${origin}/api/media/${encodeURIComponent(ref.assetId)}?${query}`;
    }
    let uploaded: Promise<string> | null = null;
    const fetchableUrl = () => {
      if (publicUrl) return Promise.resolve(publicUrl);
      const cached = uploads?.get(assetRefKey(ref));
      if (cached) return Promise.resolve(cached);
      uploaded ??= (async () => {
        const signal = AbortSignal.timeout(10 * 60_000);
        let body: ReadableStream<Uint8Array>;
        let size: number;
        let contentType = stored.mediaType;
        if (square) {
          // Resampled to its display size with square pixels as a Comfy Cloud
          // graph (packages/comfy/src/workflows/media-graphs.ts).
          ({ body, size } = await renderCloudMedia(
            env,
            "square",
            [
              {
                name: "source",
                r2Key: stored.r2Key,
                mediaType: stored.mediaType,
              },
            ],
            signal,
            stored.pixelAspect,
          ));
          contentType = "video/mp4";
        } else {
          const object = await env.GENERATED_ASSETS.get(stored.r2Key);
          if (!object) throw new AssetUnavailableError(assetRefKey(ref));
          // Signed upload URLs need a known length; R2 knows it exactly.
          const { readable, writable } = new FixedLengthStream(object.size);
          void object.body.pipeTo(writable);
          body = readable;
          size = object.size;
        }
        const extension = contentType.split("/")[1]?.split(";")[0];
        const url = await uploadToComfyStorage({
          apiKey: env.COMFY_API_KEY ?? "",
          baseUrl: routerBaseUrl(env.COMFY_BASE_URL),
          fileName: `${crypto.randomUUID()}${extension ? `.${extension}` : ""}`,
          contentType,
          sizeBytes: size,
          body,
          signal,
        });
        uploads?.set(assetRefKey(ref), url);
        return url;
      })();
      return uploaded;
    };
    return {
      ref,
      fetchableUrl,
      mediaType: stored.mediaType,
      sizeBytes: stored.sizeBytes,
      publicUrl,
      base64: async () =>
        (await readObjectBase64(env.GENERATED_ASSETS, stored.r2Key)).base64,
      dataUri: async () => {
        const inline = await readObjectBase64(
          env.GENERATED_ASSETS,
          stored.r2Key,
        );
        return `data:${inline.mediaType};base64,${inline.base64}`;
      },
    };
  }
  return (ref: AssetRef) => {
    const key = assetRefKey(ref);
    let pending = cache.get(key);
    if (!pending) cache.set(key, (pending = resolve(ref)));
    return pending;
  };
}
