#!/usr/bin/env python3
"""Run background-replacement pipelines over the evaluation clip set.

  run_background.py submit  [--clips c1,c2] [--pipelines a,b] [--workers 6]
  run_background.py lock    [--clips ...] [--pipelines ...]   # foreground-lock composites
  run_background.py compare [--clips ...]

Reads evaluation/background/plan.json (clip -> Location) and locations.json.
Sources:   artifacts/evaluation/background/sources/<clip>/out0_video_url.mp4
Locations: artifacts/evaluation/background/<reference>/out0_sample.png
Runs:      artifacts/evaluation/background/runs/<clip>-<pipeline>/

`lock` composites the SOURCE foreground over a generative result with the source
matte from the SwitchX run (its `alpha` output), so the protected region is the
original pixels. The same graph exists as core ComfyUI nodes in
workflows/background-replace/.
"""
import argparse
import concurrent.futures as cf
import json
import os
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import router  # noqa: E402

ART = os.path.join(ROOT, "artifacts", "evaluation", "background")
EVAL = os.path.join(ROOT, "evaluation", "background")
URL_CACHE = os.path.join(ART, "upload-urls.json")


def load(name):
    with open(os.path.join(EVAL, name)) as f:
        return json.load(f)


def source_path(clip):
    d = os.path.join(ART, "sources", clip)
    vids = sorted(f for f in os.listdir(d) if f.startswith("out") and f.endswith(".mp4")) if os.path.isdir(d) else []
    return os.path.join(d, vids[0]) if vids else os.path.join(d, "missing.mp4")


def location_still(ref):
    """16:9 1280x720 JPEG of a Location reference, matching the source aspect."""
    src = os.path.join(ART, ref, "out0_sample.png")
    dst = os.path.join(ART, ref, "plate-1280x720.jpg")
    if not os.path.exists(dst):
        img = cv2.imread(src)
        h, w = img.shape[:2]
        th = int(w * 9 / 16)
        if th <= h:
            y = (h - th) // 2
            img = img[y : y + th]
        else:
            tw = int(h * 16 / 9)
            x = (w - tw) // 2
            img = img[:, x : x + tw]
        cv2.imwrite(dst, cv2.resize(img, (1280, 720), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 92])
    return dst


def uploaded(path):
    cache = json.load(open(URL_CACHE)) if os.path.exists(URL_CACHE) else {}
    if path not in cache:
        cache[path] = router.upload(path)
        with open(URL_CACHE, "w") as f:
            json.dump(cache, f, indent=1)
    return cache[path]


def edit_prompt(loc, with_ref):
    ref = " Match the setting shown in the reference image." if with_ref else ""
    return (
        f"Replace only the background and setting with {loc['description']}.{ref} "
        "Keep every person and every object they touch exactly as in the source: same faces, hair, "
        "clothing, poses, gestures, expressions and timing. Keep the camera movement and framing identical. "
        "Adjust light on the people only as needed to sit naturally in the new setting."
    )


def body_for(pipeline, video_url, plate_url, loc):
    if pipeline == "bria-composite":
        return "bria/video-edit-replace-background", {
            "video": video_url,
            "background_url": plate_url,
            "output_container_and_codec": "mp4_h264",
            "preserve_audio": False,
        }
    if pipeline == "switchx-ref":
        return "beeble/switchx", {
            "generation_type": "video",
            "source_uri": video_url,
            "alpha_mode": "auto",
            "reference_image_uri": plate_url,
            "prompt": f"The same people in {loc['description']}.",
            "max_resolution": 720,
        }
    if pipeline == "kling-o1-edit":
        return "kling/kling-v3-omni", {
            "prompt": edit_prompt(loc, False).replace(
                "Replace only the background and setting with", "Replace only the background of <<<video_1>>> with the place in <<<image_1>>>:"
            ),
            "video_list": [{"video_url": video_url, "refer_type": "base", "keep_original_sound": "no"}],
            "image_list": [{"image_url": plate_url}],
            "mode": "std",
            "sound": "off",
        }
    if pipeline == "bfl-video-edit":
        return "bfl/video-edit-v1", {"video": video_url, "prompt": edit_prompt(loc, False), "safety_tolerance": 2}
    if pipeline == "wan27-edit":
        return "wan/wan2.7-videoedit", {
            "input": {
                "prompt": edit_prompt(loc, True),
                "media": [{"type": "video", "url": video_url}, {"type": "reference_image", "url": plate_url}],
            },
            "parameters": {"resolution": "720P", "prompt_extend": False, "watermark": False},
        }
    if pipeline == "aleph2-edit":
        return "runway/aleph2", {"promptText": edit_prompt(loc, False)[:1000], "videoUri": video_url, "seed": 1207}
    raise ValueError(pipeline)


def result_video(run_dir):
    """The pipeline's main output video (SwitchX also returns alpha and source)."""
    files = sorted(f for f in os.listdir(run_dir) if f.startswith("out") and f.endswith((".mp4", ".mov", ".webm")))
    for f in files:
        if "render" in f:
            return os.path.join(run_dir, f)
    for f in files:
        if "alpha" not in f and "source" not in f:
            return os.path.join(run_dir, f)
    return None


