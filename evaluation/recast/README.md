# Character recast evaluation

Phase 0 evidence for whole-character replacement (issues #3 and #6): replace one selected person in a clip with a saved Character, face **and** body, with an explicit wardrobe intent, while keeping their performance and everything else in the take. Scored with the shared [rubric](../rubric.md); this file adds only what is specific to recasting. Findings are in [docs/phase0-recast.md](../../docs/phase0-recast.md).

## Target and protected set

| Target (may change)                                                                   | Protected set (must not change)                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| The selected person's face, hair, skin, build, and clothing **when the wardrobe intent says so** | Every other person, the background, unrelated Things, framing, camera movement, timing; the selected person's action, pose, gesture, gaze, expression, and lip movement |

The selected person's **performance** is protected even though their appearance is the target. Score it under B2, not A5.

## Recast-specific criteria

These refine rubric criteria; they are scored on the same 0–4 anchors and logged in the same columns.

| Rubric ID | Recast reading                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1        | **Identity through pose and view.** Recognisably the Character in frontal, three-quarter, profile, and back views across the whole clip, not only in the best frame. Score the worst sustained view. |
| A1w       | **Wardrobe intent** (sub-score, noted in the A1 cell as `A1/A1w`). `reference`: the Character's reference outfit is worn, with correct colours and garments. `source`: the replaced person's original clothing is kept. Wrong intent caps A1 at 2. |
| A5        | **Body fit.** The new body follows the source silhouette, limb positions, and contact points; a different build (height, shoulders) is allowed only where it does not break contact or framing. |
| B1        | **Selection.** Only the requested person changed. Recasting the wrong person, or blending the Character into two people, is gate G4 (hallucinated change in the protected set).      |
| B2        | **Performance fidelity.** Head turns, gaze direction, mouth shapes, hand gestures, and body action match the source frame for frame.                                                  |
| B6        | **Occlusion.** When the target passes behind a person or object, the Character re-emerges with the same identity and the occluder is intact.                                         |
| B7        | **Interactions.** Held cups, hand-holding, handshakes, and hand-offs keep their contact and timing with the new body.                                                               |

Additional recast gate:

- **G6 Face-only:** only the face changed while hair, build, or (for `reference` intent) wardrobe still belong to the source person. This does not satisfy issue #6 and fails the run.

## Objective measurements (in addition to the shared set)

| Measure                    | Tool                  | Meaning                                                                                                                                                   |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Target matte               | `tools/matte.py`      | YOLO11 person segmentation of the **source**, following the person at `target_point`; white = protected, black = target (dilated). Feeds `compare.py --matte`. |
| `ref_sim`                  | `tools/identity.py`   | ArcFace cosine similarity of the result's target face to the Character's reference faces. Same person is typically > 0.45; different people < 0.25.        |
| `src_sim`                  | `tools/identity.py`   | Similarity of the result's target face to the source person's face at the same time; should fall well below 0.45 when the person was really replaced.      |
| `protected_face_sim`       | `tools/identity.py`   | Similarity of every other person's face, source vs result; should stay high (preservation of other people).                                               |
| `frames_without_target_face` | `tools/identity.py` | Sampled frames where no face was found in the target region (profile, back view, occlusion, or a broken face). Counted, not scored.                        |

## Evaluation set

[clips.json](clips.json) lists every clip with its target description, `target_point`, Character, wardrobe intent, and the conditions it stresses. Stock clips are Mixkit footage (Mixkit Stock Video Free License) referenced by URL and trimmed by `tools/recast.py prepare`; they are not redistributed here. Generated clips come from [jobs/sources.json](jobs/sources.json) (Seedance 2.0 through Comfy Router).

| Clip                  | Origin    | Target → Character         | Stresses                                                    |
| --------------------- | --------- | -------------------------- | ----------------------------------------------------------- |
| U1-couple-wall        | stock     | woman, right → Mara        | two people, close interaction, occlusion by the other head  |
| U2-group-table        | stock     | blonde woman, middle → Mara | selecting one of five people, hands on shared papers        |
| U3-poppy-dance        | stock     | dancer → Mara              | fast full-body motion, spins, foreground flowers            |
| U4-couple-sunset      | stock     | woman, left → Mara         | back view only, hand-holding, backlight and flare           |
| U5-handshake-portrait | stock     | man in suit → Theo         | 9:16, handshake, **keep source wardrobe**                   |
| G1-walk-tracking      | generated | man in hoodie → Theo       | backward dolly, background pedestrians                      |
| G2-cafe-two           | generated | woman, left → Mara         | two people, cup to lips, push-in                            |
| G3-occlusion-market   | generated | woman in red coat → Mara   | full occlusion by pillar and passer-by, pan                 |
| G4-handoff-workshop   | generated | younger man, right → Theo  | object hand-off, orbit, **keep source wardrobe**            |
| G5-spin-park          | generated | woman with braid → Mara    | 360° turn, jump, handheld                                   |

## Character fixtures

Reference sheets under [references/](references/) were generated with FLUX 3 (`bfl/flux-3-image`): a front full-body hero, then the other views conditioned on it so identity and wardrobe stay consistent. Request bodies are in [jobs/references.json](jobs/references.json) and [jobs/references-theo.json](jobs/references-theo.json); identity and wardrobe descriptions are in [references/characters.json](references/characters.json).

- **Mara**: platinum blunt bob, freckles, mustard-yellow rain jacket, olive trousers, white sneakers. Wardrobe is deliberately distinctive so wardrobe intent is easy to judge.
- **Theo**: deep brown skin, full black beard, round tortoiseshell glasses, red beanie, navy peacoat.

## Running

Requirements: Python 3.11+, `ffmpeg`, `pip install numpy opencv-python-headless ultralytics insightface onnxruntime`. Credentials as in [../README.md](../README.md).

```sh
cd evaluation/recast/tools
python3 batch.py ../jobs/references.json      # Character sheets (skips existing)
python3 batch.py ../jobs/sources.json         # generated clips
python3 recast.py prepare                     # fetch + trim stock clips, stage uploads
python3 matte.py U1-couple-wall,U2-group-table # source target mattes
python3 recast.py run kling-o1 all            # one pipeline over the set
python3 evaluate.py kling-o1 all              # compare.py + identity.py per run
```

Runs land in `artifacts/evaluation/recast/runs/<pipeline>/<clip>/` (ignored): `request.json`, `router.json` (timings), `result.mp4`, `side-by-side.mp4`, `contact-sheet.jpg`, `metrics.json`, `identity.json`. Scores are logged in [results.md](results.md).
