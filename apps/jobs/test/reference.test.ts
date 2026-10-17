import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { fluxReferenceInputsSchema } from "@open-cinema/contracts";
import {
  createComfyClient,
  fluxReferenceRequest,
  materializeRouterRequest,
  referencedAssets,
} from "@open-cinema/comfy";

const network = setupNetwork();
beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(() => reset());
afterEach(() => network.resetHandlers());

const requests = "https://api.comfy.org/v2/models/bfl/flux-3-image/requests";
const load = async (key: string) => {
  const object = await env.GENERATED_ASSETS.get(key);
  return object ? new Uint8Array(await object.arrayBuffer()) : null;
};

it("persists reference keys and sends stored images to Router as base64", async () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 7, 7]);
  await env.GENERATED_ASSETS.put("uploads/owner/keeper.png", png);
  const request = fluxReferenceRequest(
    fluxReferenceInputsSchema.parse({
      prompt: "The same keeper drinking tea in a kitchen",
    }),
    [
      { kind: "asset", r2Key: "uploads/owner/keeper.png" },
      { kind: "url", url: "https://example.com/coat.png" },
    ],
  );
  // The snapshot that gets persisted carries references, never image bytes.
  expect(request.input.images).toEqual([
    { kind: "asset", r2Key: "uploads/owner/keeper.png" },
    { kind: "url", url: "https://example.com/coat.png" },
  ]);
  expect(referencedAssets(request)).toEqual(["uploads/owner/keeper.png"]);

  let body: unknown;
  network.use(
    http.post(requests, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ request_id: "ref-1" }, { status: 202 });
    }),
  );
  const ready = await materializeRouterRequest(request, load);
  await createComfyClient({ apiKey: "test-key", workflow: ready }).submit(
    ready as unknown as Record<string, unknown>,
    crypto.randomUUID(),
    AbortSignal.timeout(5000),
  );
  expect(body).toEqual({
    prompt: "The same keeper drinking tea in a kitchen",
    aspect_ratio: "auto",
    resolution: "1k",
    grounding: false,
    images: [btoa(String.fromCharCode(...png)), "https://example.com/coat.png"],
  });
});

it("refuses to submit when a reference is missing or no reference resolves", async () => {
  const inputs = fluxReferenceInputsSchema.parse({ prompt: "A keeper" });
  expect(() => fluxReferenceRequest(inputs, [])).toThrow(/reference/);
  await expect(
    materializeRouterRequest(
      fluxReferenceRequest(inputs, [{ kind: "asset", r2Key: "gone.png" }]),
      load,
    ),
  ).rejects.toThrow(/no longer stored/);
});
