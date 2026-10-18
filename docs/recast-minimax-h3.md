# Character recast on MiniMax H3 (experiment)

Tested on 2026-10-18 for the competition's "Built with MiniMax H3" prize, which requires MiniMax H3 to be the core model. Can H3 replace one person in a real camera take with a Character, and how does it compare with the shipped Kling 3.0 Omni path ([phase0-recast.md](phase0-recast.md))?

**Verdict: yes, with a weaker hold on the take than Kling.** H3 recast the right person as Mara on both real takes, with her bob, freckles and full reference outfit, and on the five-person table its likeness was the best we have measured on that clip (0.66 against Kling's 0.65). But H3 has no video edit mode. It regenerates the whole shot with the take as a motion and scene reference, so the other people and the background are redrawn rather than kept, and in the last second or two other people's actions drift away from the take. Kling stays the shipped recast. H3 is a credible core model for a separate "Recast (MiniMax H3)" entry, labelled as reference-guided rather than frame-exact.

## How H3 can be called

MiniMax H3 is reachable two ways through Comfy:

- **ComfyUI partner nodes** (`comfy_api_nodes/nodes_minimax.py`): Text to Video, First-Last-Frame to Video, **Reference to Video**, Context IR (prompt enhancer) and Regenerate to 2K. All call `api.comfy.org/proxy/minimax/v2/video_generation` and poll `/proxy/minimax/v2/query/video_generation/{task_id}`. MiniMax H3 Max and Max Turbo run through fal (`/proxy/fal/minimax/h3-max…`).
- **Comfy Router** `minimax/minimax-h3` (and `fal/h3-max`, `fal/h3-max-turbo`). Its schema takes the same `content` list. On 2026-10-18 every `/v2/models/…` call from this environment answered `not_enabled` ("Comfy Router is not enabled for this account yet"), so these runs used the proxy route the ComfyUI node uses.

The request is a `content` list: one `text` item, plus either `first_frame` / `last_frame` images or `reference_*` media (the two kinds are mutually exclusive), with `resolution` 768P or 2K and `duration` 4–15 s. Reference to Video accepts up to 9 images and up to 3 videos (2–15 s each, 15 s in total), referred to in the prompt as "Image 1", "Video 1" and so on. The schema also lists a `base_video` role, but ComfyUI uses it only for Regenerate to 2K, which re-renders H3's own 768P output and is not an edit.

So recast on H3 means **Reference to Video**: the take as Video 1, Mara's front full-body, face and three-quarter views as Images 1–3, and a prompt asking for the same shot with the target replaced. The prompt and request bodies are in the evidence folder; `evaluation/recast/tools/minimax_h3.py` runs it.

## Live runs

Same takes, Character and measurement tools as Phase 0: U1 (couple at a wall, replace the woman on the right) and U2 (five people at a table, replace the blonde woman in the middle), both 5 s at 1280×720, 25 fps. Seed 42, 16:9, 5 s. Both resolutions were run on both takes.

| Measure | U1 Kling 3.0 Omni | U1 H3 768P | U1 H3 2K | U2 Kling 3.0 Omni | U2 H3 768P | U2 H3 2K |
| --- | --- | --- | --- | --- | --- | --- |
| Likeness to Mara, median (min) | **0.54** (0.12) | 0.35 (−0.04) | 0.32 (−0.03) | 0.65 (0.50) | 0.55 (0.43) | **0.66** (0.53) |
| Similarity to the source person (lower is better) | 0.04 | 0.07 | 0.07 | 0.05 | 0.05 | 0.05 |
| Other people's faces against the take | **0.82** | 0.80 | 0.79 | **0.93** | 0.74 | 0.75 |
| Protected-area PSNR, median (dB) | 24.1 | 23.1 | 16.3 | **26.0** | 17.5 | 17.2 |
| Right person, nobody else recast | yes | yes | yes | yes | yes | yes |
| Wardrobe | reference | reference | reference | reference | reference | reference |
| Output | 1920×1080, 24 fps, 121 frames | 1344×768, 24 fps, 124 frames | 2560×1440, 24 fps, 124 frames | as U1 | as U1 | as U1 |
| Wall time | queue-bound (Phase 0) | 4.0 min | 6.0 min | queue-bound | 4.3 min | 6.0 min |

Likeness and face similarity are ArcFace (`identity.py`, every 6th frame); same person is typically above 0.45 and different people below 0.25. U1's low minimums are the frames where the man's head covers her face; Kling has the same dip. Kling's numbers are its Phase 0 runs on the same takes.

**Cost.** Each run was billed 10 seconds of usage (5 s of input video plus 5 s of output). At the node's listed rates that is about $1.29 per 5 s clip at 768P and $1.86 at 2K, against $0.85 for Kling 3.0 Omni. The four runs cost about $6.30.

### What works

- **Selection.** H3 picked the right person every time, including the one blonde woman among five at the table. In Phase 0, Kling O1 recast the wrong person on U1 and HappyHorse turned two people into Mara on U2.
- **Identity and wardrobe.** The platinum bob, freckles, mustard jacket and black tee arrive on all four runs. At 2K on U2 the likeness is the strongest measured on that take.
- **Scene recreation.** The table, cups, teapots, papers, signage, parked cars and passers-by all come back in place. Without a side-by-side most viewers would take the result for the original shot.

### What fails

1. **The take is redrawn, not kept.** Every pixel is generated, so other people's faces score 0.74–0.80 against the take where Kling keeps 0.82–0.93, and the protected area changes everywhere. At 2K the framing also shifts slightly, which is why its PSNR is lower than 768P's on U1.
2. **Performance drifts late in the shot.** The first two to three seconds follow the take closely. After that H3 improvises: on U2 the man in red never makes his reach across the table at 4.6 s, and the other hands land in different places. This breaks the recast promise that everyone else's performance is untouched.
3. **Not frame-exact.** Output is 24 fps and 124 frames (5.17 s) for a 25 fps, 125-frame take, so it needs retiming before it can replace the take in a timeline. Kling has the same problem (121 frames at 24 fps).
4. **Price.** About 1.5–2.2 times Kling's price per clip, because the reference video is billed as input seconds.

## Recommendation

- **Keep Kling 3.0 Omni as the shipped recast.** It keeps other people and timing closer to the take at a lower price.
- **For the MiniMax H3 prize**, an H3 recast is a fair entry: Reference to Video with the take and the Character's views is the whole workflow, so H3 is unambiguously its core model, and the results show the right person with a strong likeness. Present it as reference-guided recast at 2K, use takes of five seconds or less where the drift has not set in, and say plainly that the rest of the shot is regenerated.
- **Cheapest improvement to try next:** composite H3's target region back into the take with the Phase 0 target matte, so everyone else keeps the take's own pixels. That only works where the target's own body stays on the take's path, which held through the first three seconds here.

## Evidence

In the project's shared files under `recast-minimax-h3/`:

- `U1-couple-wall-take-kling-h3.mp4` and `U2-group-table-take-kling-h3.mp4`: take, Kling 3.0 Omni, H3 768P and H3 2K in a 2×2 grid.
- `U1-t3.0-four-way.jpg` and `U2-t4.6-four-way.jpg`: stills from those grids. The U2 still shows the late drift.
- `minimax-h3-ref-768p/` and `minimax-h3-ref-2k/`: each run's `result.mp4`, `request.json` (data URIs redacted), `identity.json` and `summary.json`.

## Running it

```sh
cd evaluation/recast/tools
python3 recast.py prepare                                   # or copy the sources into artifacts/evaluation/recast/sources
python3 minimax_h3.py U1-couple-wall,U2-group-table 2K      # writes runs/minimax-h3-ref-2k/<clip>/
python3 evaluate.py minimax-h3-ref-2k U1-couple-wall,U2-group-table
```

Media are sent as data URIs, so the runs need no storage upload. `evaluate.py` needs the Phase 0 target mattes in `artifacts/evaluation/recast/mattes/`.
