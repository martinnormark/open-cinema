# Character recast workflow

ComfyUI API-format graph behind Open Cinema's `video.character-replace` workflow kind, and the `comfy-build.yaml` that packages it for the Comfy developer platform. The evaluation that chose it is in [docs/phase0-recast.md](../../docs/phase0-recast.md).

| File                                                 | Graph                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `character-replace.api.json`                         | `LoadVideo` → `KlingOmniProEditVideoNode` (Kling 3.0 Omni video edit, `1080p` = Kling `pro` mode) with three Character references, each fitted to one 832×1248 canvas by `ResizeAndPadImage` and batched with `ImageBatch` → `SaveVideo`.                       |
| `comfy-build.yaml`                                   | Build definition: ComfyUI `v0.41.2`, no custom nodes, no local weights. The one partner node ships with core ComfyUI and is recorded in `partnerNodePolicy`.                                                                                                    |
| `minimax-h3-ref.cloud.json`                          | Snapshot (2026-10-30) of the "MMAX3 ref" workflow in the project's Comfy Cloud account: Comfy's MiniMax H3 Reference to Video template with a recast prompt. Editor format, kept as the baseline the app's H3 graph was reconciled against. Not run by the app. |
| `wan21-scail2-character-replacement-int8.cloud.json` | Comfy Cloud template "SCAIL-2 Int8: Character Replacement" (Wan 2.1 14B), fetched 2026-10-30. The baseline the app's Wan recast graph was reconciled against. Not run by the app.                                                                               |
| `wan22-animate-character-replacement.cloud.json`     | Comfy Cloud template "Wan2.2 Animate, Character Animation and Replacement" (SAM 2 points, DWPose, relight LoRA), fetched 2026-10-30. Kept for comparison; not used by the app.                                                                                  |
| `wan22-animate-auto-character-replace.cloud.json`    | Comfy Cloud template "Wan2.2 Animate: Automatic Character Replacement" (ViTPose, SAM 2.1), fetched 2026-10-30. Kept for comparison; not used by the app.                                                                                                        |

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

## MiniMax H3 alternative

