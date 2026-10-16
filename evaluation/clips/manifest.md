# Representative clip set

Phase 0 needs footage that exercises the hard cases named in GOALS.md: moving cameras, multiple people, partial occlusion, and interactions with Things. All clips are 6 s, 16:9, 720p, silent. Request bodies are in [requests/](requests/); the rendered clips live in the ignored `artifacts/evaluation/background/sources/`.

All clips are **generated** through Comfy Router so they can be used and regenerated freely. Two come from Veo 3.1 Fast as stand-ins for uploaded live-action footage; three come from LTX 2.5 Pro, the product's video focus. Real uploaded camera footage (sensor noise, motion blur, compression) is not yet in the set; see the limitation note in the Phase 0 report.

| ID  | Clip                 | Generator    | Stresses                                                                                                    |
| --- | -------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| C1  | Walk and track       | Veo 3.1 Fast | Moving camera (handheld backwards track), **two people**, gesturing hands, busy background with passers-by  |
| C2  | Café occlusion       | Veo 3.1 Fast | **Partial occlusion** (waiter crosses in front), Thing interaction (cup to lips), static camera             |
| C3  | Orbit with bicycle   | LTX 2.5 Pro  | **Orbiting camera** with strong parallax, fine edges (curly hair, spokes), held Thing                       |
| C4  | Table hand-off       | LTX 2.5 Pro  | **Two people**, **contact interaction** (box slid and picked up), slow push-in, table as foreground surface |
| C5  | Locked-off interview | LTX 2.5 Pro  | Baseline: single person, static camera, simple edges                                                        |

## Locations (saved Element stand-ins)

| Element           | Reference                                 | Request                                   |
| ----------------- | ----------------------------------------- | ----------------------------------------- |
| @Harbor (dusk)    | Establishing view and pier eye-level view | `loc-harbor.json`, `loc-harbor-pier.json` |
| @Greenhouse (day) | Interior establishing view                | `loc-greenhouse.json`                     |

The two Locations differ deliberately: @Harbor at dusk forces a lighting change on the foreground (warm practicals, blue ambient), and @Greenhouse is bright daylight interior, which most sources can match without relighting.
