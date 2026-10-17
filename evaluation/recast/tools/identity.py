"""Face-identity measurements for a recast run (supports rubric A1 and B1).

For sampled frames of the SOURCE and RESULT:
- target face: the face whose centre lies in the target region of the source
  matte (black). Its ArcFace similarity to the Character's reference faces is
  `ref_sim`; its similarity to the source person's face at the same timestamp
  is `src_sim` (should fall: the person was replaced).
- protected faces: every other source face is matched to the nearest result
  face; `protected_sim` is their similarity (should stay high).

ArcFace (insightface buffalo_l) cosine similarity: same person typically
> 0.45, different people < 0.25. Profile and back views yield no face; those
frames are counted, not scored. Numbers support review, never replace it.

Usage: python3 identity.py PIPELINE CLIP_ID [--every 6]
Writes runs/<pipeline>/<clip>/identity.json.
"""

from __future__ import annotations

import json
import sys
from functools import lru_cache

import cv2
import numpy as np
from insightface.app import FaceAnalysis

import recast


@lru_cache(maxsize=1)
def app() -> FaceAnalysis:
    fa = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"], allowed_modules=["detection", "recognition"])
    fa.prepare(ctx_id=-1, det_size=(640, 640))
    return fa


def faces(img):
    return [(f.bbox, f.normed_embedding) for f in app().get(img)]


@lru_cache(maxsize=4)
def reference(char_id: str) -> np.ndarray:
    embs = []
    for view in ("face", "front-full", "face-34", "three-quarter"):
        name = recast.CHARS[char_id]["views"].get(view)
        if not name:
            continue
        img = cv2.imread(str(recast.HERE / "references" / char_id / name))
        if img is None:
            continue
        found = faces(img)
        if found:
            embs.append(max(found, key=lambda f: (f[0][2] - f[0][0]) * (f[0][3] - f[0][1]))[1])
    v = np.mean(embs, axis=0)
    return v / np.linalg.norm(v)


def read(path, size=None):
    cap = cv2.VideoCapture(str(path))
    out = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        out.append(cv2.resize(f, size) if size else f)
    return out, cap.get(cv2.CAP_PROP_FPS)


def centre(b):
    return (b[0] + b[2]) / 2, (b[1] + b[3]) / 2


def measure(pipeline: str, clip_id: str, every: int = 6) -> dict:
    clip = recast.CLIPS[clip_id]
    run = recast.ART / "runs" / pipeline / clip_id
    src, sfps = read(recast.source_path(clip))
    h, w = src[0].shape[:2]
    res, rfps = read(run / "result.mp4", (w, h))
    matte, _ = read(recast.ART / "mattes" / f"{clip_id}.mp4", (w, h))
    ref = reference(clip["character"])
    ref_sims, src_sims, prot_sims, no_face = [], [], [], 0
    for i in range(0, len(src), every):
        t = i / sfps
        j = min(len(res) - 1, int(round(t * rfps)))
        m = matte[min(i, len(matte) - 1)][:, :, 0] if matte else None
        sf, rf = faces(src[i]), faces(res[j])

        def in_target(b):
            x, y = centre(b)
            return m is not None and m[int(min(h - 1, max(0, y))), int(min(w - 1, max(0, x)))] < 128

        src_target = [f for f in sf if in_target(f[0])]
        res_target = [f for f in rf if in_target(f[0])]
        if res_target:
            emb = max(res_target, key=lambda f: (f[0][2] - f[0][0]))[1]
            ref_sims.append(float(emb @ ref))
            if src_target:
                src_sims.append(float(emb @ src_target[0][1]))
        else:
            no_face += 1
        for b, e in (f for f in sf if not in_target(f[0])):
            cx, cy = centre(b)
            cands = [f for f in rf if not in_target(f[0])]
            if not cands:
                prot_sims.append(0.0)
                continue
            near = min(cands, key=lambda f: np.hypot(centre(f[0])[0] - cx, centre(f[0])[1] - cy))
            if np.hypot(centre(near[0])[0] - cx, centre(near[0])[1] - cy) < 0.15 * w:
                prot_sims.append(float(near[1] @ e))
            else:
                prot_sims.append(0.0)

    def stats(xs):
        return {"n": len(xs), "median": round(float(np.median(xs)), 3), "min": round(float(np.min(xs)), 3)} if xs else None

    out = {
        "pipeline": pipeline,
        "clip": clip_id,
        "sampled_frames": len(range(0, len(src), every)),
        "frames_without_target_face": no_face,
        "ref_sim": stats(ref_sims),
        "src_sim": stats(src_sims),
        "protected_face_sim": stats(prot_sims),
    }
    (run / "identity.json").write_text(json.dumps(out, indent=1))
    return out


if __name__ == "__main__":
    every = int(sys.argv[sys.argv.index("--every") + 1]) if "--every" in sys.argv else 6
    print(json.dumps(measure(sys.argv[1], sys.argv[2], every)))
