# Media library and uploads

Uploaded images and short videos feed Elements (as references) and video replacement (as sources). The Library page shows them next to saved generated outputs. Implemented 2026-10-17.

## Using it from another feature

Import from `@/features/library`:

| Export                                                 | Use                                                                                                                                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MediaPicker`                                          | Dialog for choosing an upload or generated output, or uploading a new file on the spot. `kind="image" \| "video"` filters it. `onSelect(item)` receives a `MediaItem`; store `item.ref`, an `AssetRef` from contracts.                    |
| `uploadFiles(files)`                                   | Uploads from code (your own drop zone or file input). Resolves with a `MediaItem` per file, or `null` where one failed; failed tiles keep the error and offer Retry in the Library.                                                       |
| `useLibrary(select)`                                   | Subscribes to the shared store (`items`, `uploads`, `status`).                                                                                                                                                                            |
| `parseAssetRefKey(value)` / `mediaUseHref(item, role)` | The Library's "Use as source" link goes to `/?source=asset:<id>` and "Use as reference" to `/elements/new?reference=asset:<id>`. Generated outputs use `output:<jobId>:<outputId>`. Destinations parse the param with `parseAssetRefKey`. |
| `Thumbnail`                                            | Fading thumbnail over a placeholder icon, which stays while a video's poster is drawn.                                                                                                                                                    |

Server-side, resolve a ref with `resolveAssetRef` from `@open-cinema/database/queries`. That function checks ownership and readiness. To give a provider a URL it can fetch without the session cookie, call `signedUploadUrl(origin, ownerId, assetId)` from `apps/web/src/server/media-items.ts`. It returns an HMAC-signed link to `/api/media/<id>` that is valid for an hour. Signed links cover upload originals only. Job outputs have no signed link yet.

## Upload path

1. The browser checks the type and size, then measures the file. Images go through `createImageBitmap`, and get a WebP poster at most 640 px wide when they are larger than 640 px or 512 KB. Videos are read with [Mediabunny](https://mediabunny.dev) (`features/library/video-frames.ts`) in a worker (`video-frames.worker.ts`), so demuxing, decoding and encoding never take main-thread time: display size, duration, pixel aspect and audio come from the MP4, MOV or WebM container without decoding, and the frame rate from the frames' own timestamps. Mediabunny then draws the video's poster with WebCodecs (see [Video posters](#video-posters)).
2. A video whose pixels are not square is converted in the browser before it is sent: Mediabunny resamples it to its display size as H.264 MP4 with square pixels, keeping each frame's timing and the audio, and the tile shows **Converting** with its progress. Kling refuses non-square pixels with a bare `provider_error`. The size keeps the height and scales the width by the pixel aspect, as ffmpeg's `scale=iw*sar:ih` does (a 960×720 clip at 4:3 becomes 1280×720; 1280×720 at 639:640 becomes 1278×720). A production-build trace of a 4 s 720p conversion showed no main-thread task over 16.7 ms besides the file picker's own change event. When the browser cannot do it (no H.264 encoder, a codec it cannot decode, audio it cannot carry), the original is uploaded with its measured `pixelAspect` and the job squares it on Comfy Cloud instead ([background-job.md](background-job.md#square-pixels)).
3. `POST /api/media/upload` takes the file as the raw request body. The type comes from `Content-Type`, the name from `X-Media-Filename`, and the measurements from the `X-Media-Width`, `X-Media-Height` and `X-Media-Duration` headers. The route checks the session and same-origin, then records a pending `MediaAsset` (`createPendingMediaAsset`). It streams the body into R2 as a bounded multipart upload (`storeUpload` in `packages/assets/src/uploads.ts`) and marks the asset ready using the size and ETag R2 reports. On failure the asset is marked failed and the partial upload is aborted. The browser uses XHR so it can show upload progress. Up to two uploads run at once.
4. `PUT /api/media/<id>?variant=poster` stores the browser's poster at a fixed key next to the original and records it as the asset's `posterKey`.
5. `GET`/`HEAD /api/media/<id>` streams the original with ETag and byte-range support. Adding `?variant=poster` returns the poster, or the original for small images. A video without one answers 404 (see below). The original is served `immutable` because its bytes never change under an ID.

Checks the server enforces:

- **Types:** PNG, JPEG and WebP images; MP4, WebM and MOV videos. These come from `ALLOWED_UPLOAD_MEDIA_TYPES` in contracts. The file's signature must match its declared type.
- **Size:** 25 MB for images. Videos are capped at 95 MB because Workers reject request bodies over 100 MB on most plans, even though contracts allow 500 MB. Larger video needs direct-to-R2 presigned uploads.
- **Length:** `Content-Length` is required.

Video length (two minutes at most) is checked from the browser's measurement, which is advisory. Dimensions and duration are display metadata, not trusted facts.

R2 keys are `uploads/v1/<owner>/<id>/original` and `uploads/v1/<owner>/<id>/poster`, in the private `GENERATED_ASSETS` bucket. `deleteMedia` removes the D1 row (`deleteMediaAsset`) and both objects. Element references and revisions hold typed refs rather than foreign keys, so a deleted upload resolves to `null` and consumers must handle that.

## Video posters

Every video shows a real frame wherever it appears, whatever codecs the viewer's browser can decode: Library and picker tiles, project sources and revision cards, the revision's generating state, the compare viewer and replacement studio (as `<video poster>`), the Library inspector, and Activity.

Posters are drawn in the browser; no server decodes video.

- **What:** a WebP at most 640 px wide, taken a tenth of the way in (at most one second) at the clip's display aspect with square pixels. Mediabunny's `CanvasSink` decodes that one frame with WebCodecs; for a codec WebCodecs does not offer, a `<video>` element's decoder draws it instead.
- **When:** an upload's poster is drawn while it is measured and saved right after `POST /api/media/upload` answers. A job's video results, and uploads from before this, get theirs the first time a browser views them: their poster route answers 404, and `features/library/poster-repair.ts` reads the original over byte ranges (Mediabunny's `UrlSource`, so only the frames it needs), draws the frame and saves it. `<img>` posters repair from `onError` (`repairOnError`, used by `Thumbnail`); a `<video poster>` cannot report a failed poster, so `repairVideoPoster` is its callback ref and checks with one `HEAD`. Repairs are shared per URL within a page, run two at a time, and a failed one is tried again on a later view.
- **Saving:** `PUT /api/media/<id>?variant=poster` and `PUT /api/jobs/output?job=…&output=…&variant=poster` (same-origin, session-scoped, at most 2 MB of WebP, JPEG or PNG) store the still at `uploads/v1/<owner>/<id>/poster` or `<output key>/poster` and record it with `recordPoster`: `MediaAsset.posterKey`, or `JobOutput.posterKey` plus the `width`, `height` and `durationMs` the browser sends in `X-Poster-Width`, `X-Poster-Height` and `X-Poster-Duration-Ms`. An output must be listed in D1 before its poster can be saved.
- **Serving:** `/api/media/<id>?variant=poster` and `/api/jobs/output?job=…&output=…&variant=poster` serve the recorded poster. `posterUrl(ref)` in `features/revision/model.ts` builds either URL.
- **While it is drawn:** `Thumbnail` shows its film icon until the still loads. A clip just uploaded keeps the frame already drawn if its poster did not save, until the page reloads.

### When no browser is open

Browser-side media work only happens while some browser has the studio open. A generation keeps running in the jobs Worker after the tab that started it closes, so when it finishes nobody may be there to draw its poster. This is how each case is picked up:

| Case                                                                                            | What happens                                                                                                                                                                                                                                 | Status                       |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| A job's video result finishes with no browser open                                              | Saved to R2 and listed without a poster, width, height or length. The first time any browser of the owner lists or plays it, its poster route answers 404 and `poster-repair.ts` draws the poster, saves it and records the size and length. | Handled                      |
| A result is viewed before D1 lists it                                                           | The poster `PUT` answers 404 because the output is not projected yet. The repair is forgotten and a later view tries again.                                                                                                                  | Handled                      |
| The tab closes after an upload is saved but before its poster `PUT`                             | Same as an older upload: drawn on first view.                                                                                                                                                                                                | Handled                      |
| The tab closes while converting or uploading                                                    | Nothing was stored, since conversion happens before the upload. The creator uploads it again.                                                                                                                                                | Handled (nothing to recover) |
| A clip with non-square pixels reaches a job without the browser's conversion                    | The asset resolver squares it on Comfy Cloud when the job submits it ([background-job.md](background-job.md#square-pixels)). That runs in the Worker and needs no browser. Generated results always have square pixels.                      | Handled                      |
| Something other than the studio UI reads results, such as a notification, an agent or an export | It gets no poster, and no size or length for a generated video, until a browser has viewed that result once. The Library card also shows "Video" instead of a length until then.                                                             | Not handled, deferred        |

Options for the deferred case, cheapest first:

1. **Measure in the Worker when a result is saved.** Size and length come from the MP4's `moov` box and need no decoding. Mediabunny's demuxer runs in a Worker over an R2-backed source, or a small `moov` reader would do. Recording them with the output would fix the missing length without a browser.
2. **Use a provider's own thumbnail.** Some Router models return a cover image with the video, which could be saved as the poster at no cost.
3. **Run a poster graph on Comfy Cloud** (VideoHelperSuite's loader, then one saved frame) when a result is saved, or when a non-browser client first asks for its poster. This works for every codec but costs a short GPU run for each video, which is why it is not the default.

**Decision (Martin, 2026-10-17):** when this is picked up, build option 3. The poster graph runs on Comfy Cloud when a result is saved, and its run can measure the size and length at the same time. Options 1 and 2 are not planned.

## Library UI

`/library` shows uploads in flight first, then uploads and generated outputs, newest first. The page accepts drag-and-drop anywhere when a session is active. Filters cover images, videos, uploads and generated items. Selecting a tile opens a non-modal inspector at `?item=<id>`, which can be deep-linked; picking another tile swaps it in place, and Escape returns focus to the tile. The inspector shows metadata, playback, Download, Delete (with confirmation, uploads only) and the use-as links.

These choices keep the page within the 60 fps budget:

- **Isolated progress updates:** each upload tile subscribes to its own entry, so progress ticks re-render only that tile.
- **Fewer re-renders:** tiles are memoized and clicks are delegated.
- **Filtering:** filters toggle `hidden` instead of remounting tiles.
- **Off-screen tiles:** these use `content-visibility: auto`.
- **Motion:** limited to opacity and transform (thumbnail reveal, upload enter, drop overlay, hover lift), using tokens from `styles.css`.
- **No scroll lock:** the inspector does not lock scrolling, which avoids a full style recalculation when it opens.

## Verification on 2026-10-17

Ran with agent-browser against `bun run dev` and the production `bun run preview`. Evidence is in the ignored `artifacts/library/` folder.

**Tests run:**

- **Uploads and grid:** a 1920×1080 PNG, a 6 s H.264 MP4, a 4 s VP9 WebM, a 65 MB MP4 and a batch of 36 JPEGs all reached the grid with correct dimensions and durations. The WebM got a poster frame. The MP4s show a placeholder in this Chromium build, which has no H.264 decoder.
- **Rejections:** a 120 MB file and a GIF were rejected with explanations and no Retry. A wrong signature, an oversized declared length and a truncated body are rejected without storing anything (`apps/jobs/test/uploads.test.ts`).
- **Detail and delete:** the inspector played the WebM. Deleting asked for confirmation and removed the item.
- **Picker:** the Elements "Choose from Library" button opened the picker filtered to images and added the picked upload.
- **Layout and accessibility:** no horizontal overflow at 390×844. axe found zero violations at desktop and mobile, with and without the inspector open. The remaining "incomplete" items are text over images, such as the duration badge.
- **Frame timing:** measured on the production preview with 39 items. Opening the inspector takes about 10 ms of event processing after the first open, which takes 20–27 ms while code warms. Switching filters takes 2–4 ms. Scrolling had no long tasks.

**Not verified:**

- **60 fps:** the headless trace also records dropped-begin-frame events, so this is diagnostic evidence, not a sustained 60 fps result. Physical-device profiling is still required.
- **Generated items:** a live generation could not run here because Router rejected the local credentials, so generated items in the grid were checked only through code shared with Activity.
- **Deployment:** the app was not deployed.
