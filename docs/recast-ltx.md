# Character recast on LTX 2.5 (experiment)

Tested on 2026-10-17. Can character recast run on open LTX weights with Lightricks' own adapters, and does that match the shipped Kling 3.0 Omni path ([phase0-recast.md](phase0-recast.md)) inside its envelope?

**Verdict: no, not yet.** The LTX graph keeps the performance frame for frame and leaves everyone else untouched, at about a seventh of Kling's price. But the Character's face does not survive past the first second. Its median likeness to Mara is 0.22, against 0.52 for Kling on the same four seconds, and 0.22 is in the range of strangers. The outfit is also only half right. The graph is therefore **not** wired into the jobs Worker. It stays a documented experiment that `scripts/ltx-graph.ts recast` can run. Kling 3.0 Omni remains the recast pipeline.

A custom IC-LoRA trained by us is the change most likely to close the gap. See [the proposal](#proposal-our-own-recast-ic-lora).

## The no-third-party-IP rule

The competition rules out depending on other people's IP. This graph therefore uses only:

- Lightricks' own adapters: the Union Control IC-LoRA (`ltx-2.3-22b-ic-lora-union-control-ref0.5`) and the Ingredients IC-LoRA (`ltx-2.3-22b-ic-lora-ingredients-0.9`). Lightricks' own LTX 2.5 example workflows (`ComfyUI-LTXVideo/example_workflows/2.5/`) load both of these 2.3 files onto the 2.5 transformer.
- Base models on Comfy Cloud: LTX 2.5 22B distilled, FLUX.2 Klein 9B and SAM 3.1.

Comfy Cloud also lists community LTX LoRAs that target recast directly, such as a head-swap IC-LoRA, masked-inpaint LoRAs and a dual-character LoRA. They were read but **not used**, because they are other people's work.

## The graph

`packages/comfy/src/workflows/ltx-recast.ts`, one API-format graph on Comfy Cloud:

```
take ─ first 97 frames ─ fit to ≤ 768 px ─ DWPose ─────────────────────────────┐
frame 0 + Character references ─ FLUX.2 Klein (4 steps) ─ keyframe ─┐          │
                                                                    ▼          ▼
LTX 2.5 distilled ─ Union Control IC-LoRA ─ [Ingredients IC-LoRA] ─ frame 0 = keyframe, pose guide at 0 (½ size),
  [sheet guide at -1] ─ 8 steps ─ decode ─ scale to the take's size
SAM 3: frame-0 box ─ track the marked person in the take and the Character in the result ─ union ─ grow 12 px
composite: generation inside the mask, the take's own pixels and audio everywhere else
```

- **Selection** uses a box, not words. The composer's pre-flight check already tracks the marked person with MoveNet, so the app has a frame-0 box. SAM 3 segments inside that box (`SAM3_Detect` with `bboxes`) and tracks that single object (`SAM3_VideoTrack` with `initial_mask`). Other people are never generated: their pixels are the take's.
- **Keyframe.** FLUX.2 Klein receives frame 0 plus the full-body and face references, with an instruction to change only the marked person.
- **Sheet** (`sheet: true`). This adds Lightricks' Ingredients adapter with the Character's reference sheet as a second guide at `frame_idx -1`, where it is attended to but never shown. The prompt opens with the adapter's own `### Reference Sheet Description` / `### Target Description` layout.

Offline check: both variants were submitted to a local ComfyUI built from `master` with ComfyUI-LTXVideo and comfyui_controlnet_aux installed and with placeholder model files. Both passed prompt validation, and execution stopped only at the first placeholder weights. Every node class and model name was also checked against Cloud's `/api/object_info` on the same day.

## Live runs

The clip is G2 (`gen-cafe-two.mp4`, 24 fps), which recasts the woman on the left as Mara. It is inside Kling's envelope: her face is visible at medium size, the wardrobe is the reference outfit, there are two people, a push-in, and a cup raised to her lips. Both runs used seed 42 and 97 frames (4.0 s). Generation ran at 768×432, and the composite was made at 1280×720. The graphs were submitted through `scripts/comfy-relay.ts` to `cloud.comfy.org/api/prompt`.

| Run                           | Job        | Wall time            | GPU time | Credits (0.266/s) | USD   |
| ----------------------------- | ---------- | -------------------- | -------- | ----------------- | ----- |
| Pose                          | `8679bcc9` | 88 s                 | 78.9 s   | 21                | $0.10 |
| Pose + sheet                  | `ce0b57d1` | 81 s                 | 71.8 s   | 19                | $0.09 |
| Kling 3.0 Omni (Phase 0, 5 s) | –          | 94 min, mostly queue | –        | –                 | $0.85 |

Kling was scored on its first 97 frames, so all three runs cover the same four seconds. `identity.py` (ArcFace) sampled every 4th frame:

| Measure (G2, 4 s)                                | Kling 3.0 Omni            | LTX pose                                          | LTX pose + sheet          |
| ------------------------------------------------ | ------------------------- | ------------------------------------------------- | ------------------------- |
| Likeness to Mara, median (min)                   | **0.515** (0.466)         | 0.215 (0.158)                                     | 0.188 (0.059)             |
| Likeness on frames 0 / 32 / 64 / 96              | 0.49 / 0.49 / 0.55 / 0.53 | 0.39 / 0.39 / 0.18 / 0.21                         | 0.35 / 0.36 / 0.11 / 0.10 |
| Similarity to the source woman (lower is better) | 0.156                     | 0.019                                             | 0.012                     |
| The man's face against the source                | 0.981                     | **0.990**                                         | **0.991**                 |
| Right person, nobody else changed                | yes                       | yes                                               | yes                       |
| Frame-exact timing                               | yes (24 fps)              | yes                                               | yes                       |
| Wardrobe                                         | reference                 | half: yellow vest under the source's denim jacket | same                      |

The guardrail thresholds in [evaluation/recast/guardrails.md](../evaluation/recast/guardrails.md) are calibrated on Human's FaceRes, not ArcFace. In both models, though, the LTX numbers sit in the "different people" range. The studio's likeness check rated Kling's G2 run strong (0.71). The LTX runs were not scanned with Human, but at these values they would very likely be flagged as weak.

Evidence is in `/mnt/project-files/recast-ltx/`: `g2-four-way.mp4` (source, Kling, LTX pose, LTX pose + sheet), `g2-closeups.jpg` (frames 8, 56 and 88), the keyframe, both results, the raw generation before compositing, the reference sheet, both graphs and the identity measurements. The full run folders are under the ignored `artifacts/recast-ltx/`.

### What works

- **Performance.** Gestures, the laugh, gaze direction and the cup to the lips land on the source frames. The pose guide holds the timing exactly, at the take's own 24 fps and frame count.
- **Everyone else.** The man, the background and the audio are the take's own pixels and samples, so they match the source better than Kling's (0.99 against 0.98). This held even though FLUX.2 Klein wrongly restyled the man on the keyframe as well. The composite threw that change away.
- **Cost and turnaround.** About $0.10 and 90 s for 4 s of video, against Kling's $0.85 per 5 s plus the Router queue.

### What fails

1. **Likeness decays.** The keyframe matches Mara at 0.51, as well as Kling does. By frame 0 of the video it is 0.39, after LTX's image compression and the VAE round trip. From about two seconds onwards it is 0.18–0.21: the platinum bob and freckles remain, but the face becomes a generic older blonde woman. Union Control was trained to follow structure, not identity, so nothing holds the face after frame 0. The same drift is recorded in [performance-transfer.md](performance-transfer.md).
2. **Ingredients does not fix it, and it adds artifacts.** With the sheet, likeness was lower (0.19, falling to 0.10). The cup turned translucent and doubled in the sip. Stacking a second IC-LoRA appears to compete with the pose guide. The sheet was also placed at `frame_idx -1`, while Lightricks' example places it at 0 with no other guide. Neither placement was tested against the other.
3. **The wardrobe is wrong at the keyframe.** FLUX.2 Klein kept the denim jacket and added a yellow vest under it, and LTX carried that forward. FLUX 3 on Router composed better keyframes in Phase 0 (`aleph2-keyframe`), at about 6 credits each.
4. **Composite seams.** The source's curly hair is wider than Mara's bob. Where the source mask ends, slivers of background and a hard edge show around the top of the head in some frames. A wider grow, or a soft edge from Alpha Gen's matte, would hide them.

## Proposal: our own recast IC-LoRA

The missing piece is an adapter that carries **identity** from a reference sheet through a performance. Nothing official does that today: Union Control carries structure, and Ingredients carries a scene inventory for generation, not edits. We would train it ourselves with Lightricks' LTX trainer, on data we generate, so it stays our own IP.

- **Base:** LTX 2.5 22B, IC-LoRA strategy, rank 64–128. IC-LoRAs require the distilled checkpoint at inference.
- **Conditioning:** two guides. (1) The DWPose skeleton video at `frame_idx 0` at half size, in the Union Control format, so motion keeps working as it does now. (2) The Character's three-panel sheet (the app's own format from [character-sheets.md](character-sheets.md)) at `frame_idx -1`. The text is the Character's description. Training it as one adapter avoids the conflict seen in failure 2.
- **Target:** a video of that Character performing that skeleton.
- **Training data, all generated by us:**
  1. With FLUX.2 Klein (or FLUX 3 on Router), make 300–500 synthetic Characters, each with a sheet in the app's format.
  2. For each one, generate 2–4 short clips (97 frames, 768 px) with LTX 2.5 image-to-video from a full-body keyframe, covering varied actions such as talking, walking, turning, drinking and gesturing.
  3. Extract DWPose from each clip. The training pair is (pose video + sheet) → clip.
  4. Keep only clips whose face stays at or above 0.6 ArcFace similarity to the sheet on every sampled frame, so the adapter learns identity that holds.
  5. Hold out 10 % of the Characters for evaluation.
  6. Optionally add consented captures of ourselves (front, side and back sheets plus performances) for realism.
