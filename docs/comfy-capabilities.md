# Comfy capabilities for image and short video

Verified **2026-10-16** against `https://api.comfy.org` with the project key, through the Router queue API (`POST /v2/models/{id}/requests`, then poll `…/status` and fetch `…/requests/{id}`). Each row ran once. Prices come from the [Router pricing page](https://docs.comfy.org/development/comfy-router/pricing) (211 credits = $1). The full model list and schemas are in [comfy-router-catalog.md](comfy-router-catalog.md).

## What each workflow kind runs on

| Workflow kind                    | Router model                          | Builder                                               |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------- |
| `image.flux`                     | `bfl/flux-3-image`                    | `fluxImageRequest` in `packages/comfy/src/workflows/` |
| `image.flux-reference`           | `bfl/flux-3-image` with `images[]`    | `fluxReferenceRequest(inputs, references)`            |
| `video.ltx` (text only)          | `ltx/ltx-2-5-fast`, `ltx/ltx-2-5-pro` | `ltxVideoRequest(inputs)`                             |
| `video.ltx` (from a first frame) | `bfl/flux-3-video`, `mode: "i2v"`     | `ltxVideoRequest(inputs, firstFrame)`                 |

Router's LTX models are **text-to-video only**: their input schema has `prompt`, `duration`, `resolution`, `fps` and `generate_audio`, with no image field. Image-to-video therefore runs on FLUX 3 Video, which accepts one to ten `keyframes` (the first one starts the clip). An open-weights LTX image-to-video graph would need a Comfy Cloud workflow deployment instead. This environment's proxy authenticates only `api.comfy.org`, not `cloud.comfy.org`, so that route stays unverified here.

## Live results

| Run                                         | Request                               | Output                       | Wall time                           | Provider time | Cost                                                                      |
| ------------------------------------------- | ------------------------------------- | ---------------------------- | ----------------------------------- | ------------- | ------------------------------------------------------------------------- |
| Flux image (`flux-image/`)                  | 1k, 16:9, `grounding:false`           | PNG 1360×768                 | 34 s                                | 18.9 s GPU    | 0.266 credits/GPU-s → ≈5 credits (≈$0.024)                                |
| Flux reference, URL (`flux-reference/`)     | same + 1 reference URL                | PNG 1360×768, same character | 34 s                                | 22.4 s GPU    | ≈6 credits (≈$0.028)                                                      |
| Flux image, busy queue (`cost-flux-image/`) | 1k, 1:1                               | PNG                          | 481 s (queue position 10 at submit) | n/a           | ≈5 credits                                                                |
| LTX text-to-video (`ltx-t2v/`)              | fast, 4 s, 1280×720, 24 fps, no audio | MP4 H.264 1280×720, 4.04 s   | 110 s                               | 17 s          | 27.1557 credits/s → 108.6 credits (≈$0.51)                                |
| Image-to-video (`flux-video-i2v/`)          | i2v, 5 s, hd, no audio                | MP4 H.264 1280×704, 5.04 s   | 84 s                                | n/a           | BFL reported `cost: 75` (its own units); Router bills 0.266 credits/GPU-s |

Evidence is under the gitignored `artifacts/generation/<run>/`: `request.json`, the submit, status and result documents, `timing.txt`, and the downloaded `output.*`.

Observations that shape the product:

- **Queue time dominates.** Generation itself takes 17 to 22 s, but the BFL queue showed positions of 10 to 41 while other studio work ran, which put one image at 8 minutes. Estimates keep generous maxima, and the UI should show "queued" separately from "generating".
- **Router does not report the charge for queued calls.** `X-Comfy-Credits-Used` only appears on synchronous responses, and sync calls longer than 30 s return 502 through this environment's proxy. BFL results carry `cost: null` for images. `GET /customers/balance` works, but other activity on the same account makes balance deltas unreliable per request. Estimates therefore use published rates (`basis: "published-pricing"`) or observed GPU time (`basis: "observed"`).
- **Result shapes differ by provider.** BFL returns `result.sample`; LTX returns `result.video_url`. Both are signed `storage.googleapis.com` links that expire (BFL images after about 10 minutes when not re-hosted; others within 24 hours), so outputs are archived to R2 right away. `createComfyClient` reads both fields.
- **BFL rewrites prompts.** The result document holds an expanded prompt even with `grounding: false`. The studio keeps the user's text as the job prompt.
- **References keep identity.** One reference image carried the same face, beard and raincoat into a new interior. References may be http(s) URLs or base64. Stored assets are sent as base64 so private R2 objects never need a public URL.

## Image inputs

Persisted request snapshots store images as `{ kind: "asset", r2Key }` or `{ kind: "url", url }` (`ImageSource`). At submit time, `materializeRouterRequest(request, loadAsset)` replaces asset references with base64. Router caps each base64 image at 20 MB, and the builder refuses objects over 14 MB before encoding. `referencedAssets(request)` lists the R2 keys a request will read, for ownership checks.

## Estimates

`estimateGeneration(request, { firstFrame, references })` in `packages/comfy/src/estimates.ts` returns credits and seconds ranges with a `basis`. The web app exposes it as `getGenerationEstimate` (`apps/web/src/server/estimates.ts`).

| Kind                         | Credits                                                          | Basis             |
| ---------------------------- | ---------------------------------------------------------------- | ----------------- |
| `image.flux`                 | 1k ≈4.8–6.4, 1.5k ≈7.4–10.6, 2k ≈10.6–16                         | observed GPU time |
| `image.flux-reference`       | as above plus ≈0.8 per reference                                 | observed GPU time |
| `video.ltx` text             | per second: fast 27.16 (720p) / 39.22 (1080p); pro 36.21 / 51.29 | published pricing |
| `video.ltx` from first frame | ≈110–205 for 5 s, scaled by duration                             | heuristic         |

## Reproducing a run

```sh
curl -sS -X POST https://api.comfy.org/v2/models/ltx/ltx-2-5-fast/requests \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  --data '{"prompt":"…","duration":4,"resolution":"1280x720","fps":24,"generate_audio":false}'
# then poll …/requests/<request_id>/status until COMPLETED and GET …/requests/<request_id>
```

Outside this environment, add `Authorization: Bearer $COMFY_API_KEY`. Here the proxy injects it.
