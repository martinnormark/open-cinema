# Character reference workflows

These are **ComfyUI API-format node graphs**, loadable in ComfyUI and submitted by the app to Comfy Cloud. They are exported from `packages/comfy/src/workflows/character-sheet.ts`; `bun scripts/export-workflows.ts` updates them and the repository checks prevent drift.

| File | Purpose | Image input |
| --- | --- | --- |
| `generate.api.json` | Identity description → complete three-panel sheet | None |
| `state.api.json` | New state, guided by an approved face | `10.image`: portrait |
| `edit.api.json` | Revise an existing sheet, retain its identity and layout | `10.image`: source sheet |
| `portrait.api.json` | Separate neutral face reference | None in example; app adds approved references |
| `smile.api.json` | Separate smiling face reference | None in example; app adds approved portrait |

## Inputs and graph

- `1.value`: character description from the UI.
- `2.value`: state description; base appearance in the generation example.
- `3.value`: requested edit in the editing example.
- `4`: versioned `StringFormat` template; its links inject the inputs without treating braces in user text as format expressions.
- `10`–`16`: image loaders added for source/approved references. Edit source is image 1.
- `20`: native **FLUX 3 Image** partner node, 1.5K / 21:9 for sheets, 1K / 3:4 for portraits, grounding off.
- `30`–`39`: normalize to 2352 × 1008, isolate the first third, detect a face only in its top 256 pixels, replace facial features with neutral grey, composite that panel back. The rear and close-up panels, and all front pixels below row 256, are untouched by masking.
- `100`: save the finished image. This is the only application output.

The sheet has a front full-body view with its **face blanked**, a full rear view, and a large three-quarter face close-up. Hair and the head outline may remain on the front figure. This is face removal, not anatomical head removal. The browser head-removal path has been removed: older unapproved Router outputs display as originally generated, and previously approved images remain unchanged.

FLUX 3 Image's native node expands the prompt itself. Deterministic template injection inside the graph keeps layout/state/preservation rules inspectable and avoids an additional LLM service, cost, failure point, or secret. No arbitrary natural-language request can guarantee model compliance: the creator reviews results before approval.

`20.seed` is a cache invalidation value only, **not a reproducible generation seed**. The UI creates a new `cacheNonce` for a new generation; the job retains it across retries. In ComfyUI, randomize this field to request a fresh variation.

## Run in ComfyUI

1. Update ComfyUI until it includes `Flux3ImageNode`, `StringFormat`, `ImageCropV2` and the MediaPipe face nodes. These are native nodes; this workflow needs no private custom-node pack.
2. For local ComfyUI, put [Comfy-Org's MediaPipe checkpoint](https://huggingface.co/Comfy-Org/mediapipe/blob/main/detection/mediapipe_face_fp32.safetensors) at `ComfyUI/models/detection/mediapipe_face_fp32.safetensors`. SHA256: `a98c4806081d40eba35102a0f6dc0000c2e1388b72cf24e691703d0605bd888a`. Cloud already had this checkpoint during verification.
3. Open the JSON, enter your description/state/edit, select the reference image where applicable, sign into Comfy for partner-node billing, and queue it.
4. Inspect all three panels, especially front-face masking, before using the sheet as an approved reference.

The image generator is hosted FLUX 3 Image, not local Klein weights. A compatible local ComfyUI instance still needs connectivity and Comfy credits for that partner node. See the [official FLUX 3 ComfyUI guide](https://docs.comfy.org/tutorials/partner-nodes/black-forest-labs/flux-3-image).

## App secrets

For `bun run dev` / local Bun use, put `COMFY_CLOUD_API_KEY=...` in the repository-root **`.env.local`**. `COMFY_API_KEY=...` is the shared fallback and already worked in this checkout. For Docker Compose put the same setting in root **`.env`**, which Compose loads. `.env.example` documents the names; never commit real values.

No BFL, OpenAI, or other language-model credential is required. For mounted secrets use `COMFY_CLOUD_API_KEY_FILE=/run/secrets/comfy_cloud_api_key`. Image references upload directly to Cloud, so a separate Router key or public app URL is unnecessary for this workflow.

This change runs graphs on existing Comfy Cloud. It does not create a `platform.comfy.org` serverless deployment or pretend one exists.

## Verification and limits

On 2026-10-30 all five graphs passed the live Cloud node catalogue validation. Live generation and edit results were inspected; see [character sheets](../../../docs/character-sheets.md) for receipts and findings.

The front figure must stand within the left third with its face in the top 256 pixels. Cropped, seated, unusually scaled, stylized or occluded faces may not be detected. An empty detection mask leaves that area unchanged; it is **not** proof that a face was removed. Review it and regenerate when necessary. The hard spatial limit prevents a false positive lower down from erasing clothing. Generative edits can change unrelated details; original versions stay available and approval is manual.
