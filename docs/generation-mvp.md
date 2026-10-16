# Generation MVP

Implemented on 2026-10-17. Studio can submit an image prompt, choose from five sample prompts, cancel work, and show generated images. Activity and the floating shadercn Orb29 share one WebSocket subscription across routes.

## Run locally

1. Install dependencies with `bun install --frozen-lockfile`.
2. Set `COMFY_API_KEY` in `apps/jobs/.dev.vars` using the example file. Keep the value quoted (`COMFY_API_KEY="..."`) so dotenv preserves every byte. The key stays in the jobs Worker.
3. Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars`, enable local testing, and generate a random session secret of at least 32 characters (`openssl rand -base64 48`).
4. Run `bun run setup`, then `bun run dev`.
5. Open Studio, select **Start local session**, enter a prompt or select **Surprise me**, and select **Generate image**.

The existing root `.env.local` credential was copied into the ignored jobs Worker file for this workspace. A random local session secret was generated in the ignored web Worker file. No credentials are committed. Vite copies local secret files into ignored build output for local preview; never publish those files as static assets.

The session is a signed, HttpOnly, SameSite=Strict cookie lasting 24 hours. The server derives its random owner identity; clients cannot choose another owner. This is a local testing identity, not account authentication. It requires an explicit enable flag, a session secret, and a loopback request hostname. Public deployments fail closed until real authentication replaces it. Losing or expiring the cookie loses access to that local identity; jobs already accepted continue running.

## Model and provider

The MVP uses **Comfy Router**, via `@comfyorg/sdk` 0.5.0's `comfy.models.submit` and rehydrated request handles. The authenticated catalog was paged in full on 2026-10-17. It lists `bfl/flux-3-image`; it does not list a Klein variant. The user selected FLUX 3 Image for this integration.

The published [model schema](https://api.comfy.org/v2/models/bfl/flux-3-image/openapi.json) accepts `prompt`, `aspect_ratio: "1:1"`, `resolution: "1k"`, and `grounding: false`. It does not accept a seed. The UI does not invent or display a seed for these jobs. Grounding disables search, not provider prompt upsampling; the returned prompt may differ from the submitted text. The exact model ID and native input document are saved before submission. Model release `latest` is the provider default; reproducibility across provider releases is not promised.

The existing credential successfully submitted and completed a real queued Router request. The earlier free-tier rejection came from the **Cloud workflow API**, a different surface, and does not prevent Router generation. The SDK also exposes `comfy.models.list()` and `comfy.models.schema(model)` for discovery; model selection stays server-controlled in this MVP.

SDK 0.5.0 configures Router credentials at module scope. All coordinators in this Worker use the same deployment secret. Do not introduce per-user API keys through this shared SDK configuration; that requires client isolation first. The retained Cloud adapter uses an explicit fetch wrapper for Workers compatibility and is used only for old Cloud checkpoints.

## Lifecycle and consistency

- One coordinator per local identity; four active/queued jobs maximum, one provider execution at a time. The MVP keeps at most 100 accepted jobs per identity, including failed/cancelled jobs, to bound its checkpoint and snapshots. Idempotency records are retained with them.
- Acceptance records the command, request hash, provider submission key, provider discriminator, model/input snapshot, deadline, and recovery alarm atomically in DO storage. Same-key retries return the existing job; different input with the same key is rejected.
- An alarm persists `submitting` before calling the SDK, saves the receipt, then reconciles provider status approximately every two seconds. This is polling through the SDK with live browser WebSocket snapshots, not an always-open provider SSE stream. Provider percentages are shown only when returned.
- SDK operations have bounded request timeouts. Reads use exponential backoff with jitter; eight consecutive read failures or a 30-minute deadline suspend work as `needs_attention`. A known provider ID can be checked again. Router submissions with a lost receipt retry the identical persisted model, input, and idempotency key with bounded backoff (at most eight attempts and within the original 30-minute deadline). Router replays acceptance for the same key. Recovery never mints a replacement key. Cancellation during this window first recovers the receipt, then requests cancellation. Old Cloud workflow submissions retain their separate no-resubmit policy.
- Queued cancellation is immediate. Submitted cancellation stays active until the provider confirms an outcome; completion may win. Suspended jobs pause admission and the waiting queue to avoid overlapping uncertain executions.
- Each transition increments job version and stream sequence, saves a pending D1 projection, and broadcasts only after storage commits. A short transaction recalculates the earliest alarm from fresh state, so interleaved submissions cannot lose their wake-up.
- D1 projections use the database package, idempotent output IDs, and conditional version writes. An older projection cannot replace a newer job state. Failed projections remain pending and retry even after restart. D1 may briefly lag the coordinator and is not part of a cross-service transaction.
- All database persistence code, including checkpoint migrations and alarms, lives in `packages/database`; R2 blob operations live in `packages/assets`. Checkpoint schema v4 upgrades v1/v2/v3 records, preserves Router provider identity, and defaults untagged old executions to `cloud-workflow`. D1 migration 0003 preserves existing history/output references and makes seeds nullable; migration 0004 adds R2 output metadata. Router failure/cancellation can arrive as `COMPLETED` with `error_type`; both status and result are checked before success is published.

## Browser and assets

The same-origin WebSocket route checks Origin and the signed session. The DO sends full authoritative snapshots, persists sequence numbers, uses hibernatable sockets, limits connections to ten, and expires them at session expiry. Snapshots are size-bounded; send failures close the socket. This is not a replay protocol.

The external subscription store reconnects with backoff and refreshes snapshots over HTTP while disconnected. It ignores older sequences, preserves last-known activity, and labels reconnecting state. Before the first snapshot, the Orb says Syncing. Queued/submitting/running/persisting/cancelling jobs mean Thinking; otherwise Idle. Suspended jobs get a separate Needs attention label. Selecting the Orb opens Activity.

Generated assets are copied into private R2 storage before a job becomes Ready. Each output records its stable R2 key, size, ETag, and media type in the coordinator and D1. The UI shows Saving during the copy. Downloads authorize ownership and stream R2 bytes directly; Comfy expiry has no effect after a successful copy. Storage failures retry without repeating generation and eventually request attention. Existing provider-only jobs are copied when their coordinator next opens; already-expired sources may be unrecoverable. See [asset architecture](../ARCHITECTURE.md#asset-storage-delivery-and-retention) for bounds and recovery semantics.

Orb29 is lazy-loaded, capped at 1.5 device pixel ratio, paused for reduced motion and hidden documents, and has an accessible static fallback when WebGPU is unavailable. Its shader is attributed to [XorDev](https://x.com/XorDev) and carries a **non-commercial-use restriction** in the upstream source. Preserve that notice; obtain suitable permission or replace the shader before commercial use. The shared shadercn renderer is MIT-licensed according to the upstream source notice.

## Verification

`bun run check` covers strict types, integration tests in `workerd`, and the production build. The lifecycle suite exercises the real SDK with HTTP fixtures at its provider boundary: idempotency, ownership, queued and active cancellation, completion races, crash/restart recovery, interrupted/ambiguous submissions, WebSocket delivery, conditional history updates, D1 outage recovery, Router access rejection, terminal errors in successful HTTP responses, and migration of populated legacy history. Fixtures do not establish live GPU compatibility.

Physical-device profiling with realistic generated media and sustained progress traffic remains required for the repository's 60 fps release gate. Browser trace evidence from this local environment is not a production performance certification.

Remaining work: account authentication, provider-wide capacity limits, archival/pagination beyond the MVP retention cap, safe operator reconciliation of submissions without receipts, and commercial shader licensing.

### Earlier Cloud workflow browser verification on 2026-10-17

The production preview was checked at 1440×1000 and 390×844. Session creation, random prompt selection, durable acceptance, WebSocket status updates, Thinking → Idle, reload persistence, mobile navigation, and the Orb's Activity link were exercised. The final real request displayed the explicit Comfy free-tier API restriction. Desktop and settled mobile axe checks reported zero violations and zero incomplete checks; no browser JavaScript errors were reported. The WebGPU canvas rendered, reduced-motion emulation set the renderer to paused, and neither viewport had horizontal overflow.

The desktop Chrome trace recorded 5,703 renderer tasks, none over 16.7 ms (maximum 8.453 ms), but also recorded three dropped-begin-frame events and a display-link initialization failure in this headless environment. A desktop recording's encoder fell behind; the short mobile recording completed. These observations **do not establish sustained 60 fps**, particularly without a real generated-image workload. Trace and capture files are retained in the ignored `artifacts/generation/` directory.

### Router verification on 2026-10-17

The corrected production build completed a real `bfl/flux-3-image` generation through the Durable Object using the existing credential. The browser observed Queued/Generating → Ready and Thinking → Idle over its live subscription. The protected output route delivered the 1024×1024 image; it still loaded after reload and at a 390×844 mobile viewport. No JavaScript errors or horizontal overflow were observed. After adding sidebar and Orb landmarks, desktop and mobile axe audits each reported zero violations and zero incomplete checks. A separate SDK request also completed successfully, confirming the queued Router API independently of the UI.

`bun run check` passed all workspace type checks, 20 integration tests across four files, and the production build. The populated-history migration test preserves legacy seeds, output references, and owner isolation while allowing new seedless jobs. The local D1 migration was applied successfully. Public deployment was not performed.

The Router desktop trace recorded 8,541 renderer tasks with a maximum duration of 6.655 ms and none over 16.7 ms, plus five dropped-begin-frame events. This is useful diagnostic evidence, **not a sustained 60 fps pass**. Representative physical-device verification remains open. Captures and the trace are retained under ignored `artifacts/router/`.

### R2 verification on 2026-10-17

`bun run check` passed six workspace type checks, 28 integration tests across five files, and the production build. Storage tests cover multipart byte integrity, interrupted-checkpoint recovery, expired provider URLs after archival, failed-copy retries without duplicate generation, legacy checkpoint migration, ownership, delayed D1 projections, HEAD/ETag/range delivery, and rejection of truncated, oversized, HTML, or untrusted-redirect responses.

The additive local D1 migration 0004 was applied. A real FLUX 3 Image generation then traversed Queued → Submitting → Generating → Saving → Ready. The Orb stayed Thinking throughout Saving and returned to Idle only afterward. The resulting 1024×1024 PNG occupied 2,233,378 bytes in local R2; D1 contained its stable object key, size, media type, and multipart ETag. The same-origin output endpoint returned 200 with no redirect, HEAD returned matching size/ETag, a byte range returned 206, and a request without the session returned 401. The image remained visible after reload and at 390×844. Desktop and mobile axe checks each reported zero violations/incomplete checks, and no browser JavaScript errors were reported.

This verifies real Comfy generation with **local Cloudflare R2 emulation**, not a deployed bucket. Provision the private production bucket and apply migrations before deploying both Workers. Historical dormant coordinators have not been swept; their provider-only assets migrate on activation where the original source remains available.

The trace contained 23,127 renderer tasks, maximum 5.460 ms, none above 16.7 ms, plus five dropped-begin-frame events. The trace command timed out waiting for the browser daemon response, but its saved JSON was complete and parsed successfully. These observations do not certify sustained 60 fps on physical devices. Captures and trace are retained in ignored `artifacts/r2/`.
