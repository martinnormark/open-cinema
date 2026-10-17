# Phase 0: background replacement

Evaluation of `video.background-replace` for issue #5, run on 2026-10-17 with the harness in [`evaluation/`](../evaluation/README.md) and scored with the shared [rubric](../evaluation/rubric.md). Every number below comes from [`evaluation/background/results.md`](../evaluation/background/results.md), which is generated from [`scores.json`](../evaluation/background/scores.json) and the run evidence. The evidence itself (side-by-sides, contact sheets, metrics and provider logs) is in `artifacts/evaluation/background/runs/<run>/` and is not committed.

## Recommendation

**Ship background replacement in the MVP as Kling 3.0 Omni video edit with Location references, followed by a foreground lock.** Through the Router path the app uses, this pipeline passes every gate on all five clips and meets the proposed release bar. Kling alone gives the best-looking result but fails the timing gate on three of five clips, because it always returns 24 fps and up to two source frames short.

Scores are for the Router runs unless marked.

| Proposed bar (rubric)                    | Kling + lock                | Kling alone              | SwitchX               | Bria composite       | Aleph 2 (text only) |
| ---------------------------------------- | --------------------------- | ------------------------ | --------------------- | -------------------- | ------------------- |
| ≥ 80 % of runs pass all gates            | **5 / 5**                   | 2 / 5 (G3 on C3, C4, C5) | 3 / 5 (G4 on C2, C4)¹ | 3 / 5 (G4 on C3, C4) | 5 / 5               |
| Median Preservation ≥ 3.0                | **3.88**                    | 3.62                     | 3.25                  | 3.50                 | 3.62                |
| No protected criterion below 2 (passing) | **min 3**                   | min 2                    | min 2                 | min 3                | min 1 (C5 reframed) |
| Median Change ≥ 3.0                      | **3.4**                     | 3.8                      | 3.4                   | 3.0                  | 3.4                 |
| A1 reference fidelity ≥ 3                | **3–4 on every clip**       | 3–4 on every clip        | 4 on every clip       | 3–4                  | 2 on every clip     |
| Median protected PSNR (dB)               | 37.7 (35.2–39.1)            | 25.1 (21.3–27.7)         | 17.8 (14.8–20.3)      | 38.9 (32.1–42.4)     | 18.4 (13.8–25.5)    |
| Cost for a 6 s clip                      | about $1.50 (Kling + matte) | $0.76                    | $0.71–0.86            | $0.31                | $2.45               |

¹ C1 SwitchX comes from the packaged ComfyUI graph; the Router run's tracking was lost to a connection reset. Wan 2.7 (C1, C3, C5) and BFL (C1, C3, C5) are covered under [Pipelines compared](#pipelines-compared).

The bar is met with caveats that matter for a release decision:

- **The lock trades relighting for preservation.** It composites the source performers back over Kling's background using a subject matte, so they keep their original light. Where the Location's light differs strongly from the take (C1: an overcast street to a dusk pier), the performers read as pasted on (A3 = 1). Where the light is similar (C2, C4) the lock costs nothing visible. The product should offer the unlocked Kling result as a variant, conformed to the source frame rate, and say which one preserves the performance exactly.
- **The evidence is narrow.** Five generated 6 s clips, one reviewer, and that reviewer is an AI working from contact sheets and 1:1 crops. No real camera footage was tested. Treat the pass as "good enough to put in front of users with a stated envelope", not as a measured production quality.
- **Kling's own output varies between runs.** The same C2 request removed the café completely through ComfyUI but left the seated patrons and café chairs at the left through Router (A1 = 3). Users should be able to rerun a take.
- **Turnaround through the shared Router queue failed the 60 min deadline tonight.** See below.

The default is already wired: `DEFAULT_BACKGROUND_PIPELINE = "kling"` in [`packages/comfy/src/workflows/background-replace.ts`](../packages/comfy/src/workflows/background-replace.ts). The foreground lock is not yet in the product; it exists as the evaluation composite in [`evaluation/scripts/run_background.py`](../evaluation/scripts/run_background.py) (`lock`). Building it into the job is the main follow-up.

## Supported envelope

State this before generation and refuse or warn outside it.

