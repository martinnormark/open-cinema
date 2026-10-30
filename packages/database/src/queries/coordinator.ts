import type { CheckpointStorage } from "../storage";
import {
  coordinatorRecordSchema,
  type CoordinatorRecord,
} from "../durable/schema";

export async function readCoordinator(
  storage: CheckpointStorage,
): Promise<CoordinatorRecord | null> {
  const record = await storage.get<unknown>("coordinator");
  return record === undefined ? null : coordinatorRecordSchema.parse(record);
}
