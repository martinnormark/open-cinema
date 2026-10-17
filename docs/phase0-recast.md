# Phase 0: character recast

Evaluation of `video.character-replace` for issues #3 and #6, run on 2026-10-17 with the harness in [`evaluation/recast/`](../evaluation/recast/README.md) and scored with the shared [rubric](../evaluation/rubric.md) plus the recast addendum (identity through views, wardrobe intent, body fit, selection, gate G6 face-only). Every number below comes from [`evaluation/recast/results.md`](../evaluation/recast/results.md), which is generated from [`scores.json`](../evaluation/recast/scores.json) and the run evidence. The evidence itself (side-by-sides, contact sheets, metrics, identity measurements and Router logs) is in `artifacts/evaluation/recast/runs/<pipeline>/<clip>/` and is not committed.

The task: replace one selected person in a take with a saved Character, face **and** body, with an explicit wardrobe intent, while keeping that person's performance, everyone else, the background, objects, framing and camera.

## Recommendation

**Ship character recast in the MVP on Kling 3.0 Omni video edit, inside a narrow stated envelope: a clearly visible target whose face is seen at medium size or larger, wearing the Character's reference outfit.** Inside that envelope it passed every gate on all six clips, and across all ten clips it picked the right person every time (including the two-person and five-person clips where Kling O1 and HappyHorse picked wrong), kept performance frame for frame and left everything else intact. Outside it, it fails in three specific ways the product must refuse or warn about before spending credits: back-view-only targets, small distant faces, and "keep the original clothing" (ignored on both clips that asked for it).

Whole-body recast is real, not a face swap: hair, build and clothing change on every Kling run, so no run trips G6.

| Proposed bar (rubric)                     | Kling 3.0 Omni, whole set (10 clips) | Kling 3.0 Omni, inside the envelope (6 clips) |
| ----------------------------------------- | ----------------------------------- | --------------------------------------------- |
| ≥ 80 % of runs pass all gates             | **10 / 10**                         | **6 / 6**                                     |
| Median Preservation ≥ 3.0                 | 3.88                                | 3.81                                          |
| No protected criterion below 2 (passing)  | min 1 (U4: performance reversed)    | **min 3**                                     |
| Median Change ≥ 3.0                       | 3.7                                 | 3.9                                           |
| A1 reference fidelity ≥ 3 (passing)       | 6 / 10 (U4, U5, G4, G5 at 2)       | **6 / 6**                                     |
| Correct person selected                   | 10 / 10                             | 6 / 6                                         |
| Median protected PSNR (dB)                | 34.3 (18.2–37.4)                    | 31.0 (24.1–37.4)                              |
| Cost for a 5 s clip                       | $0.85                               | $0.85                                         |

