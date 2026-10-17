# Background replacement workflow

ComfyUI API-format graphs for the edit step of Open Cinema's `video.background-replace` workflow kind, and the `comfy-build.yaml` that packages them for the Comfy developer platform. The evaluation that chose them is in [docs/phase0-background.md](../../docs/phase0-background.md).

This folder holds only the edit graphs. The rest of the studio's job (the Bria matte through Router, the foreground lock and conform graphs on Comfy Cloud, and the LTX Alpha Gen path) is built in `packages/comfy/src/workflows/` and described in [docs/background-job.md](../../docs/background-job.md).

| File                                  | Graph                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `background-replace.api.json`         | **Default.** `LoadVideo` → `KlingOmniProEditVideoNode` (Kling 3.0 Omni video edit) with up to four Location references batched from `LoadImage` → `SaveVideo`.            |
| `background-replace-switchx.api.json` | Alternative. `LoadVideo` → `BeebleSwitchXVideoEdit` (`alpha_mode: auto`, one Location reference) → `SaveVideo` for the result and for the subject matte SwitchX used.     |
| `comfy-build.yaml`                    | Build definition: ComfyUI `v0.41.2`, no custom nodes, no local weights. Both graphs use partner (API) nodes that ship with core ComfyUI, recorded in `partnerNodePolicy`. |

## Inputs

Both graphs read `source.mp4` (the take) and `location-1.jpg` / `location-2.jpg` (the Location's approved references, establishing view first) from ComfyUI's input folder. The prompt states the new setting and everything that must stay. The studio sends the same request through Comfy Router directly; see `packages/comfy/src/workflows/background-replace.ts`, which builds the identical Kling request from a Location mention and keeps both paths in step.

Source limits: Kling edits 3–10 s clips, 720–2160 px per side, 24–60 fps, and returns 24 fps. SwitchX accepts up to 240 frames of at most ~2.77 MP and returns the source frame rate.

## Verification

- `comfy build validate` passes for `comfy-build.yaml` (offline).
- Both graphs were submitted to a local ComfyUI at `fc04da9` (CPU, partner calls through a loopback relay). Both passed ComfyUI's prompt validation with no node errors. The Kling graph was executed end to end on clip C5 of the evaluation set; the result and its comparison are in `artifacts/evaluation/background/runs/c5-comfyui-kling/` (ignored). The SwitchX graph was validated and then removed from the queue, because the same SwitchX request had already been measured through Router.
- No platform release has been cut. The exact release commands are in [docs/phase0-background.md](../../docs/phase0-background.md#packaging-status); a cut needs a signed-in Comfy workspace and the owner's go-ahead, because it cannot be undone.

## Running locally

```sh
comfy build validate workflows/background-replace
# In a ComfyUI checkout at v0.41.2 or later, signed in to a Comfy account (partner nodes bill API credits):
cp take.mp4 ComfyUI/input/source.mp4
cp establishing.jpg ComfyUI/input/location-1.jpg
cp alternate.jpg ComfyUI/input/location-2.jpg
curl -X POST http://127.0.0.1:8188/prompt -H 'content-type: application/json' \
  -d "{\"prompt\": $(jq 'with_entries(.value |= del(._meta))' workflows/background-replace/background-replace.api.json)}"
```
