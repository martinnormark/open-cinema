import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { createDatabase } from "@open-cinema/database";
import { createWorkflow, ensureUser } from "@open-cinema/database/mutations";
import {
  getWorkflow,
  listWorkflows,
  listJobs,
} from "@open-cinema/database/queries";

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

beforeAll(() => applyD1Migrations(env.DB, env.TEST_MIGRATIONS));

it("runs Prisma queries and mutations against D1 with ownership isolation", async () => {
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
