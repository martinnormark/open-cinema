import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Separate processes prove that the production scheduler discovers saved work
 * without a browser connection or a test explicitly firing its wake function. */
test("resumes an accepted job in a fresh process without resubmitting its provider receipt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "cinema-restart-"));
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  let submissions = 0;
  const provider = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      if (request.method === "POST") {
        submissions++;
        return Response.json(
          { request_id: "durable-receipt" },
          { status: 202 },
        );
      }
      return Response.json({
        request_id: "durable-receipt",
        status: "IN_PROGRESS",
      });
    },
  });
  const prefix = `
    import { env, dataDirectory } from './packages/runtime/src/index.ts';
    import { migrateDatabase } from './packages/database/src/migrate.ts';
    import { JobService } from './apps/jobs/src/index.ts';
    migrateDatabase(env.DB);
    const jobs = new JobService(dataDirectory, env);
    const owner = { ownerId: 'restart-owner' };
    const coordinator = jobs.get(owner.ownerId);
  `;
  const run = async (source: string) => {
    const child = Bun.spawn([process.execPath, "--eval", prefix + source], {
      cwd: root,
      env: {
        ...process.env,
        DATA_DIR: directory,
        COMFY_API_KEY: "fixture-only",
        COMFY_API_KEY_FILE: "",
        COMFY_ROUTER_API_KEY: "",
        COMFY_ROUTER_API_KEY_FILE: "",
        COMFY_CLOUD_API_KEY: "",
        COMFY_CLOUD_API_KEY_FILE: "",
        COMFY_ROUTER_BASE_URL: `http://127.0.0.1:${provider.port}`,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, err).toBe(0);
    return JSON.parse(out.trim());
  };
  try {
    expect(
      await run(`
      console.log(JSON.stringify(await coordinator.submit(owner, { idempotencyKey: '00000000-0000-4000-8000-000000000001', prompt: 'A fox in the snow' })));
      await jobs.close();
    `),
    ).toMatchObject({ ok: true, snapshot: { jobs: [{ state: "queued" }] } });
    const watch = `
      jobs.start();
      let snapshot;
      for (let i = 0; i < 100; i++) {
        await Bun.sleep(50);
        snapshot = await coordinator.getSnapshot(owner);
        if (snapshot.jobs[0]?.state === 'running') break;
      }
      console.log(JSON.stringify(snapshot));
      await jobs.close();
    `;
    expect(await run(watch)).toMatchObject({
      jobs: [{ state: "running", providerJobId: "durable-receipt" }],
    });
    expect(submissions).toBe(1);
    expect(await run(watch)).toMatchObject({
      jobs: [{ state: "running", providerJobId: "durable-receipt" }],
    });
    expect(submissions).toBe(1);
  } finally {
    await provider.stop(true);
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);
