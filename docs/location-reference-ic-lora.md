# Location reference IC-LoRA: a training plan

Reference shots run on Kling 3.0 Omni today, because Router's LTX 2.5 reads text only and no official LTX adapter takes a reference video of a place ([location-references.md](location-references.md#trade-offs)). Martin chose on 2026-10-17 to keep Kling for now and plan an adapter of our own, so reference shots can move to LTX without anyone else's weights ([third-party-ip.md](third-party-ip.md)). This is that plan. **Parked:** Martin decided on 2026-10-17 not to run it, as too expensive; nothing here has been started and Kling stays the model for reference shots.

## What the adapter learns

An IC-LoRA on LTX 2.5 22B. The reference is a Location's moving reference: a few seconds of the empty place with the camera moving through it. The target is a shot in the same place, with people in it, from a different camera. The prompt is the shot's own words: what happens, the staging and the camera move.

The first live Kling shot showed what to avoid: it took the light and the people from the words but copied the reference clip's camera path frame for frame. So the adapter must learn the **place** from the reference and the **camera** from the words:

- **Reference outside the target's timeline.** The reference latents sit before the target (as Lightricks' Ingredients adapter places its sheet, not frame-aligned as Union Control does), so there is no frame-to-frame correspondence to copy. Confirm the LTX trainer's IC-LoRA strategy supports this placement before any data is made; if it does not, the fallback is a frame-aligned reference with the camera paths deliberately mismatched (below).
- **Mismatched paths.** In at least 80 % of pairs the target's camera move differs from the reference's (a drift reference with a push-in target, a rise with a static wide). The rest match, so a creator who asks for the same move still gets it.
- **Different light and state.** A share of targets change the time of day or the weather, so light follows the words, as it did on Kling.

## Data we would need

Every pair is ours: no public multi-view dataset, scanned scene or marketplace asset.

| Source           | How                                                                                                                                                                                                                                                                              | Count                           | Teaches                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| Rendered places  | Our own Blender scenes (procedural rooms, streets, yards; our own rigged figures, no Mixamo or marketplace assets). For each place, render the three reference moves empty, then 2 to 4 shots with figures from other cameras, with exact camera paths written into the caption. | 300 to 500 places, ~1,500 pairs | Exact geometry and camera paths, reverse angles, rooms seen from every side. |
| Generated places | In the app: a Location from a description, its establishing still (FLUX 3), its push-in (LTX 2.5), then shots in that place made from the same still with a different move and people added (FLUX 3 edit, then LTX image-to-video).                                              | 400 to 600 places, ~1,200 pairs | Photographic look and the app's own style. Filtered hard (below).            |
| Real places      | Phone captures by us: walk each place empty along the three moves, then film consented people there from other positions.                                                                                                                                                        | 50 to 100 places, ~300 pairs    | Real light, real materials. Small but the best check that it transfers.      |

**Filter.** Keep a generated pair only if the target is the same place: MoGe-2 (MIT, already in Re-stage) estimates geometry from the reference's first frame and from the target's frames, and the pair is kept when the target's layout registers to the reference. The rest are dropped, then a quick human pass removes pairs where the architecture visibly changed.

**Format.** Targets cut to 97 frames (4 s at 24 fps), 768 px on the long side; the reference at half size (`--reference-downscale-factor 2`), 3 to 5 s. Captions are written like the app's prompts: the action, the staging ("she stands left of the door, we look past her shoulder, low sun behind her") and the camera move in the `LOCATION_MOVES` and camera-move vocabulary. They never describe the reference's own move. 10 % of places in each source are held out for evaluation.

## Trainer and compute

- [LTX Trainer](https://docs.ltx.io/open-source-model/ltx-trainer/ltx-training.md) from Lightricks' `LTX-2` repository, IC-LoRA strategy on the LTX 2.5 22B weights. IC-LoRAs run on the distilled checkpoint at inference, as Alpha Gen does today.
- Rank 64 to 128, 3,000 to 6,000 steps, checked every 500 steps on the held-out places.
- One 80 GB GPU (H100 or A100). Comfy Cloud does not train, so this needs a rented GPU: roughly a few hundred GPU hours across two or three rounds.
- **Data cost (generated places).** About 3,000 LTX clips and 1,500 FLUX stills. On the Cloud 22B graph at about 20 credits per 4 s clip ([recast-ltx.md](recast-ltx.md#proposal-our-own-recast-ic-lora)) that is roughly 60k credits for video plus 9k for stills, about $300 to $350. Router's LTX 2.5 at 720p costs about 5 times more per second, so data is made on Cloud.

## Pilot first

Before the full set, a pilot answers the one question that matters: does the camera follow the words while the place holds?

1. 50 rendered places and 50 generated places, about 300 pairs, all with mismatched paths.
2. 1,000 steps at rank 64.
3. On 10 held-out places, generate the same shot three ways: the adapter, Kling with the same references, and LTX text-only.
4. Measure camera following (MoGe-2 camera path of the result against the move the words asked for, and against the reference's path), place consistency (layout registration to the reference) and a side-by-side human rating.

The pilot costs about 600 generated clips (about $60 in credits) plus a day of GPU time. If the camera still copies the reference, the reference placement is wrong and is fixed before more data is made.

## Expected reach

- The place's layout and materials hold while the camera moves the way the words say, including moves the reference never made.
- Reverse angles and views from the far side of a room only as far as the rendered set covers them; a reference that never saw a wall cannot fix it.
- Faces stay where they are today: from text, or from a later Character adapter ([recast-ltx.md](recast-ltx.md#proposal-our-own-recast-ic-lora)). Characters are out of scope for this round.

## What it replaces

`video.reference` gains an LTX path: a Cloud graph with LTX 2.5 22B distilled, this adapter, the Location's move as the reference and the shot's words as the prompt, at about a fifth of Kling's price per second. **Picture from: References** and **Shoot from references** stay as they are; the model behind them switches once the adapter beats Kling on the pilot's measures, and Kling stays available for shots that also need a Character's face.
