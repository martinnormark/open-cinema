# Reuse a performance (`video.performance-transfer`)

> **Replaced (2026-10-22):** this kind now ships as [Copy the moves](copy-the-moves.md) on Wan 3.0 and Wan Animate 2. The LTX graph below stays for runs made with it (`engine: "ltx-edges"`, the default when a stored request has no engine) but is no longer offered.

> **Deferred (2026-10-17):** results are not good enough yet; finding a better model, nodes or workflow is deferred. See [known-limitations.md](known-limitations.md).

Roadmap issue #10. The creator picks a clip, uploaded or generated, whose acting, choreography and timing they like, and gets a new clip in which a different Character performs it, optionally somewhere else. The source supplies only motion. Appearance comes from the keyframe and the prompt.

Status on 2026-10-17: the kind is registered, has tests, and its graph ran on Comfy Cloud twice: once with a pose skeleton, then, after the decision to rely on no other lab's weights, with edge tracing, which is the graph the app now builds. No composer UI exists for it yet.

**Decision (2026-10-17):** the competition entry relies on no third-party IP beyond Lightricks' own LTX weights and adapters, so motion is read by ComfyUI's built-in `Canny` node rather than DWPose or Depth Anything V2.

## Pipeline

LTX 2.3 Union Control IC-LoRA, run as an API-format ComfyUI graph on Comfy Cloud. It is built in `packages/comfy/src/workflows/ltx-performance-transfer.ts` and dispatched through `cloud-workflow` in the same way as the LTX Alpha Gen background pipeline.

```
source clip ─ first 8n+1 frames (≤ 97) ─ fit to ≤ 768 px, 64 px grid ─ ImageBlur ─ Canny (edges) ─┐
keyframe image ─ fit ─ LTXVImgToVideoInplace (frame 0) ─┐                                          │
                                                        └─ LTXVAddGuide (IC guide, strength, ◄─────┘
prompt + Element descriptions ─ Gemma 3 12B ─────────────── GetICLoRAParameters)
  ─ KSampler (8 steps, cfg 1, euler_ancestral / linear_quadratic) ─ crop guides ─ decode
  ─ result.mp4 (with the source's audio) + control.mp4 (the traced edges)
```

| Part         | File on Cloud                                                                     |
| ------------ | --------------------------------------------------------------------------------- |
| Checkpoint   | `ltx-2.3-22b-distilled-fp8.safetensors` (transformer, both VAEs, text projection) |
| Text encoder | `gemma_3_12B_it_fp4_mixed.safetensors` via `LTXAVTextEncoderLoader`               |
| IC-LoRA      | `ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors` (strength 1)               |
| Motion guide | ComfyUI core `ImageBlur` + `Canny`; no model weights                              |

The sampling half matches Comfy's Cloud template `video_ltx2_3_ic_lora` from github.com/Comfy-Org/workflow_templates. Lightricks' `example_workflows/2.3/LTX-2.3_ICLoRA_Union_Control_Distilled.json` reads pose with DWPose; Union Control also takes edges, which need no weights, so that is what this graph feeds it. LTX 2.5 has no Union Control or pose IC-LoRA on Cloud, so this uses 2.3. The other Cloud option is `ltx-2-19b-ic-lora-pose-control` for LTX 2.0 19B, which is an older model.

### Inputs

`{ source, character?, location?, firstFrame?, prompt, control: "edges" | "edges-detailed" = "edges", strength: 0.3–1 = 0.9, mentions }`

