"""Protected-region matte for a recast source clip.

Segments people in every frame of the SOURCE (never the result), follows the
target person chosen by `target_point` (fractions of width/height on frame 0)
and writes a matte video where white = protected (everything except the
target) and black = target (dilated so edges of the replacement do not count
against preservation). The matte feeds evaluation/scripts/compare.py --matte.

Requires: pip install ultralytics (YOLO11 segmentation; weights download once).
Usage: python3 matte.py CLIP_ID [--weights yolo11m-seg.pt]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

import recast


def iou(a, b) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / area if area else 0.0


def hist(frame, mask):
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    h = cv2.calcHist([hsv], [0, 1], (mask > 0.5).astype(np.uint8), [30, 32], [0, 180, 0, 256])
    return cv2.normalize(h, h).flatten()


def build(clip_id: str, weights: str) -> Path:
    clip = recast.CLIPS[clip_id]
    src = recast.source_path(clip)
    out = recast.ART / "mattes" / f"{clip_id}.mp4"
    out.parent.mkdir(parents=True, exist_ok=True)
    model = YOLO(weights)
    cap = cv2.VideoCapture(str(src))
    fps = cap.get(cv2.CAP_PROP_FPS)
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = cv2.VideoWriter(str(out.with_suffix(".raw.mp4")), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    px, py = clip["target_point"][0] * w, clip["target_point"][1] * h
    last_box, signature, coverage, i = None, None, [], 0
    kernel = np.ones((25, 25), np.uint8)
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        res = model.predict(frame, classes=[0], conf=0.25, verbose=False, retina_masks=True)[0]
        target = np.zeros((h, w), np.uint8)
        if res.masks is not None and len(res.boxes):
            boxes = res.boxes.xyxy.cpu().numpy()
            masks = res.masks.data.cpu().numpy()
            if last_box is None:
                # Frame 0: the person whose mask contains the hint point, else the nearest box centre.
                hits = [k for k in range(len(boxes)) if masks[k][int(py), int(px)] > 0.5]
                pick = hits[0] if hits else int(np.argmin([np.hypot((b[0] + b[2]) / 2 - px, (b[1] + b[3]) / 2 - py) for b in boxes]))
            else:
                scores = [iou(b, last_box) for b in boxes]
                pick = int(np.argmax(scores)) if max(scores) > 0.2 else None
                if pick is None and signature is not None:
                    # Re-acquire after an occlusion by appearance: the colour signature of the target at frame 0.
                    sims = [cv2.compareHist(signature, hist(frame, masks[k]), cv2.HISTCMP_CORREL) for k in range(len(boxes))]
                    if sims and max(sims) > 0.6:
                        pick = int(np.argmax(sims))
            if pick is not None:
                if signature is None:
                    signature = hist(frame, masks[pick])
                last_box = boxes[pick]
                target = (masks[pick] > 0.5).astype(np.uint8)
        target = cv2.dilate(target, kernel, iterations=1)
        coverage.append(float(target.mean()))
        matte = np.where(target > 0, 0, 255).astype(np.uint8)
        writer.write(cv2.cvtColor(matte, cv2.COLOR_GRAY2BGR))
        i += 1
    writer.release()
    import subprocess

    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(out.with_suffix(".raw.mp4")), "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", str(out)], check=True)
    out.with_suffix(".raw.mp4").unlink()
    lost = sum(1 for c in coverage if c == 0)
    (out.with_suffix(".json")).write_text(json.dumps({"frames": i, "frames_without_target": lost, "mean_target_coverage": round(float(np.mean(coverage)), 4)}))
    print(clip_id, i, "frames, target lost in", lost)
    return out


if __name__ == "__main__":
    weights = sys.argv[sys.argv.index("--weights") + 1] if "--weights" in sys.argv else "/tmp/claude-0/sp/yolo11m-seg.pt"
    for cid in sys.argv[1].split(","):
        build(cid, weights)
