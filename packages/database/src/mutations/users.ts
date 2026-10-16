import { getClient, type DatabaseContext } from "../client";
import type { OwnerScope } from "@open-cinema/contracts";

/** Call only after an identity has been verified by the application's auth layer. */
export async function ensureUser(
  db: DatabaseContext,
  scope: OwnerScope,
): Promise<void> {
  await getClient(db).user.upsert({
    where: { id: scope.ownerId },
    create: { id: scope.ownerId },
    update: {},
  });
}
