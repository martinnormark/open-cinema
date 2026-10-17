"""Run the shared comparison and the identity measurements for recast runs.

Usage: python3 evaluate.py PIPELINE[,PIPELINE] CLIP[,CLIP]|all
"""

from __future__ import annotations

import json
import subprocess
import sys

import identity
import recast

sys.path.insert(0, str(recast.ROOT / "evaluation/scripts"))
from compare import probe  # noqa: E402

COMPARE = recast.ROOT / "evaluation/scripts/compare.py"


def evaluate(pipeline: str, clip_id: str) -> dict | None:
    run = recast.ART / "runs" / pipeline / clip_id
    result = run / "result.mp4"
    matte = recast.ART / "mattes" / f"{clip_id}.mp4"
    if not result.exists() or not matte.exists():
        return None
    source = recast.source_path(recast.CLIPS[clip_id])
    if not (run / "metrics.json").exists():
        # compare.py pairs frames by index, so retime the result onto the source's
        # frame clock first; the original container facts are recorded separately.
        src_fps = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                           "stream=r_frame_rate,width,height", "-of", "csv=p=0", str(source)], text=True).strip().split(",")
        aligned = run / "result-aligned.mp4"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(result), "-vf",
                        f"fps={src_fps[2]},scale={src_fps[0]}:{src_fps[1]}", "-c:v", "libx264", "-crf", "16",
                        "-pix_fmt", "yuv420p", str(aligned)], check=True)
        (run / "result-container.json").write_text(json.dumps(probe(str(result))))
        subprocess.run(
            ["python3", str(COMPARE), str(source), str(aligned), str(run),
             "--matte", str(matte), "--label", pipeline],
            check=True, stdout=subprocess.DEVNULL,
        )
    metrics = json.loads((run / "metrics.json").read_text())
    ident = json.loads((run / "identity.json").read_text()) if (run / "identity.json").exists() else identity.measure(pipeline, clip_id)
    rec = json.loads((run / "router.json").read_text())
    orig = json.loads((run / "result-container.json").read_text())
    keys = ["protected_psnr_median", "protected_psnr_p5",
            "protected_ssim_median", "protected_change_rate", "target_mean_abs_diff"]
    row = {"pipeline": pipeline, "clip": clip_id, "turnaround_s": rec.get("pipeline_seconds") or rec.get("turnaround_seconds"),
           **{k: metrics.get(k) for k in keys},
           "result": "{width}x{height}@{fps:.2f} {frames}f {duration:.2f}s".format(**orig),
           "source": "{width}x{height}@{fps:.2f} {frames}f {duration:.2f}s".format(**metrics["source"]),
           "ref_sim": (ident["ref_sim"] or {}).get("median"), "ref_sim_min": (ident["ref_sim"] or {}).get("min"),
           "src_sim": (ident["src_sim"] or {}).get("median"),
           "protected_face_sim": (ident["protected_face_sim"] or {}).get("median"),
           "no_face": f"{ident['frames_without_target_face']}/{ident['sampled_frames']}"}
    (run / "summary.json").write_text(json.dumps(row, indent=1))
    return row


def main() -> None:
    pipes = sys.argv[1].split(",")
    clips = list(recast.CLIPS) if sys.argv[2] == "all" else sys.argv[2].split(",")
    for p in pipes:
        for c in clips:
            try:
                row = evaluate(p, c)
            except Exception as err:  # keep going; report per run
                row = {"pipeline": p, "clip": c, "error": str(err)[:300]}
            if row:
                print(json.dumps(row))


if __name__ == "__main__":
    main()
