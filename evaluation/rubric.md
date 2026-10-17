# Selective video revision review rubric

Shared by every selective-revision evaluation in Phase 0 (issue #3): video background replacement (#5) and whole-character replacement. It scores **what was asked to change** and **what had to stay the same** separately, so a convincing replacement cannot hide a damaged take, and a perfectly preserved take cannot hide a replacement that did not happen.

The rubric is mode-agnostic. Each mode names its _target_ (the region that may change) and its _protected set_ (everything else) in its own evaluation notes:

| Mode                   | Target (may change)                                     | Protected set (must not change)                                                                                       |
| ---------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Background replacement | Setting behind and around the foreground                | Foreground people and Things: identity, appearance, action, timing; camera movement; framing                          |
| Character replacement  | One selected person (face, body, wardrobe as specified) | Other people, background, unrelated Things, framing, camera movement, timing; the selected person's action and intent |

## How to review

1. Review the **whole clip**, not a hero frame. Watch source and result side by side at full speed, then step through the contact sheet at matched timestamps (the harness emits both).
2. Score every criterion 0–4 using the anchors below. Write a one-line note for every score under 3 with the timestamp where it fails (`t=2.4s`).
3. Record a **gate failure** if any gate condition is met, regardless of scores.
4. Log the result in the mode's results log (one row per clip × pipeline run) with cost, turnaround, and the reviewer.

### Score anchors (all criteria)

| Score | Meaning                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| 4     | No visible problem at full speed or when stepping frames. Would ship as a creator's final.                 |
| 3     | Minor flaw visible only when stepping frames or looking for it. Usable without rework.                     |
| 2     | Flaw visible at full speed to an attentive viewer. Usable for drafts or previews, not finals.              |
| 1     | Obvious flaw that breaks the shot for most viewers.                                                        |
| 0     | Not attempted, wrong, or catastrophically broken (the change did not happen, or the subject is destroyed). |

## A. Change quality (the requested replacement)

| ID  | Criterion          | What a 4 looks like                                                                                                                                      |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Reference fidelity | The new background / character is recognisably the saved Element (layout, landmarks, materials / face, build, wardrobe), in the requested state.         |
| A2  | Plausibility       | Photographic and physically coherent: scale, perspective, horizon, and depth agree with the camera.                                                      |
| A3  | Integration        | Lighting direction and colour, contact shadows, reflections, and grain match between the change and the protected set; any integration change is scoped. |
| A4  | Temporal stability | The replaced region does not flicker, boil, morph, or drift across the clip.                                                                             |
| A5  | Motion consistency | The replaced region moves with the source camera (parallax, pan, push-in) and, for characters, follows the source performance.                           |

## B. Preservation (everything outside the change)

| ID  | Criterion          | What a 4 looks like                                                                                                        |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| B1  | Identity           | Every protected person keeps face, hair, build, and wardrobe; protected Things keep shape, colour, and detail.             |
| B2  | Performance        | Action, pose, gesture, expression, gaze, and lip movement match the source frame for frame.                                |
| B3  | Timing             | Same duration, frame count, and frame rate; events happen at the same timestamps (no drift, retiming, or dropped frames).  |
| B4  | Camera and framing | Same framing, camera path, lens character, and aspect ratio.                                                               |
| B5  | Edges              | Hair, hands, fingers, translucent and fast-moving edges are clean; no halo, matte chatter, or cut-outs.                    |
| B6  | Occlusion          | When something passes in front of or behind a protected subject, depth order is correct and the subject is restored after. |
| B7  | Interactions       | Contact with props and other people (holding, passing, sitting, leaning) survives intact.                                  |
| B8  | Unintended changes | Nothing outside the target changed that was not requested (added or removed objects, text, colour shifts, style drift).    |

## Gates (automatic fail for the run)

- **G1 No change:** the target was not replaced (A1 = 0).
- **G2 Identity loss:** a protected person is no longer recognisable at any moment (B1 ≤ 1).
- **G3 Timing break:** duration differs from the source by more than one source frame, or the action drifts or is retimed by more than one frame (B3 ≤ 1). A changed frame rate with matching duration and event timing is not a gate failure; score it under B3 (at most 3), because an editor must conform it.
- **G4 Hallucinated content:** a person, limb, or prominent object appears or disappears in the protected set (B8 ≤ 1).
- **G5 Policy or provider failure:** the run did not return a usable clip (rejection, error, timeout).

## Summary scores

- **Change score** = mean(A1–A5). **Preservation score** = mean(B1–B8). Report both; never average them together.
- **Weakest preservation criterion** is reported alongside the mean, because a single failure (for example B6 at 1) ruins a shot even when the mean looks fine.

## Objective measurements (support, not replace, review)

The harness computes these per run when a source foreground matte is available. They catch drift a reviewer can miss; they do not judge plausibility.

| Measure                      | Definition                                                                                                            | Supports   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------- |
| Protected-region PSNR / SSIM | Per-frame PSNR and SSIM between source and result inside the eroded protected mask; report median and 5th percentile. | B1, B2, B8 |
| Protected-region change rate | Share of frames whose protected-region PSNR falls below 30 dB.                                                        | B1, B8     |
| Target-region change         | Mean absolute difference inside the target mask (confirms the change happened).                                       | A1, G1     |
| Temporal flicker             | Mean frame-to-frame difference inside the target region, result minus source (positive = added flicker).              | A4         |
| Frame count / fps / duration | Read from container metadata for source and result.                                                                   | B3, G3     |

Region masks come from a matte of the **source** (never the result), so the measurement is not biased by the pipeline under test. Generative pipelines re-render the protected region, so their PSNR is expected to be lower than compositing pipelines even when they look right; read the numbers next to the review, not instead of it.

## Proposed MVP release bar (per mode)

To be confirmed against measured baselines in each mode's Phase 0 report:

- Across the representative evaluation set, at least **80 % of runs pass all gates**.
- Median **Preservation score ≥ 3.0** with **no protected criterion below 2** on a passing run.
- Median **Change score ≥ 3.0**, with **A1 (reference fidelity) ≥ 3** on a passing run.
- Supported envelope (length, resolution, scene conditions) is stated before generation; clips outside it are refused or warned, not silently attempted.

## Results log format

Each mode keeps `evaluation/<mode>/results.md` with one row per clip × pipeline run:

| Run ID | Clip | Pipeline | A1  | A2  | A3  | A4  | A5  | Change | B1  | B2  | B3  | B4  | B5  | B6  | B7  | B8  | Preservation | Gates | Cost (USD) | Turnaround (s) | Reviewer | Notes |
| ------ | ---- | -------- | --- | --- | --- | --- | --- | ------ | --- | --- | --- | --- | --- | --- | --- | --- | ------------ | ----- | ---------- | -------------- | -------- | ----- |

Evidence (clips, contact sheets, side-by-sides) lives in the ignored `artifacts/evaluation/<mode>/` folder; small reference stills may be committed under `evaluation/<mode>/stills/`.
