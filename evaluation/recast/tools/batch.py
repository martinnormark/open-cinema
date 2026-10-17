"""Run a set of Router jobs concurrently and download their first media output.

Usage: python3 batch.py jobs.json [--only id1,id2]
jobs.json: [{"id": "...", "model": "provider/model", "input": {...},
             "out": "path/relative/to/repo.mp4"}]
Inputs may reference local files as "@file:relative/path", which are inlined
as data URIs (only for fields whose model accepts data URIs).
Each job writes artifacts/evaluation/recast/runs/<id>.json.
"""

from __future__ import annotations

import json
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import router

ROOT = Path(__file__).resolve().parents[3]
RUNS = ROOT / "artifacts/evaluation/recast/runs"
MEDIA_EXT = (".mp4", ".mov", ".png", ".jpg", ".jpeg", ".webp")


def expand(value):
    if isinstance(value, str) and value.startswith("@file:"):
        return router.data_uri(ROOT / value[6:])
    if isinstance(value, dict):
        return {k: expand(v) for k, v in value.items()}
    if isinstance(value, list):
        return [expand(v) for v in value]
    return value


def pick(urls: list[str], want: str) -> str | None:
    for url in urls:
        path = url.split("?")[0].lower()
        if path.endswith(want):
            return url
    for url in urls:
        if url.split("?")[0].lower().endswith(MEDIA_EXT):
            return url
    return urls[0] if urls else None


def one(job: dict) -> str:
    out = ROOT / job["out"]
    if out.exists() and not job.get("force"):
        return f"{job['id']}: exists"
    try:
        rec = router.run(job["model"], expand(job["input"]), RUNS / f"{job['id']}.json")
        url = pick(router.find_urls(rec["result"]), out.suffix)
        if not url:
            return f"{job['id']}: no media url in result"
        router.download(url, out)
        rec["output_url"] = url
        rec["output_file"] = job["out"]
        (RUNS / f"{job['id']}.json").write_text(json.dumps(rec, indent=2))
        return f"{job['id']}: ok {rec['turnaround_seconds']}s credits={rec['credits_used']}"
    except Exception as err:  # keep the batch going; the record holds details
        traceback.print_exc()
        return f"{job['id']}: FAILED {err}"[:1500]


def main() -> None:
    jobs = json.loads(Path(sys.argv[1]).read_text())
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
        jobs = [j for j in jobs if j["id"] in only]
    with ThreadPoolExecutor(max_workers=8) as pool:
        for line in pool.map(one, jobs):
            print(line, flush=True)


if __name__ == "__main__":
    main()
