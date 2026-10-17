import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  addElementReferenceInputSchema,
  createElementInputSchema,
  createElementStateInputSchema,
  updateElementInputSchema,
  updateElementReferenceInputSchema,
  type Element,
  type OwnerScope,
} from "@open-cinema/contracts";
import { createDatabase, type DatabaseContext } from "@open-cinema/database";
import { listElements, resolveAssetRef } from "@open-cinema/database/queries";
import {
  addElementReference,
  createElement,
  createElementState,
  createPendingMediaAsset,
  deleteElement,
  deleteElementState,
  markMediaAssetReady,
  removeElementReference,
  updateElement,
  updateElementReference,
} from "@open-cinema/database/mutations";
import { mediaStore } from "./media";
import { requireSameOrigin, requireSession } from "./session";

async function owner(): Promise<{ db: DatabaseContext; scope: OwnerScope }> {
  const session = await requireSession();
  return { db: createDatabase(env.DB), scope: { ownerId: session.userId } };
}
async function mutate() {
  requireSameOrigin();
  return owner();
}
function found(element: Element | null): Element {
  if (!element) throw new Error("This Element is no longer available.");
  return element;
}
/** Owner-scoped errors become messages the creator can act on. */
function failure(error: unknown): never {
  if (error instanceof Response) throw error;
  throw new Error(
    error instanceof Error && error.message
      ? error.message
      : "Your Elements could not be saved. Try again.",
  );
}

export const listMyElements = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ signedIn: boolean; elements: Element[] }> => {
    let context;
    try {
      context = await owner();
    } catch {
      return { signedIn: false, elements: [] };
    }
    return {
      signedIn: true,
      elements: await listElements(context.db, context.scope),
    };
  },
);

export const createMyElement = createServerFn({ method: "POST" })
  .validator(createElementInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return createElement(db, scope, data).catch(failure);
  });

export const updateMyElement = createServerFn({ method: "POST" })
  .validator(updateElementInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(await updateElement(db, scope, data).catch(failure));
  });

export const deleteMyElement = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return { ok: await deleteElement(db, scope, data.id) };
  });

/**
 * Uploads still keep their metadata in the Library's R2 sidecar. Register the
 * owner's verified upload as a D1 MediaAsset so the reference can point at it.
 */
async function registerUpload(
  db: DatabaseContext,
  scope: OwnerScope,
  assetId: string,
) {
  const record = await mediaStore().get(scope.ownerId, assetId);
  if (!record || record.kind !== "image") return;
  await createPendingMediaAsset(db, scope, {
    id: record.id,
    r2Key: record.r2Key,
    filename: record.filename,
    mediaType: record.mediaType,
    sizeBytes: Math.max(1, record.sizeBytes),
    ...(record.width ? { width: record.width } : {}),
    ...(record.height ? { height: record.height } : {}),
  });
  await markMediaAssetReady(db, scope, record.id, {
    sizeBytes: record.sizeBytes,
    etag: record.etag,
  });
}

export const addMyElementReference = createServerFn({ method: "POST" })
  .validator(addElementReferenceInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    if (
      data.asset.type === "media-asset" &&
      !(await resolveAssetRef(db, scope, data.asset))
    )
      await registerUpload(db, scope, data.asset.assetId).catch(() => {});
    if (
      data.asset.type === "job-output" &&
      !(await resolveAssetRef(db, scope, data.asset))
    )
      throw new Error(
        "This image is still being saved. Try again in a moment.",
      );
    return found(await addElementReference(db, scope, data).catch(failure));
  });

export const updateMyElementReference = createServerFn({ method: "POST" })
  .validator(updateElementReferenceInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(await updateElementReference(db, scope, data).catch(failure));
  });

export const removeMyElementReference = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(
      await removeElementReference(db, scope, data.id).catch(failure),
    );
  });

export const createMyElementState = createServerFn({ method: "POST" })
  .validator(createElementStateInputSchema)
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(await createElementState(db, scope, data).catch(failure));
  });

export const deleteMyElementState = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { db, scope } = await mutate();
    return found(await deleteElementState(db, scope, data.id).catch(failure));
  });
