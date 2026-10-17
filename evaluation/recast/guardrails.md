# Recast guardrails

The studio checks a shot before a recast is sent and checks the result before the creator keeps it. Both run in the browser on a Web Worker with [Human](https://github.com/vladmandic/human) 3.3.6 (MIT): BlazeFace for faces, FaceRes for 1024-d face descriptors (cosine similarity), and MoveNet MultiPose for people and shoulder keypoints. Code: [shot-checks.ts](../../apps/web/src/features/revision/shot-checks.ts) (pure rules and thresholds), [shot-detector.ts](../../apps/web/src/features/revision/shot-detector.ts) (models). The checks are guidance for review, not a verdict.

## Pre-flight (composer)

Ten frames are sampled evenly; the marked person is found on the frame nearest the mark and followed by box overlap.

| Verdict              | Rule                                                                     | Why                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| refuse (`back-view`) | No tracked frame shows their face and at least 60% show them from behind | U4: every pipeline invented a face; nothing to check likeness against                                                                  |
| warn (`small-face`)  | Their median detected face is under 15% of the frame height              | G5 (0.11) gave the only weak likeness in Phase 0; U3 at 0.19 held. A median, because one close frame on a spin does not carry the shot |
| warn (`partly-away`) | Half or more of the tracked frames are from behind                       | Identity drifts on turns                                                                                                               |
| unmatched            | Nobody under the mark                                                    | Ask the creator to mark again                                                                                                          |

Facing comes from shoulder order (facing the camera, their left shoulder is on the image's right). MoveNet places a nose on the back of a head, so the nose score is not used.

## Result checks (result view)

The result is sampled at the same proportional times as the source and compared frame by frame. Similarity calibration on the Phase 0 frames and the Character references: the same person scored 0.60–0.97, different people 0.22–0.59, and strangers against Mara or Theo had a median of 0.33 and a maximum of 0.50.

| Check                   | Rule                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Likeness                | Median best match of the recast face to the approved references: weak < 0.50, fair < 0.62, strong ≥ 0.62                                                                                                                       |
| Marked person unchanged | Median match to the source person ≥ 0.62                                                                                                                                                                                       |
| Another person changed  | A bystander's face, matched in the result by overlap (IoU ≥ 0.25, never the recast face), has a median self-match < 0.50 over at least two frames. Source faces that match the target (≥ 0.60) are the target, not a bystander |
| Wrong person            | A bystander matches the Character at 0.55 or more, and better than they match themselves; they also count as changed                                                                                                           |

## Phase 0 replay

`bun evaluation/recast/tools/guardrails-eval.ts scans.json refs.json`, on scans of all 18 Phase 0 runs. Review truth from [docs/phase0-recast.md](../../docs/phase0-recast.md): Kling 3.0 Omni on U1 and U2 was clean; Kling O1 on U1 recast the wrong person and restyled the other; HappyHorse on U2 recast two people; G5 lost likeness.

| Clip                  | Run             | Pre-flight         | Evidence                         | Likeness    | Still source   | Bystanders            | Wrong person |
| --------------------- | --------------- | ------------------ | -------------------------------- | ----------- | -------------- | --------------------- | ------------ |
| U1-couple-wall        | source          | ok                 | 5/5 face, 0 back, typical 0.40   |             |                |                       |              |
| U1-couple-wall        | aleph2-keyframe |                    |                                  | 0.57 fair   | 0.53 (yes)     | 0.93                  |              |
| U1-couple-wall        | genjutsu        |                    |                                  | 0.57 fair   | 0.53 (yes)     | –                     |              |
| U1-couple-wall        | kling-o1        |                    |                                  | 0.58 fair   | 0.53 (yes)     | 0.32✗                 | yes          |
| U1-couple-wall        | kling-v3-omni   |                    |                                  | 0.64 strong | 0.50 (yes)     | –                     |              |
| U1-couple-wall        | wan27-edit      |                    |                                  | 0.66 strong | 0.39 (yes)     | –                     |              |
| U2-group-table        | source          | ok                 | 10/10 face, 0 back, typical 0.24 |             |                |                       |              |
| U2-group-table        | genjutsu        |                    |                                  | 0.65 strong | 0.46 (yes)     | 0.86 0.95 0.77 0.80   |              |
| U2-group-table        | happyhorse-edit |                    |                                  | 0.69 strong | 0.44 (yes)     | 0.52✗ 0.87 0.74 0.43✗ | yes          |
| U2-group-table        | kling-o1        |                    |                                  | 0.70 strong | 0.42 (yes)     | 0.70 0.96 0.92 0.60   |              |
| U2-group-table        | kling-v3-omni   |                    |                                  | 0.66 strong | 0.44 (yes)     | 0.95 0.96 0.96        |              |
| U2-group-table        | wan27-edit      |                    |                                  | 0.63 strong | 0.39 (yes)     | 0.89 0.93 0.79 0.83   |              |
| U3-poppy-dance        | source          | ok                 | 6/6 face, 0 back, typical 0.19   |             |                |                       |              |
| U3-poppy-dance        | kling-v3-omni   |                    |                                  | 0.62 fair   | 0.47 (yes)     | –                     |              |
| U4-couple-sunset      | source          | refuse (back-view) | 0/9 face, 9 back, typical –      |             |                |                       |              |
| U4-couple-sunset      | kling-v3-omni   |                    |                                  | 0.57 fair   | – (unmeasured) | –                     |              |
| U5-handshake-portrait | source          | ok                 | 10/10 face, 0 back, typical 0.25 |             |                |                       |              |
| U5-handshake-portrait | kling-v3-omni   |                    |                                  | 0.77 strong | 0.45 (yes)     | –                     |              |
| G1-walk-tracking      | source          | ok                 | 10/10 face, 0 back, typical 0.25 |             |                |                       |              |
| G1-walk-tracking      | kling-v3-omni   |                    |                                  | 0.78 strong | 0.31 (yes)     | –                     |              |
| G2-cafe-two           | source          | ok                 | 10/10 face, 0 back, typical 0.36 |             |                |                       |              |
| G2-cafe-two           | kling-v3-omni   |                    |                                  | 0.71 strong | 0.46 (yes)     | –                     |              |
| G3-occlusion-market   | source          | ok                 | 5/6 face, 0 back, typical 0.34   |             |                |                       |              |
| G3-occlusion-market   | kling-v3-omni   |                    |                                  | 0.65 strong | 0.54 (yes)     | –                     |              |
| G4-handoff-workshop   | source          | ok                 | 8/10 face, 2 back, typical 0.45  |             |                |                       |              |
| G4-handoff-workshop   | kling-v3-omni   |                    |                                  | 0.65 strong | 0.38 (yes)     | –                     |              |
| G5-spin-park          | source          | warn (small-face)  | 8/10 face, 2 back, typical 0.11  |             |                |                       |              |
| G5-spin-park          | kling-v3-omni   |                    |                                  | 0.49 weak   | 0.56 (yes)     | –                     |              |

What this shows:

- U4 is refused and G5 warns; every other clip passes.
- No clean Kling 3.0 Omni run reports a changed bystander. Before matching by overlap, U1 matched the man (undetected in the result) to Mara's face beside him. Before excluding the target's own faces, G3 counted Mara re-emerging from the pillar as a bystander.
- Kling O1 on U1 and both people HappyHorse recast on U2 are flagged as the wrong person.
- "Marked person unchanged" never fires on the Phase 0 runs, which all changed the target.

## Live run

One recast of U2 with Mara through the studio (Kling 3.0 Omni, 5 s): Kling recast the woman beside the marked one. The checks reported a weak likeness (0.36) and the marked person unchanged (0.94). Before the wrong-person rule above, they called everyone else unchanged: the recast woman still matched herself at 0.53 while matching Mara at 0.61. The conformed result was 25 fps and 125 frames, the same as the source.
