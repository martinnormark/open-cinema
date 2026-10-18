# Moving-scene runs, 2026-10-18

Comfy Cloud API graphs from [docs/moving-scenes.md](../../docs/moving-scenes.md). Loader inputs name files uploaded to Cloud by hash; upload your own with `python3 cloud.py upload FILE` and replace them, then `python3 cloud.py submit GRAPH.json`.

- `wan2-street.json`: FLUX 3 Klein redraws the opening frame with the Character, then Wan Animate 2 (Comfy-Org `video_wan_animate2`, loop unrolled) carries the take's motion; 16 fps.
- `wan2-harbour-24.json`: the same with a new setting, at 544×960 and the take's 24 fps.
- `wan22-replace.json`: Wan 2.2 Animate in replace mode (after Purz's `template_purz_wan22_animate_auto_character_replace`), keeping the plate through a masked background video. Uses YOLOv10 (AGPL-3.0) for detection.

Router requests (Kling 3.0 Omni recast and background, Seedance 2.5 edit) were built with the app's own prompt functions; the Seedance relocate request is a `content` array of the prompt, the take as `reference_video` and the Location still as `reference_image`, with `duration: -1`.
