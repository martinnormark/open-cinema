"""Character recast pipelines over the evaluation clip set.

Usage:
  python3 recast.py prepare                      # fetch/trim stock clips, upload sources and references
  python3 recast.py run PIPELINE CLIP[,CLIP...]  # run one pipeline on clips (concurrently)
  python3 recast.py list

Each run writes artifacts/evaluation/recast/runs/<pipeline>/<clip>/ with
router logs, result.mp4 and (for keyframe pipelines) keyframe.png.
The request bodies built here mirror packages/comfy/src/workflows/character-replace.ts.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import router

ROOT = Path(__file__).resolve().parents[3]
HERE = ROOT / "evaluation/recast"
ART = ROOT / "artifacts/evaluation/recast"
SOURCES = ART / "sources"
UPLOADS = ART / "uploads.json"
CHARS = json.loads((HERE / "references/characters.json").read_text())
CLIPS = {c["id"]: c for c in json.loads((HERE / "clips.json").read_text())["clips"]}

# Reference views sent to models that accept several images, in priority order.
VIEW_ORDER = ["front-full", "face", "three-quarter", "back", "profile"]


def _uploads() -> dict:
    return json.loads(UPLOADS.read_text()) if UPLOADS.exists() else {}


def staged(path: Path) -> str:
    """Signed URL for a local file; re-uploads when older than 20 h."""
    cache = _uploads()
    key = str(path.relative_to(ROOT))
    hit = cache.get(key)
    if hit and time.time() - hit["at"] < 20 * 3600:
        return hit["url"]
    url = router.upload(path)
    cache = _uploads()
    cache[key] = {"url": url, "at": time.time()}
    UPLOADS.write_text(json.dumps(cache, indent=1))
    return url


def source_path(clip: dict) -> Path:
    if clip["origin"] == "stock":
        return SOURCES / f"{clip['id']}.mp4"
    return SOURCES / clip["file"]


def prepare() -> None:
    SOURCES.mkdir(parents=True, exist_ok=True)
    for clip in CLIPS.values():
        out = source_path(clip)
        if clip["origin"] == "stock" and not out.exists():
            raw = ART / "stock" / Path(clip["url"]).name
            if not raw.exists():
                router.download(clip["url"], raw)
            start, seconds = clip["trim"]
            subprocess.run(
                ["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-i", str(raw), "-t", str(seconds),
                 "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
                check=True,
            )
        if out.exists():
            print(clip["id"], staged(out))
        else:
            print(clip["id"], "missing source", out)
    for cid, char in CHARS.items():
        for view, name in char["views"].items():
            path = HERE / "references" / cid / name
            if path.exists():
                staged(path)


def refs(char_id: str, limit: int) -> list[str]:
    views = CHARS[char_id]["views"]
    paths = [HERE / "references" / char_id / views[v] for v in VIEW_ORDER if v in views]
    return [staged(p) for p in paths if p.exists()][:limit]


def wardrobe_clause(clip: dict) -> str:
    char = CHARS[clip["character"]]
    if clip["wardrobe"] == "source":
        return "Keep the original clothing of the replaced person exactly as in the source video; change only the person (face, hair, skin, build)."
    return f"Dress the new person in their reference outfit: {char['wardrobe']}."


def recast_prompt(clip: dict, person: str = "the person shown in the reference images") -> str:
    char = CHARS[clip["character"]]
    return (
        f"Replace {clip['target']} with {person}: {char['name']}, {char['identity']}. "
        f"{wardrobe_clause(clip)} "
        "Keep the replaced person's exact performance: body movement, pose, gestures, facial expression, gaze, "
        "head turns, lip movement and timing. Keep every other person, the background, all objects, the framing, "
        "the lighting and the camera movement exactly as in the original video. Photorealistic, same film look."
    )


def keyframe(clip: dict, run_dir: Path) -> Path:
    """Recast the first frame with FLUX 3 using the Character's reference views."""
    out = run_dir / "keyframe.png"
    if out.exists():
        return out
    frame0 = run_dir / "frame0.jpg"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(source_path(clip)), "-frames:v", "1", "-q:v", "2", str(frame0)], check=True)
    char = CHARS[clip["character"]]
    prompt = (
        f"Image 1 is a frame from a film. In image 1, replace {clip['target']} with {char['name']}, the person shown in "
        f"images 2 to 4 ({char['identity']}). {wardrobe_clause(clip)} The new person takes exactly the same position, "
        "pose, body orientation, scale, expression and gaze as the replaced person, lit by the same light. "
        "Everything else in image 1 (other people, background, objects, framing, colour grade, grain) stays pixel-identical."
    )
    body = {"prompt": prompt, "images": [staged(frame0)] + refs(clip["character"], 3), "aspect_ratio": "auto", "resolution": "1k", "grounding": False}
    rec = router.run("bfl/flux-3-image", body, run_dir / "keyframe-router.json", poll=4)
    router.download(router.find_urls(rec["result"])[0], out)
    return out


