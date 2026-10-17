# Phase 0: background replacement

Evaluation of `video.background-replace` for issue #5, run on 2026-10-17 with the harness in [`evaluation/`](../evaluation/README.md) and scored with the shared [rubric](../evaluation/rubric.md). Every number below comes from [`evaluation/background/results.md`](../evaluation/background/results.md), which is generated from [`scores.json`](../evaluation/background/scores.json) and the run evidence. The evidence itself (side-by-sides, contact sheets, metrics and provider logs) is in `artifacts/evaluation/background/runs/<run>/` and is not committed.

## Recommendation

**Ship background replacement in the MVP as Kling 3.0 Omni video edit with Location references, followed by a foreground lock.** On the five-clip set this pipeline passes every gate on every clip and meets the proposed release bar. Kling alone gives the best-looking result but fails the timing gate on three of five clips, because it always returns 24 fps and up to two source frames short.

| Proposed bar (rubric)                    | Kling + lock                | Kling alone              | SwitchX          |
| ---------------------------------------- | --------------------------- | ------------------------ | ---------------- |
| ≥ 80 % of runs pass all gates            | **5 / 5**                   | 2 / 5 (G3 on C3, C4, C5) | 4 / 5 (G4 on C4) |
| Median Preservation ≥ 3.0                | **3.88**                    | 3.62                     | 3.25             |
| No protected criterion below 2 (passing) | **min 3**                   | min 2                    | min 2            |
| Median Change ≥ 3.0                      | **3.4**                     | 3.8                      | 3.4              |
| A1 reference fidelity ≥ 3                | **4 on every clip**         | 4 on every clip          | 4 on every clip  |
| Median protected PSNR (dB)               | 37.6 (35.2–39.1)            | 24.7 (20.3–27.7)         | 15.5–20.3        |
| Cost for a 6 s clip                      | about $1.50 (Kling + matte) | $0.76                    | $0.71–0.86       |

The bar is met with caveats that matter for a release decision:

- **The lock trades relighting for preservation.** It composites the source performers back over Kling's background using a subject matte, so they keep their original light. Where the Location's light differs strongly from the take (C1: an overcast street to a dusk pier), the performers read as pasted on (A3 = 1). Where the light is similar (C2, C4) the lock costs nothing visible. The product should offer the unlocked Kling result as a variant, conformed to the source frame rate, and say which one preserves the performance exactly.
- **The evidence is narrow.** Five generated 6 s clips, one reviewer, and that reviewer is an AI working from contact sheets and 1:1 crops. No real camera footage was tested. Treat the pass as "good enough to put in front of users with a stated envelope", not as a measured production quality.
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

Background extras behave inconsistently and should be stated as such: Kling kept the passers-by in C1 (re-rendered on the pier) and removed the seated café patrons in C2.

## Pipelines compared

Six candidates on C3 (orbit) and C5 (interview), then the two strongest, Kling and SwitchX, on all five clips. Rates are the published Router prices; 211 credits = $1.

| Pipeline                         | What it does                                                        | Verdict                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kling 3.0 Omni edit** (+ lock) | Video edit with the take as base and Location stills as references. | **Recommended.** Best reference fidelity: opens on the exact @Harbor view and orbits through it. Keeps held objects, props and the occluding waiter. Mild relight.                    |
| Beeble SwitchX                   | Mattes the performers, regenerates the background, relights them.   | Alternative only. Strong relight and parallax, but anything outside the matte is regenerated: the box became a laptop (C4), the table became marble (C2), red hair turned brown (C2). |
| Wan 2.7 video edit               | Video edit with one reference image.                                | Good on the orbit, convincing relight, 30 fps. Faces slightly re-rendered. A reasonable fallback; not run on C1, C2, C4.                                                              |
| Bria replace background          | Static composite of a still behind a matte.                         | Rejected. The background is a frozen still, so moving cameras have no parallax (C3 A5 = 0), and the matte dropped the bicycle wheel (G4).                                             |
| BFL video edit                   | Text-only edit.                                                     | Rejected. Invents a harbor instead of @Harbor (A1 = 1), and the original parking lot bleeds back late in C3 (G4).                                                                     |
| Runway Aleph 2                   | Text-only edit.                                                     | Rejected. Generic location, reframed C5 (B4 = 1), and the most expensive at $2.45 per 6 s.                                                                                            |

## Successes

- **Location fidelity.** With references, Kling reproduces the saved Location's layout and keeps it consistent as the camera moves, including views the references never showed (C3 orbit, C1 track down the pier).
- **Occlusion and interaction.** The waiter crossing in front of the performer in C2, the cup to the lips, and the box slid, lifted and opened in C4 all survive Kling with no hallucinated objects.
- **Lock quality.** The locked result has a median protected PSNR of 37.6 dB with clean hair and hand edges at 1:1, and matches the source frame rate and length exactly on every clip.

## Failures

- **Kling timing.** Always 24 fps, and 2 frames short on C3, C4 and C5. Without a conform this fails G3 on 3 of 5 clips.
- **Relight under the lock.** C1 locked scores A3 = 1: daylight performers on a dusk pier.
- **SwitchX regenerates handled objects.** Its matte holds only people, so the box in C4 became a laptop once opened (B7 = 0, G4). This rules SwitchX out as the default for any take with props.
- **Static composites.** Bria fails every moving camera.
- **Text-only edits** cannot hit a saved Location (BFL, Aleph).
- **Router queue timeouts.** C1, C2 and C4 runs for Bria, Wan, Kling, BFL and Aleph were still queued after 90 min (see below). They are recorded as unfinished, not scored.

## Turnaround and cost

| Path                                               | Wall time for a 6 s clip                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| Packaged ComfyUI graph, Kling (partner-node route) | 165–201 s (C1, C2, C4, C5)                                                 |
| Packaged ComfyUI graph, SwitchX                    | 164–315 s (C1, C2, C4)                                                     |
| Comfy Router queue, any model                      | 1,232–3,095 s for the C3/C5 runs; C1/C2/C4 runs still queued after 5,400 s |
| Foreground lock (local composite, 4 CPU cores)     | 9 s (C4)                                                                   |

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
5. Re-score C1, C2 and C4 for the other pipelines if their queued Router runs return.
