# Foundation: contracts, persistence, and workflow dispatch

How the shared pieces fit together, and where new work goes. Written 2026-10-17. The live model list is in [comfy-router-catalog.md](comfy-router-catalog.md).

## Contracts (`packages/contracts`)

Everything is a Zod schema with an inferred type, and `src/index.ts` re-exports all of it.

| File | What it defines |
| --- | --- |
| `media.ts` | `AssetRef`, which is either `{ type: "media-asset", assetId }` for an upload or `{ type: "job-output", jobId, outputId }` for a generated result. Also `MediaAsset` (an upload, `pending → ready / failed`), the allowed upload types and limits, and `Project` with its persistent `direction`. |
| `elements.ts` | `Element`, which is a `character`, `location` or `thing`. It has a unique `@handle` per owner, an identity `description` and a `version`. Each Element has `ElementReference`s (approved, experiment or rejected, with a `view` tag and `roles`) and named `ElementState`s. Also input schemas, `toElementHandle`, `parseMentionHandles`, `approvedReferences(element, stateId?)` and `missingViews`. |
| `replacement.ts` | `TargetSelection` (background, a person by point or box, or a mask), `PreservationIntent` with `DEFAULT_PRESERVATION`, and `Revision`: a source, an optional result, an intent, and a status of `pending → proposed → kept / rejected` or `failed`. |
| `workflow-kinds.ts`, `workflows.ts` | `WorkflowKind` and the typed inputs for each kind (`workflowInputsSchemas`). Also `GenerationRequest` (a discriminated union on `workflowKind`) and `WorkflowCommand` (an idempotency key, the request, and an optional `projectId` and `revision`). Plus `ResolvedMention`, `GenerationEstimate`, `WORKFLOW_DESCRIPTORS`, and the helpers `requestAssetRefs`, `requestMentions`, `requestPrompt` and `promptToRequest`. |

Rules that keep this consistent:
- An Element's `version` increments whenever its identity description or its set of approved references changes. Only references with the `approved` status condition generations.
- A reference with a `stateId` applies only when that state is mentioned. A reference without one is part of the base sheet.
- Asset refs never carry bytes or URLs. They are resolved at the moment of use.

## Database (`packages/database`)

Migration `0005_elements_media.sql` adds `Project`, `Element`, `ElementState`, `ElementReference`, `MediaAsset` and `Revision`. It also adds `workflowKind` and `projectId` to `GenerationJob`. It was generated with the pinned `prisma migrate diff`, and the table rebuild for `GenerationJob` was replaced with additive `ALTER`s. Applying 0001 through 0005 gives the same schema as `schema.prisma`.

Asset refs are stored as typed columns (`assetType`, `mediaAssetId`, `jobId`, `outputId`), not as foreign keys, because job outputs reach D1 asynchronously. Every query and mutation takes an `OwnerScope` and filters on it. `resolveAssetRef(db, scope, ref)` is the single ownership check for any media ref: an upload must be owned and `ready`, and a job output must belong to a job the caller owns and have an `r2Key`.

| Domain | Queries | Mutations |
| --- | --- | --- |
| Projects | `listProjects`, `getProject` | `createProject`, `updateProject` |
| Media | `listMediaAssets` (ready only), `getMediaAsset`, `resolveAssetRef` | `createPendingMediaAsset`, `markMediaAssetReady`, `markMediaAssetFailed`, `updateMediaAssetMetadata` |
| Elements | `listElements`, `getElement`, `getElementsByHandles`, `getElementsByIds` | `createElement` (suffixes the handle on collision), `updateElement`, `deleteElement`, `addElementReference` (images only, owner-checked), `updateElementReference`, `removeElementReference`, `createElementState`, `deleteElementState` |
| Revisions | `listRevisions` (by source or project), `getRevision`, `getRevisionForJob` | `createRevision`, `settleRevisionForJob`, `setRevisionStatus` (only after a result exists) |

A revision made through `WorkflowCommand.revision` has the same ID as its job. `applyJobSnapshot` creates it on the job's first D1 projection and settles it to `proposed`, with the first saved output, or to `failed`. It only ever moves forward from `pending`.

## Dispatch (`apps/jobs` and `packages/comfy`)

```
web server fn ──submit(WorkflowCommand | PromptCommand)──▶ GenerationCoordinator (DO)
  accept: validate, look up the definition, resolve @mentions to Element snapshots,
          owner-check media refs, persist { command, mentions, workflow: { model } }
  alarm:  definition.build(inputs, { mentions, asset }) ──▶ Router queue submit
          poll status ──▶ definition.outputs(result) ──▶ archive each output to R2
```

