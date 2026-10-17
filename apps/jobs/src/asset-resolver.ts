import { readObjectBase64, signMediaPath } from "@open-cinema/assets";
import {
  assetRefKey,
  type AssetRef,
  type OwnerScope,
} from "@open-cinema/contracts";
import type { ResolvedAsset } from "@open-cinema/comfy";
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
    return {
      ref,
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
