import type { OwnerScope } from "@open-cinema/contracts";
import {
  COORDINATOR_SCHEMA_VERSION,
  coordinatorRecordSchema,
  type CoordinatorRecord,
} from "../durable/schema";

export async function initializeCoordinator(
  storage: DurableObjectStorage,
  scope: OwnerScope,
): Promise<CoordinatorRecord | null> {
  const result = await storage.transaction(async (transaction) => {
    const existing = await transaction.get<unknown>("coordinator");
    if (existing !== undefined) {
      const record = coordinatorRecordSchema.parse(existing);
      if (record.ownerId !== scope.ownerId) return record;
      if (
        (existing as { schemaVersion?: number }).schemaVersion !==
        record.schemaVersion
      ) {
        await transaction.put("coordinator", record);
        await transaction.setAlarm(Date.now() + 100);
      }
      return record;
    }
    const record: CoordinatorRecord = {
      schemaVersion: COORDINATOR_SCHEMA_VERSION,
      ownerId: scope.ownerId,
      sequence: 0,
      jobs: [],
      executions: {},
    };
    await transaction.put("coordinator", record);
    return record;
  });
  if (result.ownerId !== scope.ownerId) return null;
  return result;
}

export async function scheduleCoordinatorWake(
  storage: DurableObjectStorage,
  timestamp: number,
): Promise<void> {
  await storage.transaction(async (transaction) => {
    const current = await transaction.getAlarm();
    if (current === null || timestamp < current)
      await transaction.setAlarm(timestamp);
  });
}

/** Short local transaction: checkpoint and recovery alarm commit together. No external I/O in update. */
export async function mutateCoordinator(
  storage: DurableObjectStorage,
  scope: OwnerScope,
  update: (record: CoordinatorRecord) => void,
  wakeAt = Date.now() + 100,
): Promise<CoordinatorRecord | null> {
  await initializeCoordinator(storage, scope);
  return storage.transaction(async (transaction) => {
    const record = coordinatorRecordSchema.parse(
      await transaction.get("coordinator"),
    );
    if (record.ownerId !== scope.ownerId) return null;
    update(record);
    await transaction.put("coordinator", coordinatorRecordSchema.parse(record));
    const alarm = await transaction.getAlarm();
    if (alarm === null || wakeAt < alarm) await transaction.setAlarm(wakeAt);
    return record;
  });
}

/** Recompute under the same transaction as the alarm write so concurrent commands cannot lose a wake. */
export async function replaceCoordinatorWake(
  storage: DurableObjectStorage,
  socketExpiry: number | null,
) {
  await storage.transaction(async (transaction) => {
    const record = coordinatorRecordSchema.parse(
      await transaction.get("coordinator"),
    );
    let next = socketExpiry ?? Infinity;
    const active = record.jobs.find(
      (j) =>
        ["submitting", "running", "persisting", "cancelling"].includes(
          j.state,
        ) ||
        (j.state === "queued" && j.providerJobId),
    );
    if (active)
      next = Math.min(next, record.executions[active.id]!.nextAttemptAt);
    else if (
      !record.jobs.some((j) => j.state === "needs_attention") &&
      record.jobs.some((j) => j.state === "queued")
    )
      next = Math.min(next, Date.now() + 100);
    if (Object.values(record.executions).some((e) => e.pendingProjection))
      next = Math.min(next, Date.now() + 5000);
    if (Number.isFinite(next))
      await transaction.setAlarm(Math.max(Date.now() + 100, next));
    else await transaction.deleteAlarm();
  });
}
