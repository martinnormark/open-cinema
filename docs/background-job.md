# Background replacement job

The `video.background-replace` job delivers the pipeline Phase 0 recommended ([phase0-background.md](phase0-background.md)): Kling 3.0 Omni edits the take, and a foreground lock puts the source performers back over Kling's background. Both results reach the creator on the source's own frame grid with the source audio, and the creator chooses between them in the comparison viewer.

## Stages

A workflow definition can declare `stages` that run after its first request's outputs are saved (`packages/comfy/src/workflows/types.ts`). The coordinator keeps one job and one queue slot for the whole pipeline, stores each stage's outputs as `{stage}:{asset}`, and shows the stage label on the job (`job.stage`).

| Stage   | Runs on                                     | Output                      | What it does                                                                                                         |
| ------- | ------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| edit    | Router, `kling/kling-v3-omni`               | the Kling clip              | Replaces the background. Returns 24 fps, up to two frames short, performers relit.                                   |
| `matte` | Router, `bria/video-edit-remove-background` | `matte:video` (VP9 + alpha) | Mattes the source performers and anything they touch. Same frame rate and length as the source.                      |
| `lock`  | Media container (`apps/jobs/media`)         | `lock:locked`               | Composites source over edit through the matte (softened by about one pixel), on the source frame grid, source audio. |
|         |                                             | `lock:unlocked`             | The edit alone, conformed the same way, with the source audio.                                                       |

The edit and the matte stay stored with the job but are not results: `resultOutputs()` in `@open-cinema/contracts` returns the variants (locked first), the library lists only those, and the revision is proposed with the locked output. Keeping the other variant (`setRevisionStatus` with `resultOutputId`) switches the revision's result to it; only a saved output of the same job qualifies.

Each container task saves its MP4 under a deterministic R2 key before the checkpoint records it, so a repeated alarm never renders twice. Five failed attempts (or one definite refusal: the container answers 422 for media it cannot read) put the job in **needs attention** with the edit and matte saved; **Check again** retries only the lock. Cancelling during the lock cancels without further work.

## Why the lock runs in a container

No Router model conforms or composites on a timeline. A live check (2026-10-17, `artifacts/background-job/live-bria/`) gave `bria/video-edit-replace-background` a 25 fps, 153-frame source as foreground and a 24 fps, 145-frame clip as its background video. It returned **24 fps and 146 frames**: it pairs frames by index and adopts the background's rate, so the performers ran 4% slow, the last 0.3 s was cut, and the preserved audio drifted against them. Conforming needs real frame resampling, which needs a decoder.

The media container is `node:24-alpine` with ffmpeg and a small server (`apps/jobs/media/server.mjs`). The coordinator streams the parts from R2 into one request body (`x-media-parts: source=…,edit=…,matte=…`) and streams the MP4 back into R2, so the Worker buffers nothing. The container has no internet access. For each source frame `i` the edit frame nearest `i / source_fps` is used, and the last edit frame is held if the edit ends early (the Phase 0 evaluation's time-map). The output has exactly the source's frame count and rate; AAC audio is copied, other audio is encoded to AAC.

Every output is at the source's display size with square pixels. A source whose pixels are not square (for example a 639:640 sample aspect, which Kling answers with a bare `provider_error`) is first sent through `POST /square` when the job uploads it to Comfy storage: the asset resolver reads the pixel aspect the browser measured at upload (`MediaAsset.pixelAspect`) and streams the conformed MP4 instead of the original. The Comfy storage link each job creates is saved in its checkpoint (`uploads`), so a request rebuilt after a lost receipt carries the same link and Router recognises it under the same idempotency key instead of answering 409.

Verified offline on the Phase 0 clips (`artifacts/background-job/clips/`, review frames in `…/review/`): C4 (25 fps, 153 frames) against a 24 fps, 145-frame edit with burned-in frame numbers gives 153 frames at 25 fps, and output frames 50, 100 and 152 show edit frames 48, 96 and 144. C1 (24 fps) locks the walking couple over Kling's dusk harbor with their faces unchanged. The same server ran inside the built image.

## Live run through the app (2026-10-17)

A 4 s, 25 fps, 1280×720 take with an AAC track ran through the revision studio on the local stack (relay to Router, media server in Docker). Kling returned 24 fps and 97 frames; the matte came back at 25 fps and 100 frames; both variants came out at exactly 25 fps, 100 frames and 4.00 s with the source audio, and the revision was proposed with the locked output. A second, 3 s run was recorded in the browser through review: the As shot / Relit switch, side by side, and keeping the relit version. Evidence is in `artifacts/background-job/e2e/`.

## Cost and time for a 6 s take

Kling $0.76, Bria matte about $0.30 (it ran in 33 s on 2026-10-17), and a few seconds of container CPU (under 3 s per output for a 640×360 clip on 4 cores). Against Phase 0's lock with a SwitchX matte (about $1.50), this is cheaper and keeps everything on Router. Where Bria's matte misses a prop (Phase 0 saw it drop a lamp and a bicycle wheel when it composited over a still), the lock shows Kling's own version of the prop instead, which Kling keeps.

## Running it locally

`wrangler dev` does not build containers (`dev.enable_containers` is false, so no Docker is needed). Run the media server yourself and point the jobs Worker at it:

```sh
node apps/jobs/media/server.mjs   # needs ffmpeg with libvpx on PATH; listens on :8080
# or: docker build -t open-cinema-media apps/jobs/media && docker run -p 8080:8080 open-cinema-media
```

In `apps/jobs/.dev.vars` set `MEDIA_ORIGIN="http://127.0.0.1:8080"`. Like `COMFY_BASE_URL`, only plain http on loopback is honored. Without it, the lock stage fails and the job waits in **needs attention** with its edit and matte saved.

The server also runs the steps directly: `node apps/jobs/media/server.mjs lock out.mp4 source.mp4 edit.mp4 matte.webm`, `… conform out.mp4 source.mp4 edit.mp4` or `… poster out.webp source.mp4`. The same container makes video posters for the Library ([library.md](library.md#video-posters)).

## Deploying

`wrangler deploy` for the jobs Worker builds `apps/jobs/media/Dockerfile` and needs Docker. `bun run build` passes `--containers-rollout none` so checks do not. The container class is `MediaContainer` (Durable Object migration `v2`), at most four instances, and it sleeps after five idle minutes.