The studio can switch a recast between this Kling edit (**Edit the take**, the default), MiniMax H3 on open weights (**Regenerate the shot**) and Wan SCAIL-2 (**Replace the performer**, [below](#wan-scail-2-alternative)), set by `pipeline` on `video.character-replace` (`kling`, `minimax-h3` or `wan-scail2`). The H3 path is a Comfy Cloud graph built by [`packages/comfy/src/workflows/minimax-h3-recast.ts`](../../packages/comfy/src/workflows/minimax-h3-recast.ts) and exported to [`cloud/recast/minimax-h3.api.json`](../cloud/recast/minimax-h3.api.json). Both results go through the same conform stage, which puts them on the take's frame rate and frame count with the take's own sound.

What the app's graph changes from `minimax-h3-ref.cloud.json`, and why:

| Template                                                                    | App graph                                                                                                                                                  | Reason                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LoadVideo` → `GetVideoComponents`, frames at the take's rate               | `VHS_LoadVideoFFmpeg` with `force_rate` 24                                                                                                                 | H3 reads reference videos as 24 fps. The template's run fed a 30 fps take, so H3 saw it 25 % slower.                                                                   |
| `ResolutionSelector` 16:9 at 0.4 MP                                         | The take's own aspect at about H3's 768p area (1344 × 768), multiples of 32, never above the take's size                                                   | The template's run turned a 486 × 864 portrait take into 864 × 480 landscape.                                                                                          |
| Duration fixed at 5 s                                                       | The take's frame count rounded up to H3's 17k + 5 grid (at least 124, up to 362), then trimmed back to the take's length                                   | The whole take is recast, up to 15 s.                                                                                                                                  |
| One video (a SAM colour-tracks clip) and the prompt "the person in Video 1" | Video 1 is the take with its sound; Video 2 is SAM 3.1's track of the clicked person filled in red; the prompt names "the person filled in red in Video 2" | The template's run recast both tracked players as the Character. The click (and the studio's person box) picks one person; the tracker is the one Copy the moves uses. |
| One character sheet                                                         | Up to four approved views, close portrait first, with the sheet guide wording                                                                              | Same reference order as the Kling path.                                                                                                                                |
| H3's generated audio decoded and muxed                                      | Not decoded; the take's sound is laid under the result (only when the creator keeps audio)                                                                 | The recast keeps the original sound.                                                                                                                                   |
| Turbo LoRA switch (off)                                                     | Not included                                                                                                                                               | Kept to the template's run settings: `res_multistep`, `simple`, 20 steps, `BasicGuider`, `match` reference size.                                                       |

The int8 video VAE the template loads is missing from Cloud's `object_info` list but ran there (job `91dfbd38`); `validate-workflows.ts` reports it as a note.

Test run, 2026-10-30 (Comfy Cloud job `951328dc`): the football take behind the template's run (1080 × 1920, 30 fps, 6.1 s, with sound), the player in pink clicked on frame 0 and recast as a man from a sheet and its portrait. H3 rendered 768 × 1344 for the whole take in about 23 minutes (20 steps). Only the clicked player was recast, in portrait, with the outfit from the sheet; the other player kept his kit and his tackle, and the ball and camera followed the take. In the last second the ball sits at his feet where the take has it rolling away. After the conform stage the result is 1080 × 1920, 30 fps, 182 frames, the take's own frame count, with its sound. Results are in `artifacts/recast-tests/` (git-ignored). Every pixel is still generated, so other people and the background are redrawn rather than kept ([recast-minimax-h3.md](../../docs/recast-minimax-h3.md)).

## Wan SCAIL-2 alternative

`pipeline: "wan-scail2"` runs [`packages/comfy/src/workflows/wan-scail-recast.ts`](../../packages/comfy/src/workflows/wan-scail-recast.ts), exported to [`cloud/recast/wan-scail2.api.json`](../cloud/recast/wan-scail2.api.json). Of the Wan replacement templates on Comfy Cloud, SCAIL-2 was chosen because it already tracks people with SAM 3.1 and swaps them inside the take ("replacement mode"); the Wan 2.2 Animate templates need SAM 2 points from the editor and pose detectors.

What the app's graph changes from `wan21-scail2-character-replacement-int8.cloud.json`:

| Template                                                                           | App graph                                                                                                                      | Reason                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| SAM 3.1 tracks every "human" by text, in each segment                              | SAM 3.1 tracks the person the creator clicked (with the studio's person box), once over the whole take                         | A text prompt marks everyone; SCAIL-2 would replace every person in the shot.                                                              |
| The reference image is a studio photo of the character, its mask from SAM 3.1 text | FLUX 3 Klein redraws the clicked frame with the Character in that person's place; SAM 3.1 masks them there from the same click | The Character's views include a headless sheet; a keyframe in the take's own light, scale and pose gives SCAIL-2 one whole person to copy. |
| Base and extend subgraphs, one segment each; the creator adds more by hand         | Every segment unrolled when the graph is built (81 frames, 5 of overlap, each later one colour-matched to the one before)      | The whole take is recast, up to 10 s.                                                                                                      |
| The take at its own frame rate                                                     | The take on a 24 fps grid, then the conform stage puts the result on the take's frame rate                                     | The segment plan needs a known frame count; the studio sends the take's length.                                                            |
| Turbo switch                                                                       | The turbo preset (lightx2v distill LoRA at 0.8, 6 steps, cfg 1) with the DPO LoRA                                              | The template's own fast settings.                                                                                                          |

Test run, 2026-10-30 (job `8e2cc3e9`), same take, click and Character as the H3 run: 512 × 896 for 145 frames in two segments, in 137 s. The Klein keyframe put the Character in the player's place in the take's light, and SCAIL-2 kept him there through the whole take with the take's framing, background, ball and timing. One defect: the other player's white kit turned lavender, so SCAIL-2 also changes people it was not asked to replace. After the conform stage: 1080 × 1920, 30 fps, 182 frames, with the take's sound.

A ComfyMathExpression whose values leave out `a` passed validation but silently skipped everything downstream on Cloud during the first test; `validate-workflows.ts` now rejects that.
