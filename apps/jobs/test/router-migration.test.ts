import { sql } from "./runtime";
import { env } from "./runtime";
import { applyMigrations, reset } from "./runtime";
import { expect, it } from "bun:test";
import { createDatabase } from "@open-cinema/database";
import { getJob } from "@open-cinema/database/queries";

it("preserves legacy history and output ownership while allowing seedless Router jobs", async () => {
  await reset();
  await applyMigrations(env.DB, env.TEST_MIGRATIONS.slice(0, 2));
  sql(`INSERT INTO User (id) VALUES ('migration-owner');
    INSERT INTO GenerationJob (id,ownerId,state,version,idempotencyKey,requestHash,workflowSnapshot,inputsSnapshot,updatedAt,seed) VALUES ('legacy-job','migration-owner','succeeded',2,'legacy-key','hash','{}','{}',CURRENT_TIMESTAMP,42);
    INSERT INTO JobOutput (id,jobId,providerAssetId,mediaType) VALUES ('legacy-output','legacy-job','asset-1','image/png');`);
  await applyMigrations(env.DB, env.TEST_MIGRATIONS);
  expect(
    await getJob(
      createDatabase(env.DB),
      { ownerId: "migration-owner" },
      "legacy-job",
    ),
  ).toMatchObject({
    seed: 42,
    outputs: [{ id: "legacy-output", providerAssetId: "asset-1" }],
  });
  sql("UPDATE GenerationJob SET seed = NULL WHERE id = 'legacy-job'");
  expect(
    (
      await getJob(
        createDatabase(env.DB),
        { ownerId: "migration-owner" },
        "legacy-job",
      )
    )?.seed,
  ).toBeNull();
  expect(
    await getJob(createDatabase(env.DB), { ownerId: "stranger" }, "legacy-job"),
  ).toBeNull();
});