def kling(model: str):
    def build(clip: dict, run_dir: Path) -> tuple[str, dict]:
        images = refs(clip["character"], 3)
        tags = ", ".join(f"<<<image_{i + 1}>>>" for i in range(len(images)))
        prompt = recast_prompt(clip, f"the person shown in {tags}")
        prompt = prompt.replace(f"Replace {clip['target']}", f"In <<<video_1>>>, replace {clip['target']}", 1)
        return model, {
            "prompt": prompt,
            "mode": "pro",
            "video_list": [{"video_url": staged(source_path(clip)), "refer_type": "base", "keep_original_sound": "no"}],
            "image_list": [{"image_url": u} for u in images],
        }

    return build


def aleph_keyframe(clip: dict, run_dir: Path) -> tuple[str, dict]:
    kf = keyframe(clip, run_dir)
    return "runway/aleph2", {
        "promptText": recast_prompt(clip, "the person in the first-frame guide image")[:1000],
        "videoUri": staged(source_path(clip)),
        "promptImage": [{"uri": staged(kf), "position": "first"}],
        "seed": 7,
    }


def aleph_text(clip: dict, run_dir: Path) -> tuple[str, dict]:
    char = CHARS[clip["character"]]
    return "runway/aleph2", {
        "promptText": recast_prompt(clip, f"{char['name']}")[:1000],
        "videoUri": staged(source_path(clip)),
        "seed": 7,
    }


def wan_edit(model: str, with_keyframe: bool):
    def build(clip: dict, run_dir: Path) -> tuple[str, dict]:
        images = refs(clip["character"], 3)
        if with_keyframe:
            images = [staged(keyframe(clip, run_dir))] + images[:2]
        media = [{"type": "video", "url": staged(source_path(clip))}] + [
            {"type": "reference_image", "url": u} for u in images
        ]
        return model, {
            "input": {"prompt": recast_prompt(clip)[:800], "media": media},
            "parameters": {"resolution": "720P", "prompt_extend": False, "watermark": False, "seed": 7},
        }

    return build


def genjutsu(clip: dict, run_dir: Path) -> tuple[str, dict]:
    return "higgsfield/higgsfield-genjutsu-motion-transfer-v1.0", {
        "video_url": staged(source_path(clip)),
        "image_urls": [staged(source_path_frame(clip, run_dir))] + refs(clip["character"], 4),
        "prompt": recast_prompt(clip)[:1000],
        "resolution": "720p",
    }


def source_path_frame(clip: dict, run_dir: Path) -> Path:
    frame0 = run_dir / "frame0.jpg"
    if not frame0.exists():
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(source_path(clip)), "-frames:v", "1", "-q:v", "2", str(frame0)], check=True)
    return frame0


PIPELINES = {
    "kling-o1": kling("kling/kling-video-o1"),
    "kling-v3-omni": kling("kling/kling-v3-omni"),
    "aleph2-keyframe": aleph_keyframe,
    "aleph2-text": aleph_text,
    "wan27-edit": wan_edit("wan/wan2.7-videoedit", False),
    "wan27-edit-keyframe": wan_edit("wan/wan2.7-videoedit", True),
    "happyhorse-edit": wan_edit("wan/happyhorse-1.0-video-edit", False),
    "genjutsu": genjutsu,
}


def run_one(pipeline: str, clip_id: str) -> str:
    clip = CLIPS[clip_id]
    run_dir = ART / "runs" / pipeline / clip_id
    run_dir.mkdir(parents=True, exist_ok=True)
    out = run_dir / "result.mp4"
    if out.exists():
        return f"{pipeline}/{clip_id}: exists"
    try:
        t0 = time.time()
        model, body = PIPELINES[pipeline](clip, run_dir)
        (run_dir / "request.json").write_text(json.dumps(router._redact(body), indent=1))
        rec = router.run(model, body, run_dir / "router.json")
        urls = [u for u in router.find_urls(rec["result"]) if ".mp4" in u.lower() or ".mov" in u.lower()] or router.find_urls(rec["result"])
        router.download(urls[0], out)
        rec["pipeline_seconds"] = round(time.time() - t0, 1)
        (run_dir / "router.json").write_text(json.dumps(rec, indent=2))
        return f"{pipeline}/{clip_id}: ok {rec['pipeline_seconds']}s"
    except Exception as err:
        (run_dir / "error.txt").write_text(traceback.format_exc())
        return f"{pipeline}/{clip_id}: FAILED {str(err)[:600]}"


def main() -> None:
    cmd = sys.argv[1]
    if cmd == "prepare":
        prepare()
    elif cmd == "list":
        print("\n".join(PIPELINES))
        print("\n".join(CLIPS))
    elif cmd == "run":
        pipes = sys.argv[2].split(",")
        clips = list(CLIPS) if sys.argv[3] == "all" else sys.argv[3].split(",")
        pairs = [(p, c) for p in pipes for c in clips if source_path(CLIPS[c]).exists()]
        with ThreadPoolExecutor(max_workers=8) as pool:
            for line in pool.map(lambda pc: run_one(*pc), pairs):
                print(line, flush=True)


if __name__ == "__main__":
    main()
