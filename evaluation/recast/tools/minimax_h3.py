"""MiniMax H3 reference-to-video recast over the evaluation clips.

Usage:
  python3 minimax_h3.py CLIP[,CLIP...] [768P|2K] [PIPELINE_NAME]

MiniMax H3 has no video edit mode: its only source-video role, base_video, re-renders
H3's own 768P output at 2K. Recast therefore runs through reference-to-video, the
take as "Video 1" (motion and scene reference) and the Character's views as
"Image 1..3", through the same proxy route ComfyUI's MinimaxHailuo03ReferenceNode
uses. Media travel as data URIs, so no storage upload is needed.
"""

from __future__ import annotations

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import router
from recast import ART, CHARS, CLIPS, HERE, VIEW_ORDER, source_path, wardrobe_clause

CREATE = "/proxy/minimax/v2/video_generation"
QUERY = "/proxy/minimax/v2/query/video_generation/"


def prompt(clip: dict, n_images: int) -> str:
    char = CHARS[clip["character"]]
    images = ", ".join(f"Image {i + 1}" for i in range(n_images))
    return (
        f"Video 1 is a real camera take. Recreate Video 1 shot for shot, but replace {clip['target']} "
        f"with {char['name']}, the person shown in {images}: {char['identity']}. {wardrobe_clause(clip)} "
        f"{char['name']} performs exactly what the replaced person does in Video 1: the same body movement, pose, "
        "gestures, facial expressions, gaze, head turns, lip movement and timing, frame for frame. Every other "
        "person, the background, all objects, the framing, the lighting, the colour grade and the camera "
        "movement stay exactly as in Video 1. Photorealistic, same film look."
    )


def body(clip: dict, resolution: str) -> dict:
    views = CHARS[clip["character"]]["views"]
    paths = [HERE / "references" / clip["character"] / views[v] for v in VIEW_ORDER if v in views][:3]
    content = [{"type": "text", "text": prompt(clip, len(paths))}]
    content += [{"type": "image_url", "role": "reference_image", "image_url": {"url": router.data_uri(p)}} for p in paths]
    content.append({"type": "video_url", "role": "reference_video", "video_url": {"url": router.data_uri(source_path(clip))}})
    return {"model": "MiniMax-H3", "content": content, "resolution": resolution, "duration": 5, "ratio": "16:9", "seed": 42, "aigc_watermark": False}


def run_one(clip_id: str, resolution: str, pipeline: str) -> str:
    clip = CLIPS[clip_id]
    run_dir = ART / "runs" / pipeline / clip_id
    run_dir.mkdir(parents=True, exist_ok=True)
    out, rec_path = run_dir / "result.mp4", run_dir / "router.json"
    if out.exists():
        return f"{pipeline}/{clip_id}: exists"
    rec = json.loads(rec_path.read_text()) if rec_path.exists() else {}
    if not rec.get("task_id"):
        req = body(clip, resolution)
        (run_dir / "request.json").write_text(json.dumps(router._redact(req), indent=1))
        t0 = time.time()
        status, headers, res = router._call("POST", CREATE, req)
        rec = {"model": "MiniMax-H3", "route": CREATE, "submit_http": status, "submit": res, "submitted_at": t0}
        rec_path.write_text(json.dumps(rec, indent=2))
        if status != 200 or not isinstance(res, dict) or not res.get("task_id"):
            return f"{pipeline}/{clip_id}: submit {status} {json.dumps(res)[:800]}"
        rec["task_id"] = res["task_id"]
        rec_path.write_text(json.dumps(rec, indent=2))
    while True:
        status, headers, res = router._call("GET", QUERY + rec["task_id"])
        task = res.get("task", {}) if isinstance(res, dict) else {}
        if task.get("status") in ("succeeded", "failed", "cancelled", "expired"):
            break
        time.sleep(15)
    rec.update(result=res, finished_at=time.time(), credits_used=headers.get("X-Comfy-Credits-Used"))
    rec["wall_seconds"] = round(rec["finished_at"] - rec["submitted_at"], 1)
    rec_path.write_text(json.dumps(rec, indent=2))
    if task.get("status") != "succeeded":
        return f"{pipeline}/{clip_id}: {task.get('status')} {json.dumps(task.get('error'))[:800]}"
    router.download(task["content"]["url"], out)
    return f"{pipeline}/{clip_id}: ok {rec['wall_seconds']}s usage={task.get('usage')}"


if __name__ == "__main__":
    clips = sys.argv[1].split(",")
    res = sys.argv[2] if len(sys.argv) > 2 else "768P"
    name = sys.argv[3] if len(sys.argv) > 3 else f"minimax-h3-ref-{res.lower()}"
    with ThreadPoolExecutor(max_workers=4) as pool:
        for line in pool.map(lambda c: run_one(c, res, name), clips):
            print(line, flush=True)
