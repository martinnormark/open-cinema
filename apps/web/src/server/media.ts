import { createServerFn } from "@tanstack/react-start";
import { env } from "@open-cinema/runtime";
import { z } from "zod";
import { createDatabase } from "@open-cinema/database";
import { deleteMediaAsset } from "@open-cinema/database/mutations";
import { deleteUploadObjects } from "@open-cinema/assets";
import type { MediaItem } from "@/features/library/model";
import { optionalSession, requireSameOrigin, requireSession } from "./session";
import { listForOwner } from "./media-items";

/** Ready uploads and saved generated outputs, newest first. */
export const listMedia = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ signedIn: boolean; items: MediaItem[] }> => {
    const session = await optionalSession();
    if (!session) return { signedIn: false, items: [] };
    return { signedIn: true, items: await listForOwner(session.userId) };
  },
);

/** Deletes an upload's record and bytes. Generated outputs stay with their job. */
export const deleteMedia = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    requireSameOrigin();
    const session = await requireSession();
    const scope = { ownerId: session.userId };
    const removed = await deleteMediaAsset(
      createDatabase(env.DB),
      scope,
      data.id,
    );
    if (!removed) return { ok: false };
    await deleteUploadObjects(env.GENERATED_ASSETS, session.userId, data.id);
    return { ok: true };
  });
