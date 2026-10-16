import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getOrbState, jobEventSchema } from "@open-cinema/contracts";
import { createComfyClient, mapProviderState } from "@open-cinema/comfy";

describe("Worker boundaries", () => {
  it("does not expose a public jobs endpoint", async () => {
    const response = await exports.default.fetch("https://jobs.test/");
    expect(response.status).toBe(404);
  });

  it("persists coordinator ownership and rejects another user", async () => {
    const ownerId = crypto.randomUUID();
    const stub = env.GENERATION_COORDINATORS.getByName(ownerId);
    const snapshot = await stub.getSnapshot({ ownerId });
    expect(jobEventSchema.parse(snapshot)).toMatchObject({
      type: "snapshot",
      sequence: 0,
      jobs: [],
    });
    expect(await stub.getSnapshot({ ownerId: "another-user" })).toBeNull();
    const other = env.GENERATION_COORDINATORS.getByName(crypto.randomUUID());
    expect(await other.getSnapshot({ ownerId: "another-user" })).toMatchObject({
      jobs: [],
    });
  });

  it("rejects expired subscriptions", async () => {
    const stub = env.GENERATION_COORDINATORS.getByName(crypto.randomUUID());
    expect(
      (
        await stub.fetch("https://jobs.test/stream", {
          headers: {
            Upgrade: "websocket",
            "X-Owner-Id": "owner",
            "X-Session-Expires-At": String(Date.now() - 1),
          },
        })
      ).status,
    ).toBe(401);
  });

  it("opens a hibernatable socket and sends a validated snapshot", async () => {
    const ownerId = crypto.randomUUID();
    const stub = env.GENERATION_COORDINATORS.getByName(ownerId);
    const response = await stub.fetch("https://jobs.test/stream", {
      headers: {
        Upgrade: "websocket",
        "X-Owner-Id": ownerId,
        "X-Session-Expires-At": String(Date.now() + 60_000),
      },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    if (!socket) throw new Error("Missing WebSocket");
    socket.accept();
    const message = await new Promise<MessageEvent>((resolve) =>
      socket.addEventListener("message", resolve, { once: true }),
    );
    expect(
      jobEventSchema.parse(JSON.parse(String(message.data))),
    ).toMatchObject({ type: "snapshot", jobs: [] });
    socket.close();
  });
});

describe("shared contracts", () => {
  it("keeps the orb thinking until every active job finishes", () => {
    expect(getOrbState([{ state: "succeeded" }, { state: "running" }])).toBe(
      "thinking",
    );
    expect(
      getOrbState([{ state: "failed" }, { state: "needs_attention" }]),
    ).toBe("idle");
    expect(getOrbState([])).toBe("idle");
  });

  it("rejects an incompatible socket protocol", () => {
    expect(
      jobEventSchema.safeParse({
        protocolVersion: 2,
        type: "snapshot",
        jobs: [],
        sequence: 0,
        emittedAt: new Date().toISOString(),
      }).success,
    ).toBe(false);
  });
});

describe("Comfy runtime compatibility", () => {
  it("constructs the official SDK in workerd without network I/O", () => {
    expect(createComfyClient({ apiKey: "local-test-only" }).submit).toBeTypeOf(
      "function",
    );
    expect(() => createComfyClient({ apiKey: " " })).toThrow("credentials");
    expect(mapProviderState("IN_PROGRESS")).toBe("running");
    expect(mapProviderState("future-status")).toBe("needs_attention");
  });
});
