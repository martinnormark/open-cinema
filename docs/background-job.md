# Background replacement job

> Deployment update (2026-10-30): the application now runs entirely in Docker with Bun, SQLite and private file storage. Infrastructure references and earlier verification results below describe the previous implementation. Use [deployment](deployment.md) and [architecture](../ARCHITECTURE.md) for current setup.

The `video.background-replace` job delivers the pipeline Phase 0 recommended ([phase0-background.md](phase0-background.md)): Kling 3.0 Omni edits the take, and a foreground lock puts the source performers back over Kling's background. Both results reach the creator on the source's own frame grid with the source audio, and the creator chooses between them in the comparison viewer.

## Stages

A workflow definition can declare `stages` that run after its first request's outputs are saved (`packages/comfy/src/workflows/types.ts`). The coordinator keeps one job and one queue slot for the whole pipeline, stores each stage's outputs as `{stage}:{asset}`, and shows the stage label on the job (`job.stage`).

| Stage   | Runs on                                     | Output                      | What it does                                                                                    |
| ------- | ------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| edit    | Router, `kling/kling-v3-omni`               | the Kling clip              | Replaces the background. Returns 24 fps, up to two frames short, performers relit.              |
| `matte` | Router, `bria/video-edit-remove-background` | `matte:video` (VP9 + alpha) | Mattes the source performers and anything they touch. Same frame rate and length as the source. |
| `lock`  | Comfy Cloud graph (`media-graphs.ts`)       | `lock:locked`               | Composites source over edit through the matte, on the source frame grid, source audio.          |
|         |                                             | `lock:unlocked`             | The edit alone, conformed the same way, with the source audio.                                  |

The edit and the matte stay stored with the job but are not results: `resultOutputs()` in `@open-cinema/contracts` returns the variants (locked first), the library lists only those, and the revision is proposed with the locked output. Keeping the other variant (`setRevisionStatus` with `resultOutputId`) switches the revision's result to it; only a saved output of the same job qualifies.

Each media task saves its MP4 under a deterministic R2 key before the checkpoint records it, so a repeated alarm never renders a saved output twice. Five failed attempts (or one definite refusal: Cloud rejects the graph or the run fails on the media) put the job in **needs attention** with the edit and matte saved; **Check again** retries only the lock. Cancelling during the lock cancels without further work.

## Why the lock runs as a Comfy Cloud graph

No Router model conforms or composites on a timeline. A live check (2026-10-17, `artifacts/background-job/live-bria/`) gave `bria/video-edit-replace-background` a 25 fps, 153-frame source as foreground and a 24 fps, 145-frame clip as its background video. It returned **24 fps and 146 frames**: it pairs frames by index and adopts the background's rate, so the performers ran 4% slow, the last 0.3 s was cut, and the preserved audio drifted against them. Conforming needs real frame resampling, which needs a decoder, and a Worker has none (no ffmpeg, 128 MB of memory).

The steps run as ComfyUI graphs on Comfy Cloud (`packages/comfy/src/workflows/media-graphs.ts`), built from core nodes plus ComfyUI-VideoHelperSuite's ffmpeg loader, which Cloud ships:

