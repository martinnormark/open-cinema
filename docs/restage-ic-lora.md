# Re-stage IC-LoRA: a training plan

Re-stage today re-projects the take through its own depth and lets Lightricks' In-Outpainting IC-LoRA fill what the original camera could not see ([revision-modes.md](revision-modes.md#re-stage)). That holds for moves of a few tens of centimetres. Bigger moves, orbits and reverse shots need a model that has learned what the other side of a scene looks like. This is the plan for training that model ourselves, so it stays our own IP ([third-party-ip.md](third-party-ip.md)). Nothing here has been started.

## What the adapter learns

A V2V IC-LoRA on LTX 2.3 22B: the reference is the take from camera A, the target is the same moment from camera B, and the prompt names the move in a fixed vocabulary ("camera moves 30 degrees to the left, same height, same distance"). The reference latents ride along the target in self-attention, so the performance and timing come from the take and the new viewpoint from the weights. This is the same mode as Lightricks' Union Control and In-Outpainting adapters, trained with Lightricks' own trainer.

## Data we would need

Pairs must be ours, so no public multi-view dataset whose licence or subjects we do not own.

| Source            | How                                                                                                                       | Count                   | Notes                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Two-camera shoots | Two or three phones on tripods, synced by a clap, 1 to 4 m from the action, at known offsets (15°, 30°, 60°, 90°, 180°)   | 300 to 500 clips of 4 s | People we have releases for, varied rooms and outdoor light. The most valuable source: real faces, real cloth, real light. |
| Rendered scenes   | Our own 3D scenes in Blender with rigged characters we own (no Mixamo or marketplace assets), cameras on the same offsets | 1,000 to 2,000 clips    | Exact camera pairs and unlimited angles, including reverse shots. Teaches geometry; real footage teaches appearance.       |
| Our generations   | LTX takes from the app, turned into rendered scenes' first frames                                                         | Optional                | Only to widen style; never as targets on their own.                                                                        |

Each pair is cut to 97 frames (4 s at 24 fps), 768 px on the long side, the reference at half size (`--reference-downscale-factor 2`) to keep training and inference fast. Captions describe the move, not the scene.

## Trainer and compute

- [LTX Trainer](https://docs.ltx.io/open-source-model/ltx-trainer/ltx-training.md) from Lightricks' `LTX-2` repository, the `v2v_ic_lora` config, with `first_frame` conditioning at 0.2 so it also accepts a hand-made first frame.
- One 80 GB GPU (H100 or A100) for the standard config; a 32 GB card works with the low-VRAM config at a lower rank.
- Rank 64 to 128, about 3,000 to 6,000 steps, checked every 500 steps on a fixed set of held-out pairs from both sources. Budget a few hundred GPU hours across two or three rounds.

## Expected reach

- Orbits up to about 60° that keep faces: the first round, from the two-camera shoots plus renders.
- Reverse shots (180°): needs the rendered set, since the back of a scene is otherwise invented; expect faces seen from the side to drift and plan a face check after the run, as Restyle does.
- Moves well beyond what the re-projection graph manages (it tears past about half a metre), without the stretched edges re-projection leaves.

## What it replaces

The adapter would slot into the existing Re-stage composer and `video.restage` kind: the graph swaps the re-projection and fill for one LTX 2.3 pass with the new LoRA and the take as its guide, and the angle presets grow to cover larger moves.
