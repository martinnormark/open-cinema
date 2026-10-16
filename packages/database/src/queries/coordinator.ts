import {
  coordinatorRecordSchema,
  type CoordinatorRecord,
} from "../durable/schema";

export async function readCoordinator(
  storage: DurableObjectStorage,
): Promise<CoordinatorRecord | null> {
  const record = await storage.get<unknown>("coordinator");
  return record === undefined ? null : coordinatorRecordSchema.parse(record);
}
