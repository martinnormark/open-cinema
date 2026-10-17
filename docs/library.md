# Media library and uploads

Uploaded images and short videos feed Elements (as references) and video replacement (as sources). The Library page shows them next to saved generated outputs. Implemented 2026-10-17.

## Using it from another feature

Import from `@/features/library`:

| Export | Use |
| --- | --- |
| `MediaPicker` | Dialog for choosing an upload or generated output, or uploading a new file on the spot. `kind="image" \| "video"` filters it. `onSelect(item)` receives a `MediaItem`; store `item.ref`, an `AssetRef` from contracts. |
| `uploadFiles(files)` | Uploads from code (your own drop zone or file input). Resolves with a `MediaItem` per file, or `null` where one failed; failed tiles keep the error and offer Retry in the Library. |
| `useLibrary(select)` | Subscribes to the shared store (`items`, `uploads`, `status`). |
| `parseAssetRefKey(value)` / `mediaUseHref(item, role)` | The Library's "Use as source" link goes to `/?source=asset:<id>` and "Use as reference" to `/elements/new?reference=asset:<id>`. Generated outputs use `output:<jobId>:<outputId>`. Destinations parse the param with `parseAssetRefKey`. |
| `Thumbnail` | Fading thumbnail over a placeholder icon, which stays while a video's poster is made. |

Server-side, resolve a ref with `resolveAssetRef` from `@open-cinema/database/queries`. That function checks ownership and readiness. To give a provider a URL it can fetch without the session cookie, call `signedUploadUrl(origin, ownerId, assetId)` from `apps/web/src/server/media-items.ts`. It returns an HMAC-signed link to `/api/media/<id>` that is valid for an hour. Signed links cover upload originals only. Job outputs have no signed link yet.

## Upload path

1. The browser checks the type and size, then measures the file. Images go through `createImageBitmap`. Videos are decoded through a `<video>` element. When the codec can't be decoded (H.264 or HEVC in Chromium builds without proprietary codecs), duration and frame size come from the MP4/MOV `moov` box instead. The browser also renders a WebP poster at most 640 px wide for images larger than 640 px or 512 KB. For a video it draws a frame only to show on the uploading tile; the stored poster comes from ffmpeg (see [Video posters](#video-posters)).
2. `POST /api/media/upload` takes the file as the raw request body. The type comes from `Content-Type`, the name from `X-Media-Filename`, and the measurements from the `X-Media-Width`, `X-Media-Height` and `X-Media-Duration` headers. The route checks the session and same-origin, then records a pending `MediaAsset` (`createPendingMediaAsset`). It streams the body into R2 as a bounded multipart upload (`storeUpload` in `packages/assets/src/uploads.ts`) and marks the asset ready using the size and ETag R2 reports. On failure the asset is marked failed and the partial upload is aborted. The browser uses XHR so it can show upload progress. Up to two uploads run at once.
3. `PUT /api/media/<id>?variant=poster` stores an image's poster at a fixed key next to the original and records it as the asset's `posterKey`. Videos refuse it.
4. `GET`/`HEAD /api/media/<id>` streams the original with ETag and byte-range support. Adding `?variant=poster` returns the poster: a video's ffmpeg still, an image's browser poster, or the original for small images. The original is served `immutable` because its bytes never change under an ID.

Checks the server enforces:

- **Types:** PNG, JPEG and WebP images; MP4, WebM and MOV videos. These come from `ALLOWED_UPLOAD_MEDIA_TYPES` in contracts. The file's signature must match its declared type.
- **Size:** 25 MB for images. Videos are capped at 95 MB because Workers reject request bodies over 100 MB on most plans, even though contracts allow 500 MB. Larger video needs direct-to-R2 presigned uploads.
- **Length:** `Content-Length` is required.

Video length (two minutes at most) is checked from the browser's measurement, which is advisory. Dimensions and duration are display metadata, not trusted facts.

R2 keys are `uploads/v1/<owner>/<id>/original` and `uploads/v1/<owner>/<id>/poster`, in the private `GENERATED_ASSETS` bucket. `deleteMedia` removes the D1 row (`deleteMediaAsset`) and both objects. Element references and revisions hold typed refs rather than foreign keys, so a deleted upload resolves to `null` and consumers must handle that.

## Video posters

Every video shows a real frame wherever it appears, whatever codecs the viewer's browser can decode: Library and picker tiles, project sources and revision cards, the revision's generating state, the compare viewer and replacement studio (as `<video poster>`), the Library inspector, and Activity.

- **What:** a WebP at most 640 px wide, taken a tenth of the way in (at most one second) at the clip's display aspect with square pixels. The media container's `POST /poster` makes it with ffmpeg (`apps/jobs/media/server.mjs`) and reports the clip's display size and length in `x-media-width`, `x-media-height` and `x-media-duration`.
- **When:** an upload's poster is started right after `POST /api/media/upload` answers (`waitUntil`). A job's video results get theirs when the job succeeds. Anything older gets its poster the first time it is viewed.
- **How:** `GenerationCoordinator.ensurePoster(scope, ref)` resolves the upload or output, renders once (concurrent requests for the same ref share the render, and at most two renders run per creator), stores the still at `uploads/v1/<owner>/<id>/poster` or `<output key>/poster`, and records it with `recordPoster`: `MediaAsset.posterKey`, or `JobOutput.posterKey` plus `width`, `height` and `durationMs`. An upload keeps what the browser measured; ffmpeg fills only what is unknown. A poster stored before its record is reused, never rendered twice.
- **Serving:** `/api/media/<id>?variant=poster` and `/api/jobs/output?job=…&output=…&variant=poster` serve the recorded poster or wait for `ensurePoster`. `posterUrl(ref)` in `features/revision/model.ts` builds either URL.
- **While it is made:** `Thumbnail` shows its film icon until the still loads and retries a failed load once after two seconds. A clip just uploaded from a browser that can decode it keeps the frame the browser drew until the page reloads.

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
