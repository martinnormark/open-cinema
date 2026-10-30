import { env } from "./runtime";
import { applyMigrations } from "./runtime";
import { beforeAll, expect, it } from "bun:test";
import { createDatabase } from "@open-cinema/database";
import { createWorkflow, ensureUser } from "@open-cinema/database/mutations";
import {
  getWorkflow,
  listWorkflows,
  listJobs,
} from "@open-cinema/database/queries";

beforeAll(() => applyMigrations(env.DB, env.TEST_MIGRATIONS));

it("runs Prisma queries and mutations against SQLite with ownership isolation", async () => {
  const db = createDatabase(env.DB);
  const owner = { ownerId: crypto.randomUUID() };
  const stranger = { ownerId: crypto.randomUUID() };
  await ensureUser(db, owner);
  const graph = { "1": { class_type: "TestNode", inputs: { text: "test" } } };
  const workflow = await createWorkflow(db, owner, {
    name: "Test workflow",
    graph,
  });
  expect(workflow.graph).toEqual(graph);
  expect((await getWorkflow(db, owner, workflow.id))?.name).toBe(
    "Test workflow",
  );
  expect(await getWorkflow(db, stranger, workflow.id)).toBeNull();
  expect(await listWorkflows(db, stranger)).toEqual([]);
  expect(await listJobs(db, owner)).toEqual([]);
});