def matte_for(clip):
    d = os.path.join(ART, "runs", f"{clip}-switchx-ref")
    if os.path.isdir(d):
        for f in os.listdir(d):
            if "alpha" in f and f.endswith((".mp4", ".mov", ".webm")):
                return os.path.join(d, f)
    return None


def submit_one(clip, pipeline, plan, locs):
    loc = locs[plan["pairs"][clip]]
    run_dir = os.path.join(ART, "runs", f"{clip}-{pipeline}")
    if os.path.isdir(run_dir) and result_video(run_dir):
        return clip, pipeline, "exists"
    video_url = uploaded(source_path(clip))
    plate_url = uploaded(location_still(loc["references"][0]))
    model, body = body_for(pipeline, video_url, plate_url, loc)
    req_dir = os.path.join(EVAL, "requests")
    os.makedirs(req_dir, exist_ok=True)
    redacted = json.loads(json.dumps(body).replace(video_url, f"<source:{clip}>").replace(plate_url, f"<plate:{loc['references'][0]}>"))
    with open(os.path.join(req_dir, f"{clip}-{pipeline}.json"), "w") as f:
        json.dump({"model": model, "body": redacted}, f, indent=1)
    try:
        log = router.run(model, body, run_dir, poll_s=8, deadline_s=5400)
        return clip, pipeline, f"{log.get('elapsed_s')}s {len(log.get('files', []))} files"
    except Exception as e:  # noqa: BLE001
        return clip, pipeline, f"FAILED {e}"


def lock(clip, pipeline):
    """Composite source foreground (SwitchX matte) over a generative result."""
    run_dir = os.path.join(ART, "runs", f"{clip}-{pipeline}")
    res, matte = result_video(run_dir) if os.path.isdir(run_dir) else None, matte_for(clip)
    if not res or not matte:
        return None
    out_dir = os.path.join(ART, "runs", f"{clip}-{pipeline}+lock")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "out0_lock.mp4")
    cs, cm = cv2.VideoCapture(source_path(clip)), cv2.VideoCapture(matte)
    fps = cs.get(cv2.CAP_PROP_FPS)
    w, h = int(cs.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cs.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cr = cv2.VideoCapture(res)
    r_fps = cr.get(cv2.CAP_PROP_FPS) or fps
    r_frames = []
    while True:
        ok, f = cr.read()
        if not ok:
            break
        r_frames.append(cv2.resize(f, (w, h)))
    raw = out + ".raw.mp4"
    vw = cv2.VideoWriter(raw, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    last_m = None
    i = 0
    while True:
        ok, s = cs.read()
        if not ok:
            break
        # Providers may change the frame rate; pick the result frame nearest in time.
        r = r_frames[min(len(r_frames) - 1, int(round(i / fps * r_fps)))]
        okm, m = cm.read()
        m = cv2.resize(m, (w, h)) if okm else last_m
        last_m = m
        i += 1
        a = cv2.GaussianBlur(cv2.cvtColor(m, cv2.COLOR_BGR2GRAY), (5, 5), 0).astype(np.float32)[..., None] / 255.0
        vw.write((s.astype(np.float32) * a + r.astype(np.float32) * (1 - a)).astype(np.uint8))
    vw.release()
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", out], check=True)
    os.remove(raw)
    with open(os.path.join(out_dir, "router-log.json"), "w") as f:
        json.dump({"model": "local composite", "inputs": [source_path(clip), res, matte], "elapsed_s": 0}, f, indent=1)
    return out


def compare(clip, run_name):
    run_dir = os.path.join(ART, "runs", run_name)
    res = result_video(run_dir)
    if not res:
        return None
    metrics = os.path.join(run_dir, "review", "metrics.json")
    m = matte_for(clip)
    inputs = [res, os.path.join(HERE, "compare.py")] + ([m] if m else [])
    newest_input = max(os.path.getmtime(p) for p in inputs)
    if os.path.exists(metrics) and os.path.getmtime(metrics) > newest_input:
        return metrics
    args = [sys.executable, os.path.join(HERE, "compare.py"), source_path(clip), res, os.path.join(run_dir, "review"), "--label", run_name.split("-", 1)[1]]
    if m:
        args += ["--matte", m]
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)
    return os.path.join(run_dir, "review", "metrics.json")


def main():
    plan, locs = load("plan.json"), load("locations.json")
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["submit", "lock", "compare"])
    ap.add_argument("--clips", default=",".join(plan["pairs"]))
    ap.add_argument("--pipelines", default=",".join(plan["pipelines"]))
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    clips, pipes = a.clips.split(","), a.pipelines.split(",")
    if a.cmd == "submit":
        with cf.ThreadPoolExecutor(a.workers) as ex:
            futs = [ex.submit(submit_one, c, p, plan, locs) for c in clips for p in pipes if os.path.exists(source_path(c))]
            for f in cf.as_completed(futs):
                print(*f.result(), flush=True)
    elif a.cmd == "lock":
        for c in clips:
            for p in pipes:
                if p in ("bria-composite", "switchx-ref"):
                    continue
                print(c, p, lock(c, p), flush=True)
    else:
        for c in clips:
            for name in sorted(os.listdir(os.path.join(ART, "runs"))):
                if name.startswith(f"{c}-"):
                    try:
                        print(name, compare(c, name), flush=True)
                    except Exception as e:  # noqa: BLE001
                        print(name, "compare failed", e, flush=True)


if __name__ == "__main__":
    main()
