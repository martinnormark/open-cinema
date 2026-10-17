import { readObjectBase64, signMediaPath } from "@open-cinema/assets";
import {
  assetRefKey,
  type AssetRef,
  type OwnerScope,
} from "@open-cinema/contracts";
import {
  routerBaseUrl,
  uploadToComfyStorage,
  type ResolvedAsset,
} from "@open-cinema/comfy";
import { createDatabase } from "@open-cinema/database";
import { resolveAssetRef } from "@open-cinema/database/queries";

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
 * Resolves refs at submission time. Links expire at a fixed time derived from the
 * job so a rebuilt request after a lost receipt is byte-identical.
 */
export function createAssetResolver(
  env: JobsEnv & MediaLinkEnv,
  scope: OwnerScope,
  linkExpiresAt: number,
) {
  const db = createDatabase(env.DB);
  const cache = new Map<string, Promise<ResolvedAsset>>();
  async function resolve(ref: AssetRef): Promise<ResolvedAsset> {
    const stored = await resolveAssetRef(db, scope, ref);
    if (!stored) throw new AssetUnavailableError(assetRefKey(ref));
    let publicUrl: string | null = null;
    const origin = env.MEDIA_PUBLIC_ORIGIN?.replace(/\/+$/, "");
    if (
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
      uploaded ??= (async () => {
        const object = await env.GENERATED_ASSETS.get(stored.r2Key);
        if (!object) throw new AssetUnavailableError(assetRefKey(ref));
        // Signed upload URLs need a known length; R2 knows it exactly.
        const { readable, writable } = new FixedLengthStream(object.size);
        void object.body.pipeTo(writable);
        const extension = stored.mediaType.split("/")[1]?.split(";")[0];
        return uploadToComfyStorage({
          apiKey: env.COMFY_API_KEY ?? "",
          baseUrl: routerBaseUrl(env.COMFY_BASE_URL),
          fileName: `${crypto.randomUUID()}${extension ? `.${extension}` : ""}`,
          contentType: stored.mediaType,
          sizeBytes: object.size,
          body: readable,
          signal: AbortSignal.timeout(10 * 60_000),
        });
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