So: the rubric bar is **met inside the envelope and not met across the whole set**. The bar can be met with the Router models available today; it cannot yet be shown for open weights (see [Open weights](#open-weights-not-tested)).

Caveats that matter for the release decision:

- **The evidence is narrow.** Ten clips of 5 s (five real Mixkit takes, five generated), two Characters, one run per clip, one reviewer, and that reviewer is an AI working from contact sheets at matched timestamps plus ArcFace and protected-region measurements. Treat "passes" as "good enough to put in front of users with a stated envelope", not as a measured production rate.
- **Likeness drifts older.** Mara's sheet is a woman in her early thirties; in three of seven Kling runs she reads ten to twenty years older (U4, G2, G5). The platinum "silver-white" hair is the likely cue. Characters with distinctive hair colour should carry an explicit age in their description, and the job should warn when the result's face similarity to the Character is low (below about 0.35 ArcFace).
- **Turnaround through the shared Router queue was 57–117 minutes tonight**, which misses the 60 minute deadline the workflow registry sets. See below.
- **The Router account ran out of credits at about 03:45 UTC** (`402 insufficient_credits`), which stopped the follow-up experiment on source wardrobe described below.

The default is wired: `video.character-replace` builds the Kling 3.0 Omni request in [`packages/comfy/src/workflows/character-replace.ts`](../packages/comfy/src/workflows/character-replace.ts) (tests in `apps/jobs/test/character-replace.test.ts`), and the equivalent ComfyUI graph is packaged in [`workflows/character-replace/`](../workflows/character-replace/README.md).

## Supported envelope

State this before generation; refuse or warn outside it.

| Dimension       | Supported                                                                                                 | Evidence                         |
| --------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Length          | 3–10 s per take (Kling's input limit). Longer takes must be split.                                        | Provider limit; tested 5 s       |
| Resolution      | 720 px or more on each side, up to 2160 px. Output is 1080p (`pro` mode).                                 | Provider limit; tested 720p in   |
| Frame rate      | 24–60 fps in; Kling returns 24 fps at the source length within one frame, so 25/30 fps takes need a conform. | U1, U2 (25), U3 (29.97)          |
| Target          | One person, selected by a description plus a point; the face seen at medium size or larger for part of the clip. | U1, U2, U3, G1, G2, G3           |
| Other people    | Up to five in frame, including one in direct contact with the target.                                     | U2 (five), U1, G2, G4            |
| Performance     | Talking, laughing, leaning, pointing, drinking, walking, dancing with spins, a jump.                      | U1, U2, G2, G1, U3, G5           |
| Occlusion       | The target fully hidden behind a pillar and a passer-by, then re-emerging.                                | G3                               |
| Interactions    | Hand-holding, a cup to the lips, an object handed over.                                                   | U4, G2, G4                       |
| Camera          | Locked-off, push-in, backward dolly, pan, orbit, handheld.                                                | U2, G2, G1, G3, G4, G5           |
| Aspect          | 16:9 and 9:16; framing is kept.                                                                           | U5 (9:16)                        |
| Wardrobe intent | **Reference outfit only.** "Keep the original clothing" is not honoured yet.                              | G4, U5                           |
| Character       | Up to four approved reference views; full-body first, then face, then three-quarter.                      | Mara (6 views), Theo (5 views)   |

Outside the envelope until measured: back-view-only targets (U4 failed), targets whose face stays small in a wide shot (G5 failed on likeness), keeping the source clothing (G4 and U5 failed), takes longer than 5 s, real dialogue with lip sync to audio (`keep_original_sound` is wired but untested), more than one recast in a take, and crowds.

## Pipelines compared

Six candidates on the two real multi-person clips (U1: a couple, recast the woman on the right; U2: five at a table, recast the blonde in the middle), then the strongest on the remaining eight clips. Rates are the published Router prices.

| Pipeline                                   | What it does                                                                 | Verdict                                                                                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kling 3.0 Omni edit** (`kling-v3-omni`)  | Video edit with the take as base and three Character views as references.    | **Recommended.** Right person on both screening clips, best preservation (protected faces 0.82–0.93), outfit and bob correct. $0.85 per 5 s.                                                                                       |
| Higgsfield Genjutsu (closed)               | Motion transfer from the take onto the Character, with a first-frame guide.  | Strongest likeness on U2 (ref_sim 0.71) and the closest performance match of all, but it **returns 4.71 s of a 5 s clip** (G3 on both), only half-transfers identity on U1 (ref_sim 0.23), and costs about $4.57 per 5 s at 720p. |
| Wan 2.7 video edit                         | Video edit with three reference images.                                      | Right person on both, half the price ($0.50), but other people's poses drift from the source (B2 = 2) and likeness is weaker (ref_sim 0.36–0.45). 30 fps output. Fallback candidate.                                            |
| Kling O1 edit                              | Same request on the previous Kling model.                                    | Rejected. **Recast the wrong person** on U1 (the man became Mara) and rewrote the table on U2 (cups and teapots removed, papers added). G4 on both.                                                                               |
| HappyHorse 1.0 video edit                  | Wan-family video edit.                                                       | Rejected. Turned **two** women into Mara on U2 (G4) and refused U1 under its content policy (G5).                                                                                                                                 |
| Runway Aleph 2 (FLUX 3 first-frame guide)  | Recast the first frame with FLUX 3, then propagate with Aleph.               | No result. The FLUX keyframe for U2 failed with a provider error; U1 was still queued when the account ran out of credits. At $2.00 per 5 s it was the most expensive open-ended option.                                          |

## Successes

- **Selection by words plus a side works on Kling 3.0 Omni.** The product sends no coordinates; `describeTarget` turns the creator's point into "on the left / in the centre / on the right of the frame" and appends it to their description. Kling 3.0 picked the right person on all ten clips, including U2's five people and U1, which Kling O1 got wrong.
- **Performance is kept.** Head turns, gaze, laughs, a cup to the lips (G2), pointing at shared papers (U2), a 360° turn and a jump (G5), and a spin-heavy dance behind foreground poppies (U3) all land on the source frames.
- **Everyone else is kept.** Where bystanders face the camera, their faces stay at 0.82–0.98 ArcFace similarity to the source, and on the generated clips the protected region is 35–37 dB PSNR, close to untouched.
- **Occlusion is handled.** In G3 Mara disappears behind a pillar and a man carrying a crate, then re-emerges with the same face, bob and jacket.
- **Interactions survive.** The handshake in U5, the box hand-off in G4 and the hand-hold in U4 keep their contact and timing with the new body.
- **Whole-character, not face-only.** Hair, build and wardrobe change on every run; Theo's beanie, glasses, beard and peacoat all arrive in G1.

## Failures

| Run                              | What went wrong                                                                                                                                                                  | Product response                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Kling 3.0, U4 (back view)        | The woman walking away becomes Mara **facing the camera while still walking away**, so her body is reversed against the hand-hold, and she reads twenty years older.             | Refuse or warn when the target's face is never visible.                                                             |
| Kling 3.0, G4 and U5 (keep clothing) | Asked to keep the source denim shirt (G4) and the black suit and tie (U5), Kling dressed Theo in his reference peacoat and beanie both times. The images win over the prompt. | Do not offer "keep original clothing" until the face-only reference variant (below) is measured.                    |
| Kling 3.0, G5 (wide shot)        | Body, outfit and motion are right, but the small face reads as an older woman, not Mara (ref_sim 0.16).                                                                           | Warn when the target is small in frame; check face similarity after the run and flag weak likeness.                 |
| Kling O1, U1                     | Wrong person recast; the other person restyled.                                                                                                                                  | Do not use O1 for recast.                                                                                           |
| HappyHorse, U2 / U1              | Two people recast; then a content-policy refusal.                                                                                                                                 | Not used.                                                                                                           |
| Genjutsu, U1 / U2                | Short by 7 frames; partial identity on U1.                                                                                                                                         | Not used unless Higgsfield fixes length (see trade-off).                                                            |
| All Kling runs                   | 24 fps output from 25 and 29.97 fps takes (same length within one frame), so B3 is 3 on those.                                                                                   | Conform to the source rate after the edit, as background replacement does.                                          |

The keep-clothing failure has a likely fix that could not be measured tonight: send only face views when the creator keeps the source wardrobe, because full-body and three-quarter views carry the reference outfit. The harness has it as `kling-v3-omni-faceref` in `evaluation/recast/tools/recast.py`; both submissions (G4, U5) were refused with `402 insufficient_credits`. The production builder still sends full-body views in that case.

## Higgsfield (closed API) trade-off

Higgsfield Genjutsu is the one closed model built for this task, and it shows: on U2 it gave the best likeness of any run (ref_sim 0.71, never below 0.63) and the most faithful performance. Against it:

- It returned 113 frames for a 125-frame take on both clips. A short result cannot be conformed without retiming the performance, which is gate G3.
- Identity transfer was inconsistent: on U1 it kept much of the source woman's face (similarity to the Character 0.23, to the source 0.23).
- At $0.97 per second of 720p it costs about five times Kling 3.0 Omni at 1080p.
- It is only reachable through a partner API, so there is no packaging or self-hosting path, the same as Kling.

Recommendation: keep it as a monitored alternative and re-test when it returns full-length clips; do not ship it as the default.

## Open weights (not tested)

The brief asks whether the bar can be met with open models (for example Wan 2.2 Animate's character replacement mode in a ComfyUI graph). This was **not measured**: Comfy Cloud workflow execution (`cloud.comfy.org`) is not authenticated from this environment, only the Router (`api.comfy.org`) is, and every Router video-edit model is a closed partner model. Wan 2.7 video edit, the nearest relative available, scored below Kling on preservation.

Product decision this leaves open: ship recast on a closed partner model now (Kling 3.0 Omni, about $0.85 per 5 s and no self-hosting), and run the open-weights comparison as soon as a Cloud workflow run is possible, using this same harness (`recast.py` takes a new pipeline in a few lines).

## Turnaround and cost

| Pipeline        | Rate                       | 5 s clip   | Turnaround tonight (submit to result)       |
| --------------- | -------------------------- | ---------- | ------------------------------------------- |
| Kling 3.0 Omni  | $0.168/s (6 Kling units)   | **$0.85**  | 68–117 min (median 96 min)                  |
| Kling O1        | $0.168/s                   | $0.85      | 62–74 min                                   |
| Wan 2.7 edit    | $0.10/s                    | $0.50      | 57–79 min                                   |
| HappyHorse edit | $0.14/s                    | $0.71      | 86 min                                      |
| Genjutsu        | $0.97/s (720p)             | $4.57      | 81–83 min                                   |

Turnaround is wall time from submission to downloaded result and is almost entirely the shared Router queue: eight overnight threads submitted into one account, and requests sat `IN_QUEUE` for over an hour before rendering. It is not the model's speed. The background-replacement thread measured the same Kling request through a packaged ComfyUI graph (partner-node path) at 176 s end to end. The 60 minute `deadlineMs` on `video.character-replace` is right for production; tonight's queue would have missed it on every run.

Router results carry no `X-Comfy-Credits-Used` header on the queued API, so costs here come from published rates and Kling's `final_unit_deduction` (6 units for every 5 s `pro` run).

## Packaging status

- **Request builder:** `packages/comfy/src/workflows/character-replace.ts`, registered as `video.character-replace` in the workflow registry with display model "Kling 3.0 Omni" and a 60 minute deadline. It takes the Character's approved references (identity, appearance and wardrobe roles; pose-only references are left out), orders them full body, front, face, three-quarter, rear, profile, sends at most four, stages the take as a fetchable URL, and keeps source audio when the creator preserves it.
- **ComfyUI graph:** [`workflows/character-replace/`](../workflows/character-replace/README.md), `LoadVideo` → `KlingOmniProEditVideoNode` with three padded references → `SaveVideo`, plus `comfy-build.yaml` (ComfyUI v0.41.2, partner node only). `comfy build validate` passes; the graph has not been executed and no release has been cut.
- **Estimate:** `packages/comfy/src/estimates.ts` reports about 35 credits per second of source video.

## Follow-ups

1. Add a pre-flight check in the composer: refuse back-view-only targets and warn on small faces, using the same person detection the harness uses (`tools/matte.py`).
2. Measure the face-only reference variant for "keep original clothing" (G4, U5) and, if it holds, switch the builder to it; until then hide that option.
3. Conform Kling's 24 fps output to the source frame rate.
4. After each run, compute face similarity of the result to the Character and to every protected person, and flag a weak likeness or a changed bystander instead of delivering silently. This catches the wrong-person failure class even though Kling 3.0 did not show it here.
5. Run the open-weights comparison (Wan Animate replacement through Comfy Cloud) once Cloud workflow runs are available.
6. Re-run the set on real dialogue takes with audio and on takes longer than 5 s.