| Step      | Parts               | What the graph does                                                                                                                                                                                                     |
| --------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lock`    | source, edit, matte | Conforms the edit and the matte as below, then `ImageCompositeMasked` puts the source's own pixels over the edit through the matte's alpha.                                                                             |
| `conform` | source, edit        | `VHS_LoadVideoFFmpeg` resamples the edit to the source's rate (ffmpeg's `fps` filter, nearest frame in time), holds its last frame if it ends early, and trims to the source's frame count.                             |
| `square`  | source              | Scales a clip to its display size with square pixels and, when asked, enlarges it to a minimum short side. For clips the browser could not convert at upload, and clips under Kling's 720 px ([below](#square-pixels)). |

Each step saves one H.264 MP4 at the source's frame rate and frame count, with the source's audio (`CreateVideo`, `SaveVideo`). Bria's matte is VP9 with alpha; VHS decodes it with libvpx and reports the alpha as an inverted mask, which `InvertMask` turns back. The composite scales the matte to the frame itself. Phase 0's one-pixel matte blur is gone: Bria's edge is already soft, and every extra image batch is a full float copy of the clip in Cloud's memory.

`apps/jobs/src/media.ts` runs a step from the coordinator: it streams each part from R2 into Cloud's upload (one exact-length multipart body at a time, nothing buffered), submits the graph, polls the job, and streams the result back into R2 from the signed storage link `/api/view` redirects to. It uses Cloud's ComfyUI-compatible routes (`/api/upload/image`, `/api/prompt`, `/api/jobs/{id}`, `/api/view`) with the jobs Worker's `COMFY_API_KEY` sent as `X-API-Key`. The LTX Alpha Gen workflow uses the newer `/api/v2` asset and job routes instead; on 2026-10-17 those refused the development proxy's credential while these accepted it ([foundation.md](foundation.md)). A step holds the coordinator's alarm until Cloud finishes, at most ten minutes; a 720p, 4 s lock took about 6 s on a Cloud GPU plus 3 s in Cloud's queue.

Every output is at the source's display size with square pixels. The Comfy storage link each job creates is saved in its checkpoint (`uploads`), so a request rebuilt after a lost receipt carries the same link and Router recognises it under the same idempotency key instead of answering 409.

### Square pixels

A source whose pixels are not square (for example a 639:640 sample aspect, which Kling answers with a bare `provider_error`) is converted in the browser at upload with Mediabunny ([library.md](library.md#upload-path)), so the stored original already has square pixels. A clip the browser could not convert keeps its measured `MediaAsset.pixelAspect`; when the job uploads it to Comfy storage, the asset resolver runs the `square` graph on Comfy Cloud and streams that MP4 instead of the original.

Kling refuses video under 720 px on the short side. Its requests ask the resolver for that minimum (`fetchableUrl({ minShortSide: 720 })`), and a clip below it goes through the same `square` graph, enlarged with Lanczos just enough to reach 720 px, keeping its shape. Clips that already pass, and clips whose size was not measured, are sent as uploaded. The enlarged copy is cached apart from the original, and the conform stage returns the result at the take's own size. A 1024×576, 3 s broadcast clip recast this way on 2026-10-30 (by hand, before the resolver did it) kept everyone but the recast player as shot.

Verified offline in a local ComfyUI 0.41 with VideoHelperSuite (`artifacts/background-job/cloud/small/`), the same checks the earlier ffmpeg container passed: C4 (25 fps, 153 frames) against a 24 fps, 145-frame edit with burned-in frame numbers gives 153 frames at 25 fps with the last two edit frames held, and output frames 50, 100 and 152 show edit frames 48, 96 and 144. The lock of the first live run's parts matches the container's lock at 39 dB PSNR (40 dB at 720p on Cloud), and a 4:3-pixel clip comes back at its 640×360 display size.

## Live run through the app (2026-10-17)

A 4 s, 25 fps, 1280×720 take with an AAC track ran through the revision studio on the local stack (relay to Router, media server in Docker; this was before the ffmpeg container was removed, and the media steps now run on Comfy Cloud). Kling returned 24 fps and 97 frames; the matte came back at 25 fps and 100 frames; both variants came out at exactly 25 fps, 100 frames and 4.00 s with the source audio, and the revision was proposed with the locked output. A second, 3 s run was recorded in the browser through review: the As shot / Relit switch, side by side, and keeping the relit version. Evidence is in `artifacts/background-job/e2e/`.

A third run (3 s, 25 fps, 1280×720 with AAC) checked the Comfy Cloud lock through the app on the local stack. Kling and the Bria matte ran on Router; the jobs Worker then streamed the take, edit and matte into Cloud, ran the lock and conform graphs, and saved both variants at exactly 25 fps, 75 frames and 3.00 s with the source audio. The locked variant keeps the performers as shot over Kling's seaside café; the relit one is Kling's own. Evidence is in `artifacts/background-job/cloud/e2e/`.

## Cost and time for a 6 s take

Kling $0.76, Bria matte about $0.30 (it ran in 33 s on 2026-10-17), and two short Comfy Cloud runs billed as GPU time (about 6 s each for a 720p, 4 s clip, plus queue). Against Phase 0's lock with a SwitchX matte (about $1.50), this is cheaper and keeps everything on Comfy. Where Bria's matte misses a prop (Phase 0 saw it drop a lamp and a bicycle wheel when it composited over a still), the lock shows Kling's own version of the prop instead, which Kling keeps.

## Running it locally

Media steps need Comfy Cloud: set `COMFY_API_KEY` in `apps/jobs/.dev.vars`, or in a container whose proxy injects the Comfy credential, run the relay and set `COMFY_BASE_URL` ([foundation.md](foundation.md)); the relay sends `/api/...` to Cloud and drops the placeholder key. Without Cloud, the lock stage fails and the job waits in **needs attention** with its edit and matte saved.

To check a graph without the Worker, run a step against a local ComfyUI with ComfyUI-VideoHelperSuite installed (CPU is enough for short clips), or against Cloud through the relay:

```sh
bun scripts/media-graph.ts http://127.0.0.1:8188 lock out.mp4 source=take.mp4 edit=edit.mp4 matte=matte.webm
bun scripts/media-graph.ts http://127.0.0.1:8188 conform out.mp4 source=take.mp4 edit=edit.mp4
```

## Deploying

The media steps need nothing beyond the jobs Worker's `COMFY_API_KEY` secret, which must be enabled for Comfy Cloud as well as Router. There is no container or ffmpeg to deploy: the jobs Worker's earlier ffmpeg media container was removed (wrangler migration `v3` deletes its Durable Object class), with posters and square-pixel conversion now in the browser ([library.md](library.md#video-posters)). Cloud memory grows with the clip, since each IMAGE batch in the graph is a float copy (about 1.1 GB per 100 frames at 720p, and the lock holds about eight of them), so long or 4K takes need a Cloud machine with matching RAM.
