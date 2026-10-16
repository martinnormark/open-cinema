# Evaluation harness

Phase 0 (issue #3) evidence for selective video revision. Each mode is judged with the shared [review rubric](rubric.md), which scores the requested change and the preservation of everything else separately.

| Path                        | Contents                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| [rubric.md](rubric.md)      | Shared rubric, gates, objective measurements, proposed release bar, and results-log format. |
| `clips/manifest.md`         | The representative clip set: what each clip stresses and how it was produced.               |
| `clips/requests/`           | Exact Router request bodies used to generate clips and Location references (reproducible).  |
| `background/`               | Background-replacement runs: `results.md` log, pipeline request bodies, small stills.       |
| `scripts/router.py`         | Stdlib Comfy Router client: upload media, queued submit, poll, download outputs with a log. |
| `scripts/compare.py`        | Source/result comparison: side-by-side video, matched contact sheet, objective metrics.     |
| `scripts/run_background.py` | Runs background-replacement pipelines over the clip set and compares each result.           |

Clips, outputs, side-by-sides and contact sheets are written to the ignored `artifacts/evaluation/` folder and are **not committed**. Only request bodies, logs of scores, and small reference stills live in the repository.

## Running

Requirements: Python 3.11+, `ffmpeg`/`ffprobe`, and `pip install numpy opencv-python-headless`. Router credentials come from `COMFY_API_KEY` (sent as `X-API-Key`) or from an authenticating proxy for `api.comfy.org`. The key is never printed or logged.

```sh
# Generate a clip or Location reference from a stored request body
python3 evaluation/scripts/router.py run veo/veo-3.1-fast-generate-001 \
  evaluation/clips/requests/c1-walk-track.json artifacts/evaluation/background/sources/c1

# Compare a result with its source using a source foreground matte
python3 evaluation/scripts/compare.py SOURCE.mp4 RESULT.mp4 OUT_DIR --matte SOURCE_ALPHA.mp4 --label pipeline-name
```

Router inputs must be reachable URLs. `router.py upload` places a local file in Comfy's API-node storage (`POST /customers/storage`) and returns a signed URL that Router providers can fetch. Provider output links expire (about 24 hours), so `router.py run` copies outputs into the output directory immediately.

## Reviewing

Open `side-by-side.mp4` (source | result | protected-region difference) and `contact-sheet.jpg` for each run, score it with the rubric, and add one row to the mode's `results.md`. Objective metrics in `metrics.json` support the review; they do not replace it.
