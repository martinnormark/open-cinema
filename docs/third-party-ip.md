# Third-party IP

The rule for the competition entry: the app does not rely on other people's IP, so it uses **no LoRA made by someone else**. Base models from the platform and its model vendors are allowed, as are Lightricks' own official LTX adapters, since Lightricks makes the base model. The competition page asks for submissions "without unlicensed intellectual property" ([competition.md](competition.md)). Audited on 2026-10-17 against `packages/comfy/src/workflows`, `packages/comfy/src/flux-klein.ts` and the jobs Worker registry (`packages/comfy/src/workflows/index.ts`). Authors and licences are from each model's Hugging Face page.

## Verdict

- **Recasting stays.** `video.character-replace` runs Kling 3.0 Omni through Comfy Router with the Character's own references and no LoRA.
- **Background replacement stays, on both paths.** The Kling path is Kling 3.0 Omni (with Bria's matte for the as-shot variant) through Router. The LTX path is our own graph around Lightricks' official Alpha Gen IC-LoRA on the LTX 2.5 open weights.
- **Re-stage is rebuilt on our own graph.** It ran on Cseti's CrossView-Prompt IC-LoRA, which was removed. It now re-projects the take through MoGe-2 depth and fills the gaps with Lightricks' official In-Outpainting IC-LoRA ([revision-modes.md](revision-modes.md#how-each-mode-works)). It reaches small moves only; [restage-ic-lora.md](restage-ic-lora.md) is the plan for a re-staging IC-LoRA of our own.

## LoRAs

| LoRA                                                                             | Used by                                                         | Author                                                                                                                                               | Licence                   | Allowed         |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | --------------- |
| `ltx-2.5-22b-ic-lora-alpha-gen-0.9`                                              | Background replacement, LTX path                                | Lightricks ([LTX-2.5-22b-IC-LoRA-Alpha-Gen](https://huggingface.co/Lightricks/LTX-2.5-22b-IC-LoRA-Alpha-Gen))                                        | LTX-2.x Community License | Yes, official   |
| `ltx-2.3-22b-ic-lora-union-control-ref0.5`                                       | Object Swap, Restyle, performance transfer                      | Lightricks ([LTX-2.3-22b-IC-LoRA-Union-Control](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control))                                | LTX-2 Community License   | Yes, official   |
| `ltx-2-19b-lora-camera-control-*` (static, dolly in/out/left/right, jib up/down) | Camera moves on `video.ltx`                                     | Lightricks ([LTX-2-19b-LoRA-Camera-Control-Dolly-In](https://huggingface.co/Lightricks/LTX-2-19b-LoRA-Camera-Control-Dolly-In) and its six siblings) | LTX-2 Community License   | Yes, official   |
| `ltx-2.3-22b-ic-lora-in-outpainting-0.9`                                         | Re-stage (fills what the new camera sees that the take did not) | Lightricks ([LTX-2.3-22b-IC-LoRA-In-Outpainting](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-In-Outpainting))                              | LTX-2 Community License   | Yes, official   |
| `LTX2.3-22B_IC-LoRA-CrossView-Prompt_v0.9`                                       | Re-stage                                                        | Cseti ([LTX2.3-22B_IC-LoRA-CrossView-Prompt](https://huggingface.co/Cseti/LTX2.3-22B_IC-LoRA-CrossView-Prompt))                                      | Apache 2.0                | **No, removed** |

## Open weights run on Comfy Cloud

| Model                                                            | Used by                                                    | Provider                                  | Licence                     | Allowed                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------- | --------------------------- | ---------------------------- |
| LTX-2 19B distilled                                              | Camera moves                                               | Lightricks                                | LTX-2 Community License     | Yes                          |
| LTX 2.3 22B distilled                                            | Object Swap, Restyle, Re-stage, performance transfer       | Lightricks                                | LTX-2 Community License     | Yes                          |
| LTX 2.5 22B distilled, video and audio VAEs                      | Background replacement, LTX path                           | Lightricks                                | LTX-2.x Community License   | Yes                          |
| Gemma 3 12B (LTX-2, 2.3) and Gemma 4 12B (LTX 2.5) text encoders | Every LTX graph                                            | Google, packaged for LTX by Lightricks    | Gemma Terms of Use          | Yes, part of the LTX release |
| FLUX.2 Klein 9B, FLUX.2 VAE, Qwen 3 8B encoder                   | Object Swap and Restyle keyframe                           | Black Forest Labs                         | FLUX Non-Commercial License | Yes for the entry; see notes |
| FLUX 3 Klein, Qwen3-VL 4B encoder                                | Cloud connection check (`flux-klein.ts`)                   | Black Forest Labs, Qwen                   | BFL licence, Apache 2.0     | Yes                          |
| MoGe-2 ViT-L (`moge_2_vitl_normal_fp16`)                         | Re-stage geometry                                          | Microsoft Research (Ruicheng Wang et al.) | MIT                         | Yes                          |
| SAM 3.1 (`sam3.1_multiplex_fp16`)                                | Object Swap composite                                      | Meta                                      | SAM License                 | Yes                          |
| Depth Anything V2 Large (`depth_anything_v2_vitl`)               | Depth guide for Object Swap, Restyle, performance transfer | Depth Anything team                       | CC BY-NC 4.0                | Yes for the entry; see notes |
| DWPose (`dw-ll_ucoco_384`) with YOLOX-L detector                 | Pose guide for performance transfer                        | Yang et al., Megvii                       | Apache 2.0                  | Yes                          |

## Hosted models through Comfy Router

These are platform services the competition names ("Comfy API, Comfy Router"), not borrowed weights.

| Model                                 | Used by                                                                     | Provider          |
| ------------------------------------- | --------------------------------------------------------------------------- | ----------------- |
| `bfl/flux-3-image`                    | Image generation, character sheets, Location and Thing references           | Black Forest Labs |
| `bfl/flux-3-video`                    | Image-to-video from a first frame                                           | Black Forest Labs |
| `ltx/ltx-2-5-fast`, `ltx/ltx-2-5-pro` | Text-to-video                                                               | Lightricks        |
| `kling/kling-v3-omni`                 | Recast, background replacement (Kling path)                                 | Kuaishou          |
| `bria/video-edit-remove-background`   | Matte for the as-shot background variant                                    | Bria              |
| `beeble/switchx`                      | Background replacement, SwitchX path (measured in Phase 0, not the default) | Beeble            |

## What was removed

- **Cseti's CrossView-Prompt IC-LoRA**, Re-stage's former model. Its graph, prompt builder and model entry are deleted; Re-stage now runs on the graph described above.
- Nothing else: every other LoRA in use is Lightricks'. The Cameraman IC-LoRA had already been passed over for its non-commercial licence.

## Notes for Martin to confirm

- Hosted Router models (Kling, FLUX 3, LTX 2.5, Bria, SwitchX) are treated as platform services. The Open Weights Only category would exclude them; the other categories allow partner models.
- Two base weights are non-commercial: FLUX.2 Klein 9B and Depth Anything V2 Large. Both are licensed for this use and neither is a LoRA, but an Apache 2.0 swap exists for each (FLUX.2 Klein 4B, Depth Anything V2 Small) if a commercial launch needs it. Neither swap has been run.
- Re-stage can return as our own graph or our own IC-LoRA trained on LTX 2.3; see [revision-modes.md](revision-modes.md#custom-ic-lora-ideas).