- **Keyframe.** If `firstFrame` is given (the app's FLUX keyframe), it is held exactly at frame 0 with strength 1. Without it, the Character's best whole-person reference is used (full-body, then front, then three-quarter, never the headless sheet) at strength 0.6, because that image was not composed for the shot. Without either, the clip is generated from the prompt and edges only. The 0.6 path has not been run live.
- **Prompt.** Edges carry no identity, so the text names who and where. The prompt has its mentions expanded, then the Character's and Location's descriptions are appended.
- **`edges`** blurs each frame (radius 4, sigma 2) before tracing with low thresholds (0.2/0.5), so texture such as fabric, hair strands and faces drops out and mostly outlines and large shapes remain. The keyframe and prompt then decide the look.
- **`edges-detailed`** traces the nearly sharp frame (radius 1, thresholds 0.4/0.8) for tighter blocking of hands and folds. It carries more of the original performer's look and has not been run live.
- **Build.** Unlike a skeleton, edges include the performer's outline, so the new Character's silhouette and build lean toward the original's.
- **Audio.** The output keeps the source's audio track, because the timing is the take's. The model's own generated audio is discarded.
- **Limits.** At most 97 frames (8n+1, about 4 s at 24 fps), a longer side of at most 768 px, sides on a 64 px grid. The ref0.5 adapter reads its guide at half size. A longer take is trimmed to its first 97 frames.

## Live verification (2026-10-17)

### Edge control (current graph)

- **Run `07fd708b-def0-433b-bbca-10995e1cc353`** used the same source, keyframe and prompt as pose run 2 below, with `control: edges` and strength 0.9. It completed in 24.8 s on a warm worker: 73 frames at 640×384. Evidence is in `/mnt/project-files/phase3/performance-transfer/edges/` (`side-by-side_source-edges-result.mp4`, `contact-sheet.jpg`, `result.mp4`, `graph.json`).
- **Motion.** The turn, back view, outstretched arms and return to the front follow the source as closely as with the skeleton.
- **Look.** Hair, jacket, trousers and shoes stay Mara's through the turn. The edge map is sparse (outline, a few interior lines, the horizon), so the source performer's grey sweater and hair did not leak into the result.
- **Face.** It is as soft at 384 px as with pose control; the fine-tune and upscale notes below still apply.

### Pose control (replaced)

The graph was submitted directly to `https://cloud.comfy.org/api/prompt` through `scripts/comfy-relay.ts`. Evidence is in `/mnt/project-files/phase3/performance-transfer/`.

- **Source.** `gen-spin-park.mp4`, an adult turning on the spot in a park, trimmed to 3.1 s and 640×360 at 24 fps (`source-3s.mp4`). I chose it over `U3-poppy-dance.mp4` because FLUX 3 Image twice returned the poppy-dance frame unchanged when asked to swap the dancer (see below).
- **Keyframe.** FLUX 3 Image on Router, given the source's first frame plus Mara's `front-full.jpg` and `face.jpg`. Output: `flux-keyframe.png`. One call took about 50 s.
- **Run 1 (`1bc523fb`) failed.** It used Lightricks' example models (`ltx-2.3-22b-dev.safetensors` bf16, `ltx-2.3-22b-distilled-lora-384-1.1` at 0.5, `gemma_3_12B_it` bf16, ONNX bbox detector). After about 30 s of execution, Cloud answered `ServiceError: RIP to the server your workflow was running on.` with no node id. The most likely cause is memory: the 46 GB bf16 checkpoint is read by three loaders, plus a bf16 Gemma. The ONNX annotator was also swapped out before run 2, so the cause is not isolated.
- **Run 2 (`6c5b1614-d350-486d-85c1-faf1d3989bab`) succeeded** with the current graph. It produced 73 frames at 640×384 and 24 fps in 28.5 s end to end (about 18 s of execution). The worker was warm and already had the checkpoint cached. Outputs: `result.mp4`, `pose-control.mp4`, `side-by-side_source-pose-result.mp4` (source | pose | result), `contact-sheet.jpg`, `result-closeups.jpg`, `keyframe-vs-frame0.jpg`, `graph.json`, `job-summary.json`.

What I observed in run 2:

- **Motion.** The turn, arm swings, steps and the final front-facing stance follow the source frame for frame. I saw no pose loss across the turn.
- **Keyframe.** Frame 0 matches the FLUX keyframe (Mara, the yellow jacket, the park).
- **Identity.** It holds at wardrobe level: white bob, mustard jacket, black top, olive trousers and white sneakers stay consistent through the back view and back to the front. The face is soft at 384 px. The blunt bangs from the reference become a swept bob after the turn, and the face looks smeared in the last frames. This is identity drift: the model carries hair colour and clothes, not a recognisable face.
- **Setting.** The result keeps the source park because the keyframe kept it. A Location change has to come from the keyframe, which FLUX composes, plus the prompt. The pose guide does not resist that change.

Cost: two Cloud runs (one crashed after about 40 s, one took 28 s) and three FLUX 3 Image calls (about 5–6 credits each). Comfy Cloud does not report a per-job charge to the API, so the estimate for this kind stays `heuristic` with `credits: null`.

### FLUX keyframe caveat

For `U3-poppy-dance.mp4`, FLUX 3 Image returned the source frame essentially unchanged on two attempts with different prompt orders. The dancer there may be a minor, and FLUX appears to decline to restyle that person instead of failing. The app's keyframe step should detect a keyframe that is nearly identical to the source frame and say so, rather than passing it on.

## Running it from the app

As with the Alpha Gen pipeline, the jobs Worker submits through Cloud's `/api/v2` routes. Those routes need a real `COMFY_API_KEY`; the development proxy's credential is refused there ([foundation.md](foundation.md)). This run went through the older `/api/prompt` route instead.

## What a custom IC-LoRA fine-tune could fix

- **Face identity.** Union Control was trained to follow structure, not identity, so the face is carried only by frame 0 and text and softens when the head turns. An IC-LoRA trained on pairs of (pose video + a reference portrait at `frame_idx -1`) → (video of that person) would keep the face through turns and back views. Training pairs could come from multi-view captures, or from our own Character sheets rendered through this pipeline and filtered by face similarity. A per-Character LTX LoRA from the LTX trainer is a cheaper first step for a recurring Character.
- **Body proportions.** Traced outlines come from the source performer, so a tall Character playing a short performer's take inherits that silhouette. A fine-tune on pairs whose edge guides come from differently built performers would loosen it.
- **Hands and fingers.** These are where pose-guided video usually breaks. They are fine at this size, but this one short run did not exercise them.

## Open problems

- The `edges-detailed` option, reference-keyframe-only generation (strength 0.6) and prompt-only generation have not been run live.
- Cold-start time is not measured; run 2 hit a worker that already had the checkpoint cached.
- 768 px is the cap for cost. A two-stage pass with `ltx-2.3-spatial-upscaler-x2-1.1` (as in Lightricks' two-stage examples) would sharpen faces and is the next quality step.
