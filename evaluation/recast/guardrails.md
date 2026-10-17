# Recast guardrails

The studio checks a shot before a recast is sent and checks the result before the creator keeps it. Both run in the browser on a Web Worker with [Human](https://github.com/vladmandic/human) 3.3.6 (MIT): BlazeFace for faces, FaceRes for 1024-d face descriptors (cosine similarity), and MoveNet MultiPose for people and shoulder keypoints. Code: [shot-checks.ts](../../apps/web/src/features/revision/shot-checks.ts) (pure rules and thresholds), [shot-detector.ts](../../apps/web/src/features/revision/shot-detector.ts) (models). The checks are guidance for review, not a verdict.

## Pre-flight (composer)

Ten frames are sampled evenly; the marked person is found on the frame nearest the mark and followed by box overlap.

| Verdict              | Rule                                                                     | Why                                                                   |
| -------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| refuse (`back-view`) | No tracked frame shows their face and at least 60% show them from behind | U4: every pipeline invented a face; nothing to check likeness against |
| warn (`small-face`)  | Largest face is under 15% of the frame height                            | G5 (0.13) gave the only weak likeness in Phase 0; U3 at 0.20 held     |
| warn (`partly-away`) | Half or more of the tracked frames are from behind                       | Identity drifts on turns                                              |
| unmatched            | Nobody under the mark                                                    | Ask the creator to mark again                                         |

Facing comes from shoulder order (facing the camera, their left shoulder is on the image's right). MoveNet places a nose on the back of a head, so the nose score is not used.

## Result checks (result view)

The result is sampled at the same proportional times as the source and compared frame by frame. Similarity calibration on the Phase 0 frames and the Character references: the same person scored 0.60–0.97, different people 0.22–0.59, and strangers against Mara or Theo had a median of 0.33 and a maximum of 0.50.

| Check                   | Rule                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Likeness                | Median best match of the recast face to the approved references: weak < 0.50, fair < 0.62, strong ≥ 0.62                                          |
| Marked person unchanged | Median match to the source person ≥ 0.62                                                                                                          |
| Another person changed  | A bystander's face, matched in the result by overlap (IoU ≥ 0.25, never the recast face), has a median self-match < 0.50 over at least two frames |
| Wrong person            | A changed bystander now matches the Character at least as well as the target does                                                                 |

## Phase 0 replay

`bun evaluation/recast/tools/guardrails-eval.ts scans.json refs.json`, on scans of all 18 Phase 0 runs. Review truth from [docs/phase0-recast.md](../../docs/phase0-recast.md): Kling 3.0 Omni on U1 and U2 was clean; Kling O1 on U1 recast the wrong person and restyled the other; HappyHorse on U2 recast two people; G5 lost likeness.

| Clip                  | Run             | Pre-flight         | Evidence                         | Likeness    | Still source   | Bystanders           | Wrong person |
| --------------------- | --------------- | ------------------ | -------------------------------- | ----------- | -------------- | -------------------- | ------------ |
| U1-couple-wall        | source          | ok                 | 5/5 face, 0 back, largest 0.45   |             |                |                      |              |
| U1-couple-wall        | aleph2-keyframe |                    |                                  | 0.57 fair   | 0.53 (yes)     | 0.93                 |              |
| U1-couple-wall        | genjutsu        |                    |                                  | 0.57 fair   | 0.53 (yes)     | –                    |              |
| U1-couple-wall        | kling-o1        |                    |                                  | 0.58 fair   | 0.53 (yes)     | 0.32✗                |              |
| U1-couple-wall        | kling-v3-omni   |                    |                                  | 0.64 strong | 0.50 (yes)     | –                    |              |
| U1-couple-wall        | wan27-edit      |                    |                                  | 0.66 strong | 0.39 (yes)     | –                    |              |
| U2-group-table        | source          | ok                 | 10/10 face, 0 back, largest 0.31 |             |                |                      |              |
| U2-group-table        | genjutsu        |                    |                                  | 0.65 strong | 0.46 (yes)     | 0.86 0.95 0.77 0.80  |              |
| U2-group-table        | happyhorse-edit |                    |                                  | 0.69 strong | 0.44 (yes)     | 0.52 0.87 0.73 0.43✗ |              |
| U2-group-table        | kling-o1        |                    |                                  | 0.70 strong | 0.42 (yes)     | 0.70 0.96 0.93 0.60  |              |
| U2-group-table        | kling-v3-omni   |                    |                                  | 0.66 strong | 0.44 (yes)     | 0.95 0.96 0.95       |              |
| U2-group-table        | wan27-edit      |                    |                                  | 0.63 strong | 0.39 (yes)     | 0.89 0.93 0.81 0.83  |              |
| U3-poppy-dance        | source          | ok                 | 6/6 face, 0 back, largest 0.20   |             |                |                      |              |
| U3-poppy-dance        | kling-v3-omni   |                    |                                  | 0.62 fair   | 0.47 (yes)     | –                    |              |
| U4-couple-sunset      | source          | refuse (back-view) | 0/9 face, 9 back, largest –      |             |                |                      |              |
| U4-couple-sunset      | kling-v3-omni   |                    |                                  | 0.57 fair   | – (unmeasured) | –                    |              |
| U5-handshake-portrait | source          | ok                 | 10/10 face, 0 back, largest 0.26 |             |                |                      |              |
| U5-handshake-portrait | kling-v3-omni   |                    |                                  | 0.77 strong | 0.45 (yes)     | –                    |              |
| G1-walk-tracking      | source          | ok                 | 10/10 face, 0 back, largest 0.29 |             |                |                      |              |
| G1-walk-tracking      | kling-v3-omni   |                    |                                  | 0.78 strong | 0.31 (yes)     | –                    |              |
| G2-cafe-two           | source          | ok                 | 10/10 face, 0 back, largest 0.44 |             |                |                      |              |
| G2-cafe-two           | kling-v3-omni   |                    |                                  | 0.71 strong | 0.46 (yes)     | –                    |              |
| G3-occlusion-market   | source          | ok                 | 5/6 face, 0 back, largest 0.51   |             |                |                      |              |
| G3-occlusion-market   | kling-v3-omni   |                    |                                  | 0.65 strong | 0.54 (yes)     | 0.54                 |              |
| G4-handoff-workshop   | source          | ok                 | 8/10 face, 2 back, largest 0.45  |             |                |                      |              |
| G4-handoff-workshop   | kling-v3-omni   |                    |                                  | 0.65 strong | 0.38 (yes)     | –                    |              |
| G5-spin-park          | source          | warn (small-face)  | 8/10 face, 2 back, largest 0.13  |             |                |                      |              |
| G5-spin-park          | kling-v3-omni   |                    |                                  | 0.49 weak   | 0.56 (yes)     | –                    |              |

What this shows:

- U4 is refused and G5 warns; every other clip passes.
- No clean Kling 3.0 Omni run reports a changed bystander. Before matching by overlap, U1 matched the man (undetected in the result) to Mara's face beside him.
- Kling O1 on U1 and HappyHorse on U2 are flagged. HappyHorse's second recast face (0.52) sits just above the threshold and is missed.
- "Marked person unchanged" never fires on real recasts. No Phase 0 run left the target as the source person, so that rule is tested only by unit tests.
- Kling O1 on U1 reads as "another person changed" rather than "wrong person": the restyled man does not match Mara better than the recast woman does.
