# Vertical footage for recast and background replacement

Where to get 9:16 takes to recast or relocate, and which ones we can ship and demo commercially without attribution or IP problems. Checked 2026-10-18.

## What makes a good take

The recast and background guardrails ([phase0-recast.md](phase0-recast.md#supported-envelope), [phase0-background.md](phase0-background.md)) prefer:

- one or two people, the target's face at medium size or larger for part of the take;
- a locked-off or slow camera, no cuts inside the clip;
- 5 to 10 seconds (Kling takes 3 to 10 s), 9:16, 720 px or more on the short side.

Many stock "vertical" clips are short edits with several cuts (Coverr's especially). Trim to a single shot before using one.

## People on camera

No free stock library hands over a model release. Pexels and Mixkit say nothing about releases, Pixabay says checking for third-party consent is "your responsibility", and Coverr says it obtains releases but does "not provide these releases to users". That is why the five Mixkit clips of real people were kept out of the demo. For anything we ship or promote with an identifiable person in it, use our own footage with a signed release, or a generated take.

## Sources, best first

| #   | Source                                                             | Licence                                                                                                                                                                                                                                                                    | Releases for people                          | Fit                                                                                                                                                                           |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Our own phone footage**                                          | Ours                                                                                                                                                                                                                                                                       | Get a one-page release from anyone on camera | Best: we choose framing, length and camera. Shoot 9:16, 24 or 30 fps, 6 to 10 s, on a tripod or held still.                                                                   |
| 2   | **Generated takes** (Seedance 2.0/2.5, Kling through Comfy Router) | Provider terms ([third-party-ip.md](third-party-ip.md#hosted-models-through-comfy-router))                                                                                                                                                                                 | No real person involved                      | Already used for the recast evaluation's G clips ([evaluation/recast/jobs/sources.json](../evaluation/recast/jobs/sources.json)). Good for demos; not "real camera" evidence. |
| 3   | **Pexels**                                                         | [Pexels License](https://www.pexels.com/license/): free, commercial use, no attribution, may modify. Not allowed: selling unaltered copies, implying endorsement by people on screen, showing identifiable people "in a bad light or in a way that is offensive".          | Not mentioned                                | Largest supply of true 4K 9:16 people footage; use the portrait filter.                                                                                                       |
| 4   | **Mixkit**                                                         | [Mixkit Stock Video Free License](https://mixkit.co/license/): commercial use, no attribution. Some vertical clips carry the **Restricted** licence (personal use only); check each clip page.                                                                             | Not mentioned                                | Clip pages state licence, resolution and duration, and files download directly, which suits `evaluation/recast/tools/recast.py prepare`.                                                        |
| 5   | **Pixabay**                                                        | [Pixabay Content License](https://pixabay.com/service/license-summary/): free, no attribution, may modify. Not allowed: standalone resale, "immoral or illegal" use "especially Content which features recognisable people", misleading use, trademarks in commercial use. | Your responsibility                          | The "vertical" search mixes in landscape clips and animations; confirm the size on each page.                                                                                 |
| 6   | **Coverr**                                                         | [Coverr License](https://coverr.co/license): commercial use, no attribution. Content "must not be used to train AI algorithms, develop AI models, or serve as part of any dataset".                                                                                        | Obtained but not shared                      | Mixes human-shot and AI-generated clips; most vertical clips are multi-cut edits. The dataset clause rules it out for evaluation sets and IC-LoRA training.                   |

Wikimedia Commons and public-domain archives (Prelinger, NASA) were considered and left out: almost nothing there is vertical, recent, and of one or two people at a usable size.

## Concrete clips

All 9:16 and checked on their pages. Mixkit clips were also previewed frame by frame; the Pexels clips were checked from page metadata only.

**Pexels**

- [Young man walking on pavement](https://www.pexels.com/video/young-man-walking-on-pavement-7251560/), MART PRODUCTION, 2160×3840, 13 s. One man, cobblestone street; recast or background.
- [A man walking in the city](https://www.pexels.com/video/a-man-walking-in-the-city-7866007/), Barbara Olsen, 2160×3840, 10 s. One man, sunny street.
- [A woman walking on street in city](https://www.pexels.com/video/a-woman-walking-on-street-in-city-7223711/), MART PRODUCTION, 2160×3840, 22 s. One woman among tall buildings; trim to 10 s.

**Mixkit** (all Stock Video Free License, 1080×1920)

- [Urban trendy girl walking to the camera](https://mixkit.co/free-stock-video/urban-trendy-girl-walking-to-the-camera-1227/), 13 s. One person walks into a close-up; the strongest recast candidate here.
- [Cheerful man moves forward dancing in nature](https://mixkit.co/free-stock-video/cheerful-man-moves-forward-dancing-in-the-middle-of-nature-32746/), 18 s. One man, steady camera, full body to medium; recast with motion.
- [Tattooed Victorian woman walking](https://mixkit.co/free-stock-video/tattoed-victorian-woman-walking-41523/), 16 s. One woman, steady, medium shot; costume recast.
- [Indie fashion girl walking on a river](https://mixkit.co/free-stock-video/indie-fashion-girl-walking-on-a-river-1293/), 14 s, also 2160×4096. Small figure, locked camera; background replacement rather than recast.

**Pixabay**: start from the [walking, vertical search](https://pixabay.com/videos/search/walking%20vertical/). The three people clips checked from it were landscape or an iClone animation, so no clip is listed.

**Coverr**: [A guy picking up trash at the beach](https://coverr.co/videos/a-guy-picking-up-trash-at-the-beach-jgkwwhdv17) and [A guy fishing on the rocks](https://coverr.co/videos/a-guy-is-fishing-on-the-rocks-by-the-sea-vwbbpkvma0) are 1920×3412 with usable single shots inside multi-cut edits. Mind the dataset clause above.