- A bare `PromptCommand` is shorthand for `image.flux` and keeps its old request hash, so retries made across a deploy still deduplicate.
- `submit` returns `jobId` for the accepted job, or the existing job when an idempotency key is reused.
- Mentions are resolved once, at acceptance. These come from explicit `mentions` in the inputs, the Location or Character of a replacement, and any `@Handle` in the prompt. Each mention records the Element version, the state, and up to 8 approved references. Unknown handles stay as plain text, and a foreign or deleted Element rejects the command. Plain prompts never touch D1.
- Provider input is rebuilt from the typed command at submission and is never persisted. `BuildContext.asset(ref)` gives `base64()`, `dataUri()` (up to 14 MB, read from R2) and `publicUrl`.
  - `publicUrl` is a signed `/api/media/:id` link for uploads. It is set only when the jobs Worker has `MEDIA_PUBLIC_ORIGIN` (https) and `MEDIA_SIGNING_SECRET`, which must equal the web Worker's `LOCAL_SESSION_SECRET`. Otherwise it is null, which is the local development case.
  - Link expiry is fixed per job at the deadline plus one hour, so a rebuilt request after a lost receipt is identical.
- If media becomes unavailable between acceptance and submission, the job fails with a clear message and nothing reaches the provider.
- Checkpoint schema v5 adds `workflowKind` and `mentions` to executions and stores the command as a `WorkflowCommand`. v4 prompt commands upgrade in place. v4 Router executions that persisted a full `{ model, input }` still submit that stored request unchanged.

## Adding a workflow kind

1. If the kind is new, add it to `workflowKindSchema`, give it an inputs schema in `workflows.ts`, and add a branch to `generationRequestSchema`, `requestAssetRefs` and `WORKFLOW_DESCRIPTORS`.
2. Write the Router request builder in its own file under `packages/comfy/src/workflows/`, for example `ltx-video.ts`. Read the model's schema in the catalog first. Builders are pure functions of typed inputs.
3. Wrap the builder in a `WorkflowDefinition` that provides `displayModel`, `deadlineMs`, `model(inputs)`, `build(inputs, context)` and `outputs(result)`. Then register it in `workflows/index.ts`. Existing definitions are in `workflows/definitions.ts`. Result shapes differ by model: BFL uses `result.sample` and LTX uses `result.video_url`.
4. Add the estimate to `packages/comfy/src/estimates.ts`. Router queue responses report no cost, so estimates come from published pricing.
5. Test against HTTP fixtures in `apps/jobs/test`. `dispatch.test.ts` shows how to drive submission with mentions and inline references.

The coordinator itself needs no change. An unregistered kind is rejected at submit with "That kind of generation is not available yet." At the time of writing, `image.flux`, `image.flux-reference` and `video.ltx` are registered. The two replacement kinds have contracts and revision persistence, but they still need definitions.

## Where server code goes

Each domain gets its own `apps/web/src/server/<domain>.ts`, such as `elements.ts`, `media.ts`, `revisions.ts` and `estimates.ts`. Nobody edits `functions.ts`. Database access goes through `@open-cinema/database`, never through Prisma directly. R2 blob operations live in `packages/assets`.

## Running live jobs locally behind a credential-injecting proxy

workerd connects directly, not through `HTTPS_PROXY`. In an environment whose proxy injects Comfy credentials, such as a Claude Code cloud container with no `COMFY_API_KEY` value, the local jobs Worker gets 401s from Router. For development:

1. Run `bun scripts/comfy-relay.ts`. It listens on `127.0.0.1:8790` only, forwards to `https://api.comfy.org` through `HTTPS_PROXY`, and drops the caller's `Authorization` header.
2. In `apps/jobs/.dev.vars`, set `COMFY_BASE_URL="http://127.0.0.1:8790"` and set `COMFY_API_KEY` to any non-empty placeholder.

`routerBaseUrl` ignores any override that is not plain http on loopback, so a deployed Worker always sends its own secret to Router directly. I verified on 2026-10-17 that a queued FLUX 3 Image submission and its status polling succeed through the relay with a placeholder key.

## Known gaps

- Job outputs have no signed public link yet, so a replacement whose source is a generated clip can only use inline base64 (14 MB or less) until one exists.
- `apps/jobs` tests run files serially (`fileParallelism: false`). With parallel files in small containers, the alarm-driven lifecycle tests time out. Their "cancels queued work" case also assumes the cancel arrives before the coordinator's immediate alarm, which only holds without contention.
