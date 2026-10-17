import { env } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { ltxVideoInputsSchema, jobOutputSchema } from "@open-cinema/contracts";
import { createComfyClient, ltxVideoRequest } from "@open-cinema/comfy";
import { archiveOutput } from "@open-cinema/assets";

const network = setupNetwork();
beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(() => reset());
afterEach(() => network.resetHandlers());

const requests = "https://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests";
const videoUrl =
  "https://storage.googleapis.com/ltx-research-model-serving/abc/video.mp4";
const mp4 = new Uint8Array([
  0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109,
]);

it("submits an LTX text-to-video request and archives its video_url output as MP4", async () => {
  const request = ltxVideoRequest(
    ltxVideoInputsSchema.parse({
      prompt: "Slow push-in on a lighthouse keeper at dusk",
      durationSeconds: 4,
      fps: 24,
      generateAudio: false,
    }),
  );
  let body: unknown;
  network.use(
    http.post(requests, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ request_id: "ltx-1" }, { status: 202 });
    }),
    http.get(`${requests}/ltx-1/status`, () =>
      HttpResponse.json({ request_id: "ltx-1", status: "COMPLETED" }),
    ),
    // LTX's native result document, as Router returned it in the live run.
    http.get(`${requests}/ltx-1`, () =>
      HttpResponse.json({
        id: "job",
        status: "completed",
        result: { video_url: videoUrl },
      }),
    ),
    http.get(
      videoUrl,
      () =>
        new HttpResponse(mp4, {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(mp4.length),
          },
        }),
    ),
  );
  const client = createComfyClient({ apiKey: "test-key", workflow: request });
  const receipt = await client.submit(
    request as unknown as Record<string, unknown>,
    crypto.randomUUID(),
    AbortSignal.timeout(5000),
  );
  expect(body).toEqual({
    prompt: "Slow push-in on a lighthouse keeper at dusk",
    duration: 4,
    resolution: "1280x720",
    fps: 24,
    generate_audio: false,
  });
  const status = await client.getStatus(receipt.providerJobId);
  expect(status).toMatchObject({
    state: "succeeded",
    outputs: [{ providerAssetId: "sample", mediaType: "video/mp4" }],
  });
  const output = jobOutputSchema.parse({
    id: "ltx-job:sample",
    jobId: "ltx-job",
    providerAssetId: "sample",
    mediaType: "video/mp4",
  });
  const saved = await archiveOutput(env.GENERATED_ASSETS, "owner", output, () =>
    client.getOutputUrl(receipt.providerJobId, "sample"),
  );
  expect(saved).toMatchObject({
    mediaType: "video/mp4",
    sizeBytes: mp4.length,
  });
  const stored = await env.GENERATED_ASSETS.get(saved.r2Key);
  expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(mp4);
});

it("animates a first frame with FLUX 3 Video because Router's LTX has no image input", () => {
  const request = ltxVideoRequest(
    ltxVideoInputsSchema.parse({
      prompt: "The keeper raises his lantern",
      durationSeconds: 3,
      resolution: "1080x1920",
    }),
    { kind: "asset", r2Key: "uploads/frame.png" },
  );
  expect(request).toEqual({
    model: "bfl/flux-3-video",
    input: {
      mode: "i2v",
      prompt: "The keeper raises his lantern",
      keyframes: [{ kind: "asset", r2Key: "uploads/frame.png" }],
      duration: 5,
      aspect_ratio: "9:16",
      resolution: "fhd",
      generate_audio: true,
    },
  });
});