- **Cost estimate:** about 1,000–2,000 LTX generations for data. At this graph's measured rate of about 20 credits per 4 s clip, that is roughly 20–40k credits ($100–200), plus FLUX sheets at about 6 credits each. The LTX trainer needs a Linux CUDA GPU and 500–2,000 steps. That means a few hours on a rented H100, which Comfy Cloud does not provide.
- **Expected benefit:** likeness through the whole clip at the level of the keyframe (about 0.5 ArcFace, Kling's level), the outfit from the sheet instead of the keyframe, and the composite and timing as now. That would make an open-weights recast at about $0.10 per 4 s that we own end to end. Turns and back views would also improve, because the sheet carries the back view. Kling's envelope excludes back views today.
- **Cheaper first step:** a standard per-Character LTX LoRA (20–30 images from the Character's sheet and portraits, same trainer) stacked with Union Control. It needs no new training format and would show within a day whether identity can be held. It needs one LoRA per Character, though, so it does not scale to every Character in a project.

## Smaller steps not yet tried

- Generate at 1024 px with Lightricks' x2 latent upscaler, so the face has more pixels. Kling outputs 1080p.
- Use FLUX 3 on Router for the keyframe, and pass the take's own source frame as a negative example of the wardrobe.
- Use the Alpha Gen matte on single-person takes to get softer composite edges.
- Lower the pose guide to 0.7, so the face and keyframe have more say.

## Running it

```sh
bun scripts/comfy-relay.ts &
bun scripts/ltx-graph.ts http://127.0.0.1:8790 artifacts/recast-ltx/run recast \
  source=<take.mp4> ref=<front-full.jpg>,<face.jpg> [sheet=<sheet.png>] box=0.153,0.129,0.362,0.869 \
  target="the woman with long dark curly hair in the denim jacket on the left" name=Mara \
  identity="..." wardrobe="..." action="..."
```

Add `submit-only=1` to check the graph against a local ComfyUI.
