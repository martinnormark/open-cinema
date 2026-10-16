import { env } from "cloudflare:workers";
import { applyD1Migrations, reset } from "cloudflare:test";
import { expect, it } from "vitest";
import { createDatabase } from "@open-cinema/database";
import { getJob } from "@open-cinema/database/queries";

it("preserves legacy history and output ownership while allowing seedless Router jobs", async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 2));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO User (id) VALUES ('migration-owner')"),
    env.DB.prepare(
      `INSERT INTO GenerationJob (id,ownerId,state,version,idempotencyKey,requestHash,workflowSnapshot,inputsSnapshot,updatedAt,seed) VALUES ('legacy-job','migration-owner','succeeded',2,'legacy-key','hash','{}','{}',CURRENT_TIMESTAMP,42)`,
    ),
    env.DB.prepare(
      "INSERT INTO JobOutput (id,jobId,providerAssetId,mediaType) VALUES ('legacy-output','legacy-job','asset-1','image/png')",
    ),
  ]);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
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
  await env.DB.prepare(
    "UPDATE GenerationJob SET seed = NULL WHERE id = 'legacy-job'",
  ).run();
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