| Dimension  | Supported                                                                              | Evidence                       |
| ---------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| Length     | 3–10 s per take (Kling's input limit). Longer takes must be split.                     | Provider limit; tested 6 s     |
| Resolution | 720 px or more on the short side, up to 2160 px. Output is 720p in the packaged graph. | Provider limit; tested 720p    |
| Frame rate | 24–60 fps in; Kling returns 24 fps, so the lock or a conform restores the source rate. | C4 (25 fps) conformed exactly  |
| Camera     | Locked-off, slow push-in, handheld backwards track, orbit with strong parallax.        | C5, C4, C1, C3                 |
| People     | One or two performers, faces partly or fully visible.                                  | C1–C5                          |
| Occlusion  | A person crossing in front of the performer.                                           | C2 (waiter)                    |
| Things     | Held objects and a hand-off of an object across a table; props on the table stay.      | C3 (bicycle), C4 (box), C2 cup |
| Location   | One to four approved references of a saved Location, establishing view first.          | @Harbor (2 refs), @Greenhouse  |

Not tested, so outside the envelope until measured: real camera footage, takes longer than 6 s, fast action or whip pans, crowds, night exteriors, more than two performers, and dialogue audio (the graphs drop audio; the job should keep the source audio track).

Background extras behave inconsistently and should be stated as such: Kling kept the passers-by in C1 (re-rendered on the pier), and in C2 removed the seated café patrons in one run and kept them in another.

## Pipelines compared

Six candidates on C3 (orbit) and C5 (interview). Kling, SwitchX, Bria and Aleph then ran on all five clips, and Wan and BFL on C1 as well. Rates are the published Router prices; 211 credits = $1.

| Pipeline                         | What it does                                                        | Verdict                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kling 3.0 Omni edit** (+ lock) | Video edit with the take as base and Location stills as references. | **Recommended.** Best reference fidelity: opens on the exact @Harbor view and orbits through it. Keeps held objects, props and the occluding waiter. Mild relight.                                                                                                          |
| Beeble SwitchX                   | Mattes the performers, regenerates the background, relights them.   | Alternative only. Strong relight and parallax, but anything outside the matte is regenerated: the box became a laptop (C4), the table became marble (C2), red hair turned brown (C2).                                                                                       |
| Wan 2.7 video edit               | Video edit with one reference image.                                | Passes every gate on C1, C3 and C5 with convincing relight, 30 fps. Faces are re-rendered; on C1 the man looks noticeably different (B1 = 2). A fallback, not a default; not run on C2 or C4.                                                                               |
| Bria replace background          | Static composite of a still behind a matte.                         | Rejected as the default. Good on a locked-off camera (C2: the waiter and tray survive the matte), but the background is a frozen still, so moving cameras have no parallax (C3 A5 = 0, C1 A5 = 1), and the matte drops props (the bicycle wheel in C3, the lamp in C4: G4). |
| BFL video edit                   | Text-only edit.                                                     | Rejected. Invents a harbor instead of @Harbor (A1 = 1 on every clip), the original parking lot bleeds back late in C3 (G4), and on C1 the woman's head turns away (B2 = 2).                                                                                                 |
| Runway Aleph 2                   | Text-only edit.                                                     | Rejected. Passes the gates and keeps timing frame-exact at 1080p, but cannot use the Location's references, so every result is a generic place (A1 = 2). It reframed C5 (B4 = 1) and is the most expensive at $2.45 per 6 s.                                                |

## Successes

- **Location fidelity.** With references, Kling reproduces the saved Location's layout and keeps it consistent as the camera moves, including views the references never showed (C3 orbit, C1 track down the pier).
- **Occlusion and interaction.** The waiter crossing in front of the performer in C2, the cup to the lips, and the box slid, lifted and opened in C4 all survive Kling with no hallucinated objects.
- **Lock quality.** The locked result has a median protected PSNR of 37.7 dB with clean hair and hand edges at 1:1, and matches the source frame rate and length exactly on every clip.

## Failures

- **Kling timing.** Always 24 fps, and 2 frames short on C3, C4 and C5. Without a conform this fails G3 on 3 of 5 clips.
- **Relight under the lock.** C1 locked scores A3 = 1: daylight performers on a dusk pier.
- **SwitchX regenerates what is outside its matte.** The box in C4 became a laptop or metal device once opened, in both runs (B7 = 0, G4). In C2 the crossing waiter became a figure in the performer's own sweater (Router) or lost his tray (ComfyUI). This rules SwitchX out as the default for any take with props or other people.
- **Static composites.** Bria has no parallax on any moving camera, and its matte loses props.
- **Text-only edits** cannot hit a saved Location (BFL, Aleph).
- **Router queue waits.** Every C1, C2 and C4 Router run waited more than 90 min (see below). All completed and are scored, but a user would have seen a failure at the 60 min job deadline.

## Turnaround and cost

| Path                                               | Wall time for a 6 s clip                                                    |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Packaged ComfyUI graph, Kling (partner-node route) | 165–201 s (C1, C2, C4, C5)                                                  |
| Packaged ComfyUI graph, SwitchX                    | 164–315 s (C1, C2, C4)                                                      |
| Comfy Router queue, any model                      | C3/C5: 1,232–3,095 s. C1: 6,668–7,160 s. C2/C4: between 5,400 and 10,814 s² |
| Foreground lock (local composite, 4 CPU cores)     | 9 s (C4)                                                                    |

² The C2/C4 runner stopped polling at 5,400 s and the runs were collected later, so only the bounds are known.

Provider processing is a few minutes; the rest is queueing. The Router queue was shared by eight evaluation threads submitting at once, so tonight overstates its normal wait, but the result for a user is the same: at 60 min the job's deadline would have marked those runs failed (G5). Before release, measure the Router queue under normal load, and if it stays this slow, run the background job through the partner-node route the packaged graph uses.

Cost per 6 s clip: Kling $0.76 (5.4 Kling credits at $0.14), SwitchX $0.71–0.86, Wan $0.61, Bria $0.31, BFL $0.26, Aleph $2.45. The lock needs a subject matte; the evaluation used SwitchX's (about $0.86). Bria's remove-background matte would cost about $0.30 but dropped the bicycle wheel in C3, so it needs its own check before it replaces SwitchX as the matte source.

## Packaging status

The shipped path is the Router request the app already makes: `video.background-replace` in the workflow registry builds a `kling/kling-v3-omni` request from the take and the Location's references ([`definitions.ts`](../packages/comfy/src/workflows/definitions.ts), [`background-replace.ts`](../packages/comfy/src/workflows/background-replace.ts)). It needs no platform release.

The same workflow is packaged for the Comfy platform in [`workflows/background-replace/`](../workflows/background-replace/README.md): the Kling graph (default), the SwitchX graph, and `comfy-build.yaml` (ComfyUI v0.41.2, no models or custom nodes, the two partner nodes allowlisted). Both graphs ran end to end in a local ComfyUI on all clips above. As of this report, `comfy build validate workflows/background-replace` passes and `comfy build push workflows/background-replace --dry-run` reports nothing to upload.

**No release has been cut.** A release cannot be undone and needs the owner's signed-in Comfy workspace. To cut one, from the repository root on a machine signed in to that workspace (comfy-cli 1.22 or later):

```sh
comfy build validate workflows/background-replace
comfy build push workflows/background-replace          # creates the Build in the signed-in workspace
comfy build release create workflows/background-replace --target linux/nvidia --watch
comfy build release ls workflows/background-replace     # confirm the release and its status
```

If `push` records a Build id in `comfy-build.yaml`, commit it. Serving the release as an endpoint follows the `comfy-deploy` skill (`comfy skills show comfy-deploy`).

## Follow-ups

1. Build the foreground lock into the job: subject matte, time-map the Kling result to the source frame grid, composite, and keep the source audio.
2. Offer the unlocked Kling result as a variant for strong lighting changes, conformed to the source frame rate.
3. Repeat the evaluation on real camera footage and with a human reviewer before calling the envelope measured.
4. Measure Router queue time under normal load and decide the execution route.
5. Run Wan 2.7 on C2 and C4, which this evaluation skipped to limit queue load. The Router account ran out of credits after the evaluation finished, so no further runs were possible tonight; no planned run was lost to credits.
