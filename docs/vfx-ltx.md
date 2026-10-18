# Effects on a real take, built on LTX

Researched, built and check-run on 2026-10-18 for the competition's **VFX Workflow Built with LTX** prize, which asks for LTX as the workflow's core video model ([competition.md](competition.md#model-provider-bonuses)).

**Add an effect** is a sixth mode in Revise a shot. It runs LTX 2.3 on Comfy Cloud with one of Lightricks' own video-to-video IC-LoRAs, reading the creator's take as the reference frame by frame:

| Effect        | What it does                                                                          | Lightricks IC-LoRA                                |
| ------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Clear the set | Removes people and passing traffic and rebuilds the set behind them; can keep someone | `ltx-2.3-22b-ic-lora-clean-plate-1.0`             |
| Add water     | Rain, a flood, surf or spray, acting on the people and the set                        | `ltx-2.3-22b-ic-lora-water-simulation-0.9` at 1.4 |
| Day for night | The same shot relit as night                                                          | `ltx-2.3-22b-ic-lora-day-to-night-0.9`            |

The headline is **Clear the set**: a clean plate is everyday VFX work (paint-outs, removing extras and crew), and with SAM 3.1 keeping the lead actors' own pixels it gives a result an editor can cut straight in. LTX is the only model that generates pixels; SAM 3.1 only draws a mask.

## Survey: what LTX offers for VFX

Lightricks publishes its IC-LoRAs on Hugging Face under the LTX-2 community licence, which this project already accepts ([third-party-ip.md](third-party-ip.md)). Listed on 2026-10-18:

- **LTX 2.5** (`huggingface.co/api/models?author=Lightricks`): Clean Plate, Water Simulation, Day-To-Night, Alpha Gen, Layout-To-Render, Ingredients, Restore, Refine Details, Deblur, Decompression, Colorization, SDR-To-HDR, Pixel Spatial Upscaler, plus Cinemagraph and Slow-Motion-Control LoRAs.
- **LTX 2.3**: the same Clean Plate, Water Simulation, Day-To-Night, Deblur, Decompression, Colorization, HDR, Ingredients and Instant Shave, plus In-Outpainting, Union Control, Motion-Track-Control, Relight, DubIt and the Foley video-to-audio LoRA.
- **ComfyUI-LTXVideo** example workflows: for 2.5, Inpaint and Outpaint (two-stage), Union Control, Motion Track, Ingredients, single-stage V2V IC-LoRA, tiled-fusion upscale and HDR; for 2.3, `LTX-2.3_V2V_ICLoRA_Single_Stage_Distilled.json`, the graph every V2V IC-LoRA card points to.
- **Comfy Cloud's model library** (`/api/experiment/models/loras`) carries the 2.3 files: clean-plate, water-simulation, day-to-night, in-outpainting, union-control, motion-track-control, colorization, deblur, decompression and HDR all ran or are listed there. The 2.5 effect LoRAs are not listed, so this mode uses 2.3, the same base as Re-stage, Object Swap and Restyle.

Community LoRAs on Cloud such as `ltx2-atomic_explosion` have no clear licence and are out under the project's rule.

What the app already ran on LTX before this: Alpha Gen mattes for background replacement ([background-job.md](background-job.md)), Re-stage on In-Outpainting, Object Swap and Restyle on Union Control, performance transfer on edges, and LTX shots in Sequences ([revision-modes.md](revision-modes.md)).

## Candidates and the choice

1. **Effects through Lightricks' V2V IC-LoRAs (built).** One graph serves three effects a creator names as VFX. The take is the reference, so the camera and performance are kept by construction, and no keyframe or extra model is needed.
2. **Set extension with the Outpaint IC-LoRA.** Widen a 16:9 take to 2.39:1 or reveal more of the set. Re-stage already uses the same LoRA for its "Pull out" angle, so it adds less that is new.
3. **Element insertion with Motion-Track-Control or Alpha Gen.** Put fire, smoke or a creature onto a take along a drawn path. The motion-track card describes guiding motion in a generated video, not compositing onto footage, and an Alpha Gen element is a flat paste with no light or contact; both need a research pass before they look like VFX.

Option 1 won because it was the only one that produced shippable results on real takes in the first hour. Clear the set was better than expected; water and night needed the tuning below.

## The graph

`packages/comfy/src/workflows/ltx-vfx.ts` (`video.vfx`, model id `comfy-cloud/ltx-2.3-vfx`), exported to `workflows/cloud/vfx/`:

1. The take is trimmed to 97 frames (about four seconds) and scaled to 960 px on the long side (768 for night, its training size).
2. LTX 2.3 dev (fp8) loads the effect's IC-LoRA last, and `LTXVAddGuide` adds the take at full size from frame 0 (the cards' reference downscale factor is 1).
3. **Water and Clear the set** use Lightricks' own single-stage recipe: the distilled LoRA at 0.5, the eight-step distilled schedule, `euler_ancestral_cfg_pp`, CFG 1.
4. **Night** runs 30 steps of `LTXVScheduler` at CFG 3.5 with no distilled LoRA, as its card recommends. On the distilled recipe the sunny test take stayed sunny.
5. No upscale stage. The water card says the reference conditions only the first stage and a second stage drifts faces or erases the effect.
6. Clear the set with **Who stays** tracks those people with SAM 3.1 (`SAM3_VideoTrack`, mask grown 8 px) and puts the take's own pixels back over the clean plate there.
7. The result is scaled back to the take's size and saved with its frame rate and sound.

Prompts follow each card: water uses the training captions' "Reference shows … Edited shows … ADD WATER …" form; night and the clean plate describe the result ("A realistic nighttime version…", "The same scene with no …"), not the change.

`bun scripts/ltx-graph.ts <server> <out> vfx source=<clip> effect=water|night|clean-plate prompt="…" [keep="…"] [strength=…] [steps=30 cfg=3.5]` runs it without the job worker.

## Check runs

Real stock takes from the Phase 0 set (`phase0-recast/evidence/sources/` in the project files), 1280×720 at 25 fps, through the development relay. Times are wall clock including the queue.

| Take                                          | Effect and settings                                                                           | Time                                                                | Result                                                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U4, couple walking at sunset                  | Clear the set, distilled checkpoint, keep "the couple holding hands"                          | 59 s                                                                | Every passer-by and the pigeon gone, the arcade and pavement rebuilt behind them; the couple exactly as shot.                                                     |
| U1, couple at a wall                          | Water, distilled checkpoint, strength 1.2                                                     | 45 s                                                                | A wet sheen on the wall and jacket, no rain in the air. Too subtle.                                                                                               |
| U1                                            | Water, Lightricks recipe, 1.2                                                                 | 49 s                                                                | Same.                                                                                                                                                             |
| U1                                            | Water, Lightricks recipe, 1.4, vivid prompt                                                   | 48 s                                                                | Rain streaks through the frame, a soaked jacket, water sheeting on the ledge. The woman's red hair reads darker, as wet hair.                                     |
| U1                                            | Night, distilled checkpoint                                                                   | 38 s                                                                | Barely darker.                                                                                                                                                    |
| U1                                            | Night, Lightricks recipe                                                                      | 79 s                                                                | Barely darker.                                                                                                                                                    |
| U1                                            | Night, dev, 30 steps, CFG 3.5                                                                 | 62 s                                                                | Night: the street behind turns to lamp-lit bokeh, faces dim and cool.                                                                                             |
| U4, through the app (job worker, final graph) | Clear the set, keep "the couple holding hands", remove "the people walking in the background" | about 4 min submit to ready, including the upload and Cloud's queue | Passers-by gone, couple exact, 97 frames at 1280×720 and 25 fps, shown in the wipe viewer. Two pigeons in the foreground stayed, where the first run removed one. |

Comfy Cloud bills GPU time and reports no per-job cost; each run was about a minute of one GPU. Eight check runs and one app run in all. Evidence clips are in the project files under `vfx-ltx/`.

## Limits

- Only the first four seconds of a take are changed.
- Clear the set removes dynamic subjects across the whole frame. Someone who fills the frame cannot be cleared, and a person missing from the prompt can survive; naming them helps. Without **Who stays**, the leads are cleared too.
- Water and night change every pixel, people included, so faces can drift slightly; water at 1.4 darkens hair.
- Bright midday sun is the hardest case for night.
- No mask: water and night cannot be limited to part of the frame yet.

## Next

- Run Water and Night through the app on more takes, and add the face check (`checkPeople`) after them as Restyle has.
- Try the 2.5 Clean Plate and Water LoRAs if Cloud adds them.
- Set extension on the Outpaint IC-LoRA, as a fourth effect.
