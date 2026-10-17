import { env } from "cloudflare:workers";
import {
  applyD1Migrations,
  abortAllDurableObjects,
  runDurableObjectAlarm,
  runInDurableObject,
  reset,
} from "cloudflare:test";
import { beforeEach, afterEach, beforeAll, afterAll, expect, it } from "vitest";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { createDatabase } from "@open-cinema/database";
import { getJob, getJobOutput } from "@open-cinema/database/queries";
import { applyJobSnapshot } from "@open-cinema/database/mutations";
import {
  COORDINATOR_SCHEMA_VERSION,
  readCoordinator,
  mutateCoordinator,
} from "@open-cinema/database/durable";
import {
  jobEventSchema,
  jobOutputSchema,
  getOrbState,
  type CommandResult,
} from "@open-cinema/contracts";

import { archiveOutput, serveStoredOutput } from "@open-cinema/assets";

const network = setupNetwork();
beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(async () => {
  network.use(
    http.all("https://api.comfy.org/*", () =>
      HttpResponse.json(
        {
          error: { code: "test_unhandled", message: "Unhandled test request" },
        },
        { status: 503 },
      ),
    ),
  );
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
afterEach(async () => {
  await reset();
  network.resetHandlers();
});
const command = () => ({
  idempotencyKey: crypto.randomUUID(),
  prompt: "A red fox in fresh snow",
});
function fixture() {
  const ownerId = crypto.randomUUID();
  return {
    scope: { ownerId },
    stub: env.GENERATION_COORDINATORS.getByName(ownerId),
  };
}
function accepted(result: CommandResult & Partial<Disposable>) {
  try {
    if (!result.ok) throw new Error(result.error);
    return structuredClone(result.snapshot.jobs[0]!);
  } finally {
    result[Symbol.dispose]?.();
  }
}
const providerId = "provider-1";
const base = "https://api.comfy.org/v2/models/bfl/flux-3-image/requests";
const result = {
  id: "bfl-task",
  status: "Ready",
  result: {
    sample:
      "https://storage.googleapis.com/test-assets/fox.png?signature=fresh",
  },
};
function receipt() {
  return HttpResponse.json({ request_id: providerId }, { status: 202 });
}
function watch(status: string, error_type?: string) {
  network.use(
    http.get(`${base}/${providerId}/status`, () =>
      HttpResponse.json({ request_id: providerId, status, error_type }),
    ),
  );
}
const assetBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
function finish() {
  watch("COMPLETED");
  network.use(
    http.get(
      "https://storage.googleapis.com/test-assets/fox.png",
      () =>
        new HttpResponse(assetBytes, {
          headers: {
            "Content-Type": "image/png",
            "Content-Length": String(assetBytes.length),
          },
        }),
    ),
  );
  network.use(
    http.get(`${base}/${providerId}`, () => HttpResponse.json(result)),
  );
}
async function due(
  stub: ReturnType<typeof fixture>["stub"],
  scope: ReturnType<typeof fixture>["scope"],
) {
  await runInDurableObject(stub, async (_, state) => {
    await mutateCoordinator(state.storage, scope, (record) => {
      for (const entry of Object.values(record.executions))
        entry.nextAttemptAt = 0;
    });
  });
  await runDurableObjectAlarm(stub);
}

it("deduplicates concurrent commands, rejects changed input and foreign owners, and cancels queued work without submitting", async () => {
  let { scope, stub } = fixture();
  const input = command();
  const results = await Promise.all([
    stub.submit(scope, input),
    stub.submit(scope, input),
  ]);
  const job = accepted(results[0]!);
  expect(accepted(results[1]!).id).toBe(job.id);
  expect((await stub.getSnapshot(scope))?.jobs).toHaveLength(1);
  expect(
    await stub.submit(scope, { ...input, prompt: "A different prompt" }),
  ).toMatchObject({ ok: false });
  expect(await stub.cancel({ ownerId: "stranger" }, job.id)).toMatchObject({
    ok: false,
  });
  expect(accepted(await stub.cancel(scope, job.id)).state).toBe("cancelled");
  await due(stub, scope);
  expect((await getJob(createDatabase(env.DB), scope, job.id))?.state).toBe(
    "cancelled",
  );
  expect(
    await getJob(createDatabase(env.DB), { ownerId: "stranger" }, job.id),
  ).toBeNull();
});

it("rehydrates a Router receipt after restart and delivers an owned image through WebSocket and D1", async () => {
  let { scope, stub } = fixture();
  let submissions = 0;
  network.use(
    http.post(base, async ({ request }) => {
      submissions++;
      expect(await request.json()).toEqual({
        prompt: command().prompt,
        aspect_ratio: "1:1",
        resolution: "1k",
        grounding: false,
      });
      expect(request.headers.get("Idempotency-Key")).toBeTruthy();
      expect(request.headers.get("Authorization")).toBe(
        "Bearer integration-test-key",
      );
      return receipt();
    }),
  );
  const job = accepted(await stub.submit(scope, command()));
  await due(stub, scope);
  const old = await runInDurableObject(stub, (_, state) =>
    readCoordinator(state.storage),
  );
  expect(old?.jobs[0]?.providerJobId).toBe(providerId);
  expect(old?.jobs[0]?.seed).toBeNull();
  await abortAllDurableObjects();
  stub = env.GENERATION_COORDINATORS.getByName(scope.ownerId);
  const response = await stub.fetch("https://jobs.test/stream", {
    headers: {
      Upgrade: "websocket",
      "X-Owner-Id": scope.ownerId,
      "X-Session-Expires-At": String(Date.now() + 60000),
    },
  });
  const socket = response.webSocket!;
  socket.accept();
  const success = new Promise<void>((resolve) =>
    socket.addEventListener("message", (event) => {
      const data = jobEventSchema.parse(JSON.parse(String(event.data)));
      if (data.type === "snapshot" && data.jobs[0]?.state === "succeeded")
        resolve();
    }),
  );
  finish();
  await due(stub, scope);
  const saving = await stub.getSnapshot(scope);
  expect(saving?.jobs[0]?.state).toBe("persisting");
  expect(getOrbState(saving!.jobs)).toBe("thinking");
  await due(stub, scope);
  await success;
  socket.close();
  expect(submissions).toBe(1);
  const outputId = `${job.id}:sample`;
  expect(
    await stub.getStoredOutput({ ownerId: "stranger" }, job.id, outputId),
  ).toBeNull();
  expect(
    await stub.getStoredOutput(scope, job.id, "unowned-output"),
  ).toBeNull();
  using reference = await stub.getStoredOutput(scope, job.id, outputId);
  const output = jobOutputSchema.parse(reference);
  expect(output.r2Key).toBeTruthy();
  expect(output.sizeBytes).toBe(assetBytes.length);
  // Source expiry cannot affect a completed asset: no provider request belongs in delivery.
  network.use(
    http.all(
      "https://api.comfy.org/*",
      () => new HttpResponse(null, { status: 410 }),
    ),
    http.get(
      "https://storage.googleapis.com/test-assets/fox.png",
      () => new HttpResponse(null, { status: 410 }),
    ),
  );
  const assetResponse = await serveStoredOutput(
    env.GENERATED_ASSETS,
    output,
    new Request("https://studio.test/api/jobs/output"),
  );
  expect(assetResponse.status).toBe(200);
  expect(new Uint8Array(await assetResponse.arrayBuffer())).toEqual(assetBytes);
  expect(
    await getJobOutput(
      createDatabase(env.DB),
      { ownerId: "stranger" },
      job.id,
      outputId,
    ),
  ).toBeNull();
  expect(await getJob(createDatabase(env.DB), scope, job.id)).toMatchObject({
    state: "succeeded",
    progress: 1,
    seed: null,
    outputs: [{ providerAssetId: "sample", mediaType: "image/png" }],
  });
  await applyJobSnapshot(
    createDatabase(env.DB),
    old!.jobs[0]!,
    old!.executions[job.id]!,
  );
  expect((await getJob(createDatabase(env.DB), scope, job.id))?.state).toBe(
    "succeeded",
  );
});

it("recovers a lost acceptance after restart with identical input and idempotency key, then honors cancellation", async () => {
  let { scope, stub } = fixture();
  const requests: { key: string | null; body: unknown }[] = [];
  network.use(
    http.post(base, async ({ request }) => {
      requests.push({
        key: request.headers.get("Idempotency-Key"),
        body: await request.json(),
      });
      return requests.length === 1 ? HttpResponse.error() : receipt();
    }),
  );
  const job = accepted(await stub.submit(scope, command()));
  await due(stub, scope);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe("submitting");
  await abortAllDurableObjects();
  stub = env.GENERATION_COORDINATORS.getByName(scope.ownerId);
  accepted(await stub.cancel(scope, job.id));
  await due(stub, scope);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect((await stub.getSnapshot(scope))?.jobs[0]).toMatchObject({
    providerJobId: providerId,
    state: "cancelling",
  });
  let cancelled = false;
  watch("IN_PROGRESS");
  network.use(
    http.put(`${base}/${providerId}/cancel`, () => {
      cancelled = true;
      watch("COMPLETED", "cancelled");
      return new HttpResponse(null, { status: 204 });
    }),
  );
  await due(stub, scope);
  expect(cancelled).toBe(true);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe("cancelled");
});

it("bounds ambiguous submission recovery and pauses admission without minting another key", async () => {
  const { scope, stub } = fixture();
  const keys = new Set<string | null>();
  let submissions = 0;
  network.use(
    http.post(base, ({ request }) => {
      submissions++;
      keys.add(request.headers.get("Idempotency-Key"));
      return HttpResponse.json(
        { error_type: "service_unavailable" },
        { status: 503 },
      );
    }),
  );
  accepted(await stub.submit(scope, command()));
  for (let i = 0; i < 9; i++) await due(stub, scope);
  expect(submissions).toBe(8);
  expect(keys.size).toBe(1);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe(
    "needs_attention",
  );
  expect(await stub.submit(scope, command())).toMatchObject({ ok: false });
});

it("keeps a legacy interrupted Cloud submission suspended when upgrading v2 checkpoints", async () => {
  let { scope, stub } = fixture();
  accepted(await stub.submit(scope, command()));
  await runInDurableObject(stub, async (_, state) => {
    const record = await readCoordinator(state.storage);
    const old = JSON.parse(JSON.stringify(record));
    old.schemaVersion = 2;
    old.jobs[0].state = "submitting";
    delete old.executions[old.jobs[0].id].provider;
    await state.storage.put("coordinator", old);
  });
  await abortAllDurableObjects();
  stub = env.GENERATION_COORDINATORS.getByName(scope.ownerId);
  let submissions = 0;
  network.use(
    http.post(base, () => {
      submissions++;
      return receipt();
    }),
  );
  await due(stub, scope);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe(
    "needs_attention",
  );
  expect(submissions).toBe(0);
  expect(
    (
      await runInDurableObject(stub, (_, state) =>
        readCoordinator(state.storage),
      )
    )?.schemaVersion,
  ).toBe(COORDINATOR_SCHEMA_VERSION);
});

it("lets provider completion win a cancellation race", async () => {
  const { scope, stub } = fixture();
  network.use(http.post(base, receipt));
  const job = accepted(await stub.submit(scope, command()));
  await due(stub, scope);
  accepted(await stub.cancel(scope, job.id));
  finish();
  let cancels = 0;
  network.use(
    http.put(`${base}/${providerId}/cancel`, () => {
      cancels++;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  await due(stub, scope);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe("persisting");
  await due(stub, scope);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe("succeeded");
  expect(cancels).toBe(0);
});

it("retries a failed history projection after restart without losing accepted work", async () => {
  let { scope, stub } = fixture();
  const job = accepted(await stub.submit(scope, command()));
  accepted(await stub.cancel(scope, job.id));
  await env.DB.exec('ALTER TABLE "GenerationJob" RENAME TO "UnavailableJob"');
  await due(stub, scope);
  await abortAllDurableObjects();
  stub = env.GENERATION_COORDINATORS.getByName(scope.ownerId);
  expect(
    (
      await runInDurableObject(stub, (_, state) =>
        readCoordinator(state.storage),
      )
    )?.executions[job.id]?.pendingProjection,
  ).toBe(true);
  await env.DB.exec('ALTER TABLE "UnavailableJob" RENAME TO "GenerationJob"');
  await due(stub, scope);
  expect((await getJob(createDatabase(env.DB), scope, job.id))?.state).toBe(
    "cancelled",
  );
  expect(
    (
      await runInDurableObject(stub, (_, state) =>
        readCoordinator(state.storage),
      )
    )?.executions[job.id]?.pendingProjection,
  ).toBe(false);
});

it("reports Router queue access rejection without retrying or claiming a Cloud free-tier restriction", async () => {
  const { scope, stub } = fixture();
  network.use(
    http.post(base, () =>
      HttpResponse.json({ error_type: "not_enabled" }, { status: 403 }),
    ),
  );
  const job = accepted(await stub.submit(scope, command()));
  await due(stub, scope);
  expect((await stub.getSnapshot(scope))?.jobs[0]).toMatchObject({
    state: "failed",
    error: expect.stringContaining("Queued Router requests"),
  });
  expect((await getJob(createDatabase(env.DB), scope, job.id))?.state).toBe(
    "failed",
  );
});

it.each(["status", "result"])(
  "treats a completed Router %s carrying an error as failure, not success",
  async (where) => {
    const { scope, stub } = fixture();
    network.use(http.post(base, receipt));
    accepted(await stub.submit(scope, command()));
    await due(stub, scope);
    watch(
      "COMPLETED",
      where === "status" ? "content_policy_violation" : undefined,
    );
    network.use(
      http.get(`${base}/${providerId}`, () =>
        HttpResponse.json({
          error_type: "content_policy_violation",
          status: "COMPLETED",
        }),
      ),
    );
    await due(stub, scope);
    expect((await stub.getSnapshot(scope))?.jobs[0]).toMatchObject({
      state: "failed",
      outputs: [],
      error: expect.stringContaining("content policy"),
    });
  },
);

it("does not mistake a credential rejection during receipt recovery for proof the original request failed", async () => {
  const { scope, stub } = fixture();
  let calls = 0;
  network.use(
    http.post(base, () =>
      ++calls === 1
        ? HttpResponse.error()
        : HttpResponse.json({ error_type: "unauthorized" }, { status: 401 }),
    ),
  );
  accepted(await stub.submit(scope, command()));
  await due(stub, scope);
  await due(stub, scope);
  expect((await stub.getSnapshot(scope))?.jobs[0]).toMatchObject({
    state: "needs_attention",
    providerJobId: null,
  });
  expect(await stub.submit(scope, command())).toMatchObject({ ok: false });
  expect(calls).toBe(2);
});

it("recovers a completed R2 upload after a lost checkpoint without contacting the expired provider", async () => {
  let { scope, stub } = fixture();
  network.use(http.post(base, receipt));
  const job = accepted(await stub.submit(scope, command()));
  await due(stub, scope);
  finish();
  await due(stub, scope);
  const record = await runInDurableObject(stub, (_, state) =>
    readCoordinator(state.storage),
  );
  const pending = record!.jobs[0]!;
  // Stop at the real storage boundary: R2 committed, DO acknowledgement not yet written.
  await archiveOutput(
    env.GENERATED_ASSETS,
    scope.ownerId,
    pending.outputs[0]!,
    async () => result.result.sample,
  );
  network.use(
    http.all(
      "https://api.comfy.org/*",
      () => new HttpResponse(null, { status: 410 }),
    ),
    http.get(
      "https://storage.googleapis.com/test-assets/fox.png",
      () => new HttpResponse(null, { status: 410 }),
    ),
  );
  await abortAllDurableObjects();
  stub = env.GENERATION_COORDINATORS.getByName(scope.ownerId);
  await due(stub, scope);
  const recovered = await getJob(createDatabase(env.DB), scope, job.id);
  expect(recovered?.state).toBe("succeeded");
  expect(recovered?.outputs[0]?.r2Key).toBeTruthy();
  // A delayed provider-only projection cannot erase the archived reference.
  await applyJobSnapshot(
    createDatabase(env.DB),
    pending,
    record!.executions[job.id]!,
  );
  expect(
    (await getJob(createDatabase(env.DB), scope, job.id))?.outputs[0]?.r2Key,
  ).toBe(recovered!.outputs[0]!.r2Key);
});

it("suspends failed asset downloads and retries storage without resubmitting a generation", async () => {
  let { scope, stub } = fixture();
  let submits = 0;
  network.use(
    http.post(base, () => {
      submits++;
      return receipt();
    }),
  );
  const job = accepted(await stub.submit(scope, command()));
  await due(stub, scope);
  finish();
  network.use(
    http.get(
      "https://storage.googleapis.com/test-assets/fox.png",
      () => new HttpResponse(null, { status: 503 }),
    ),
  );
  await due(stub, scope);
  for (let i = 0; i < 8; i++) await due(stub, scope);
  expect((await stub.getSnapshot(scope))?.jobs[0]).toMatchObject({
    state: "needs_attention",
    outputs: [{ r2Key: null }],
  });
  await abortAllDurableObjects();
  stub = env.GENERATION_COORDINATORS.getByName(scope.ownerId);
  finish();
  expect(accepted(await stub.reconcile(scope, job.id)).state).toBe(
    "persisting",
  );
  await due(stub, scope);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe("succeeded");
  expect(submits).toBe(1);
});

it("archives existing v3 completed outputs on coordinator activation", async () => {
  let { scope, stub } = fixture();
  network.use(http.post(base, receipt));
  accepted(await stub.submit(scope, command()));
  await due(stub, scope);
  finish();
  await due(stub, scope);
  await runInDurableObject(stub, async (_, state) => {
    const record = JSON.parse(
      JSON.stringify(await readCoordinator(state.storage)),
    );
    record.schemaVersion = 3;
    record.jobs[0].state = "succeeded";
    delete record.executions[record.jobs[0].id].assetsPending;
    await state.storage.put("coordinator", record);
    await state.storage.deleteAlarm();
  });
  await abortAllDurableObjects();
  stub = env.GENERATION_COORDINATORS.getByName(scope.ownerId);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe("persisting");
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  expect((await stub.getSnapshot(scope))?.jobs[0]?.state).toBe("succeeded");
});
