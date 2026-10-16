#!/usr/bin/env python3
"""Compare a selective-revision result against its source clip.

  compare.py SOURCE RESULT OUT_DIR [--matte SOURCE_ALPHA] [--label NAME]

Writes to OUT_DIR:
  side-by-side.mp4   source | result | protected-region difference, at source fps
  contact-sheet.jpg  source over result at six matched timestamps
  metrics.json       container facts and the rubric's objective measurements

The matte must be an alpha (white = protected foreground) of the SOURCE, never the
result. Without a matte only container facts and whole-frame numbers are reported.
Requires ffmpeg/ffprobe, numpy, opencv-python-headless.
"""
import argparse
import json
import os
import subprocess

import cv2
import numpy as np


def probe(path):
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames",
            "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames,duration",
            "-of", "json", path,
        ]
    )
    s = json.loads(out)["streams"][0]
    num, den = s["r_frame_rate"].split("/")
    return {
        "width": int(s["width"]),
        "height": int(s["height"]),
        "fps": round(float(num) / float(den), 3),
        "frames": int(s.get("nb_read_frames") or 0),
        "duration": float(s.get("duration") or 0),
    }


def frames(path, size=None):
    cap = cv2.VideoCapture(path)
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if size and (f.shape[1], f.shape[0]) != size:
            f = cv2.resize(f, size, interpolation=cv2.INTER_AREA)
        out.append(f)
    cap.release()
    return out


def psnr(a, b, mask):
    m = mask > 0
    if m.sum() < 64:
        return None
    d = (a[m].astype(np.float32) - b[m].astype(np.float32)) ** 2
    mse = float(d.mean())
    return 99.0 if mse == 0 else 10 * np.log10(255.0**2 / mse)


def ssim(a, b, mask):
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    blur = lambda x: cv2.GaussianBlur(x, (11, 11), 1.5)  # noqa: E731
    mu_a, mu_b = blur(ga), blur(gb)
    va = blur(ga * ga) - mu_a**2
    vb = blur(gb * gb) - mu_b**2
    cov = blur(ga * gb) - mu_a * mu_b
    smap = ((2 * mu_a * mu_b + c1) * (2 * cov + c2)) / ((mu_a**2 + mu_b**2 + c1) * (va + vb + c2))
    m = mask > 0
    return float(smap[m].mean()) if m.sum() >= 64 else None


def pct(xs, q):
    xs = [x for x in xs if x is not None]
    return round(float(np.percentile(xs, q)), 3) if xs else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("result")
    ap.add_argument("out_dir")
    ap.add_argument("--matte")
    ap.add_argument("--label", default="result")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    sp, rp = probe(args.source), probe(args.result)
    size = (sp["width"], sp["height"])
    src = frames(args.source)
    res = frames(args.result, size)
    n = min(len(src), len(res))
    mattes = frames(args.matte, size) if args.matte else []

    metrics = {
        "label": args.label,
        "source": sp,
        "result": rp,
        "frame_delta": rp["frames"] - sp["frames"],
        "duration_delta_s": round(rp["duration"] - sp["duration"], 3),
        "resolution_match": (sp["width"], sp["height"]) == (rp["width"], rp["height"]),
        "compared_frames": n,
    }

    kernel = np.ones((9, 9), np.uint8)
    fg_psnr, fg_ssim, bg_change, flick_src, flick_res = [], [], [], [], []
    whole_psnr = []
    vis = []
    for i in range(n):
        a, b = src[i], res[i]
        whole_psnr.append(psnr(a, b, np.ones(a.shape[:2], np.uint8)))
        diff = cv2.absdiff(a, b)
        if mattes:
            alpha = cv2.cvtColor(mattes[min(i, len(mattes) - 1)], cv2.COLOR_BGR2GRAY)
            fg = cv2.erode((alpha > 127).astype(np.uint8), kernel, iterations=2)
            bg = cv2.erode((alpha <= 127).astype(np.uint8), kernel, iterations=2)
            fg_psnr.append(psnr(a, b, fg))
            fg_ssim.append(ssim(a, b, fg))
            if bg.sum():
                bg_change.append(float(diff.mean(axis=2)[bg > 0].mean()))
            if i > 0 and bg.sum():
                flick_src.append(float(cv2.absdiff(a, src[i - 1]).mean(axis=2)[bg > 0].mean()))
                flick_res.append(float(cv2.absdiff(b, res[i - 1]).mean(axis=2)[bg > 0].mean()))
            heat = cv2.applyColorMap(cv2.convertScaleAbs(diff.mean(axis=2) * fg, alpha=3), cv2.COLORMAP_INFERNO)
        else:
            heat = cv2.applyColorMap(cv2.convertScaleAbs(diff.mean(axis=2), alpha=3), cv2.COLORMAP_INFERNO)
        vis.append(np.hstack([a, b, heat]))

    metrics["whole_frame_psnr_median"] = pct(whole_psnr, 50)
    if mattes:
        metrics.update(
            {
                "protected_psnr_median": pct(fg_psnr, 50),
                "protected_psnr_p5": pct(fg_psnr, 5),
                "protected_ssim_median": pct(fg_ssim, 50),
                "protected_ssim_p5": pct(fg_ssim, 5),
                "protected_change_rate": round(sum(1 for x in fg_psnr if x is not None and x < 30) / max(1, len(fg_psnr)), 3),
                "target_mean_abs_diff": pct(bg_change, 50),
                "target_flicker_added": round(float(np.mean(flick_res) - np.mean(flick_src)), 3) if flick_res else None,
            }
        )
        metrics["per_frame_protected_psnr"] = [None if x is None else round(x, 2) for x in fg_psnr]

    # Side-by-side video at source fps (scaled to keep files small).
    h, w = vis[0].shape[:2]
    scale = min(1.0, 1920 / w)
    vw, vh = int(w * scale) // 2 * 2, int(h * scale) // 2 * 2
    raw = os.path.join(args.out_dir, "side-by-side.raw.mp4")
    vw_ = cv2.VideoWriter(raw, cv2.VideoWriter_fourcc(*"mp4v"), sp["fps"], (vw, vh))
    for i, f in enumerate(vis):
        f = cv2.resize(f, (vw, vh))
        cv2.putText(f, f"t={i / sp['fps']:.2f}s  source | {args.label} | protected diff", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        vw_.write(f)
    vw_.release()
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", os.path.join(args.out_dir, "side-by-side.mp4")],
        check=True,
    )
    os.remove(raw)

    # Contact sheet: six matched timestamps, source above result.
    idx = [int(round(x)) for x in np.linspace(0, n - 1, 6)]
    tw = 480
    th = int(tw * size[1] / size[0])
    cols = []
    for i in idx:
        a = cv2.resize(src[i], (tw, th))
        b = cv2.resize(res[i], (tw, th))
        cv2.putText(a, f"source t={i / sp['fps']:.2f}s", (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
        cv2.putText(b, args.label, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
        cols.append(np.vstack([a, b]))
    cv2.imwrite(os.path.join(args.out_dir, "contact-sheet.jpg"), np.hstack(cols), [cv2.IMWRITE_JPEG_QUALITY, 88])

    with open(os.path.join(args.out_dir, "metrics.json"), "w") as f:
        json.dump(metrics, f, indent=1)
    print(json.dumps({k: v for k, v in metrics.items() if k != "per_frame_protected_psnr"}, indent=1))


if __name__ == "__main__":
    main()
