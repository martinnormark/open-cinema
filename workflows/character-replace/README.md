# Character recast workflow

ComfyUI API-format graph behind Open Cinema's `video.character-replace` workflow kind, and the `comfy-build.yaml` that packages it for the Comfy developer platform. The evaluation that chose it is in [docs/phase0-recast.md](../../docs/phase0-recast.md).

| File                           | Graph                                                                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `character-replace.api.json`   | `LoadVideo` → `KlingOmniProEditVideoNode` (Kling 3.0 Omni video edit, `1080p` = Kling `pro` mode) with three Character references, each fitted to one 832×1248 canvas by `ResizeAndPadImage` and batched with `ImageBatch` → `SaveVideo`. |
| `comfy-build.yaml`             | Build definition: ComfyUI `v0.41.2`, no custom nodes, no local weights. The one partner node ships with core ComfyUI and is recorded in `partnerNodePolicy`.                                                                  |

## Inputs

The graph reads `source.mp4` (the take) and `character-1.jpg` (full body, the outfit to wear), `character-2.jpg` (face close-up) and `character-3.jpg` (three-quarter) from ComfyUI's input folder. References are padded rather than stretched, because `ImageBatch` rescales every image to the first one's size and a square face crop would otherwise be distorted.

The prompt names the person to replace in words plus a side of the frame, because Kling takes no coordinates. The example prompt is evaluation clip U1 (recast the woman on the right as Mara). The studio sends the same request through Comfy Router directly; see `packages/comfy/src/workflows/character-replace.ts`, which builds the prompt from the creator's selection and the Character mention and keeps both paths in step.

Source limits: 3–10 s, 720–2160 px per side; up to four reference images of 300 px or more, aspect between 1:2.5 and 2.5:1. Kling returns 24 fps at the clip's length within one frame.

## Verification

- `comfy build validate` passes for `comfy-build.yaml` (offline).
- Both node types exist in ComfyUI `v0.41.2` (`comfy_extras/nodes_images.py`, `comfy_api_nodes/nodes_kling.py`).
- The graph has not been executed in ComfyUI. Its Kling request is the one measured through Router in `evaluation/recast/` (`kling-v3-omni`), which sends the same model, mode, base video and reference views.
- No platform release has been cut. `comfy build push` and `comfy build release create` need a signed-in Comfy workspace and the owner's go-ahead.

## Running locally

```sh
comfy build validate workflows/character-replace
# In a ComfyUI checkout at v0.41.2 or later, signed in to a Comfy account (partner nodes bill API credits):
cp take.mp4 ComfyUI/input/source.mp4
cp full-body.jpg ComfyUI/input/character-1.jpg
cp face.jpg ComfyUI/input/character-2.jpg
cp three-quarter.jpg ComfyUI/input/character-3.jpg
curl -X POST http://127.0.0.1:8188/prompt -H 'content-type: application/json' \
  -d "{\"prompt\": $(jq 'with_entries(.value |= del(._meta))' workflows/character-replace/character-replace.api.json)}"
```
