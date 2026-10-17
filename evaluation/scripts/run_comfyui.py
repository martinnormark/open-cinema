#!/usr/bin/env python3
"""Run the packaged workflows/background-replace graphs in a local ComfyUI.

  run_comfyui.py --comfy-dir PATH [--server http://127.0.0.1:8188] [--clips c1,c2] [--graphs kling,switchx]

Copies each clip and its Location references into ComfyUI's input folder, fills
the graph's file names and prompt from evaluation/background/locations.json, runs
it, and copies outputs to artifacts/evaluation/background/runs/<clip>-comfyui-<graph>/.
Partner nodes bill the signed-in Comfy account (or a credential-injecting relay
passed to ComfyUI with --comfy-api-base).
"""
import argparse
import concurrent.futures as cf
import json
import os
import shutil
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import run_background as rb  # noqa: E402

GRAPHS = {
    "kling": "background-replace.api.json",
    "switchx": "background-replace-switchx.api.json",
}


def kling_prompt(loc):
    return (
        f"Replace only the background of <<<video_1>>> with {loc['element'][1:]} ({loc['state']}): {loc['description']}. "
        "Use the place shown in <<<image_1>>> and <<<image_2>>> as the new setting. "
        "Keep every person and every object they hold or touch exactly as in the source: same faces, hair, clothing, "
        "poses, gestures, expressions and timing. Keep the camera movement, framing and lens identical. "
        "Adjust light and shadows on the people only as needed to sit naturally in the new setting."
    )


def switchx_prompt(loc):
    return f"The same people, unchanged, in {loc['element'][1:]} ({loc['state']}): {loc['description']}."


def post(server, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(server + path, data=data, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode() or "null")


def run(server, comfy_dir, clip, graph, plan, locs):
    loc = locs[plan["pairs"][clip]]
    out_dir = os.path.join(rb.ART, "runs", f"{clip}-comfyui-{graph}")
    if os.path.isdir(out_dir) and any(f.startswith("out") for f in os.listdir(out_dir)):
        return clip, graph, "exists"
    inp = os.path.join(comfy_dir, "input")
    src_name = f"oc-{clip}.mp4"
    shutil.copy(rb.source_path(clip), os.path.join(inp, src_name))
    refs = loc["references"] + loc["references"][:1]  # Kling graph takes two; repeat if one
    ref_names = []
    for i, ref in enumerate(refs[:2]):
        name = f"oc-{plan['pairs'][clip]}-{i + 1}.jpg"
        shutil.copy(rb.location_still(ref) if i == 0 else rb.location_still(ref), os.path.join(inp, name))
        ref_names.append(name)
    g = json.load(open(os.path.join(ROOT, "workflows", "background-replace", GRAPHS[graph])))
    for node in g.values():
        node.pop("_meta", None)
        ct, ins = node["class_type"], node["inputs"]
        if ct == "LoadVideo":
            ins["file"] = src_name
        if ct == "LoadImage":
            ins["image"] = ref_names[0] if ins["image"] == "location-1.jpg" else ref_names[1]
        if ct == "KlingOmniProEditVideoNode":
            ins["prompt"] = kling_prompt(loc)
        if ct == "BeebleSwitchXVideoEdit":
            ins["prompt"] = switchx_prompt(loc)
        if ct == "SaveVideo":
            ins["filename_prefix"] = f"oc-eval/{clip}-{graph}-" + ("matte" if ins["video"][1] == 1 else "render")
    t0 = time.time()
    pid = post(server, "/prompt", {"prompt": g, "client_id": "oc-eval"})["prompt_id"]
    while True:
        hist = post(server, f"/history/{pid}").get(pid)
        if hist and hist.get("status", {}).get("completed") is not None or (hist and hist.get("status", {}).get("status_str") == "error"):
            break
        time.sleep(5)
    elapsed = round(time.time() - t0, 1)
    os.makedirs(out_dir, exist_ok=True)
    files = []
    for node_out in hist.get("outputs", {}).values():
        for item in node_out.get("images", []) + node_out.get("videos", []) + node_out.get("gifs", []):
            if item.get("type", "output") != "output":  # LoadVideo previews its input
                continue
            src = os.path.join(comfy_dir, "output", item.get("subfolder", ""), item["filename"])
            kind = "alpha" if "matte" in item["filename"] else "render"
            dest = os.path.join(out_dir, f"out{len(files)}_{kind}.mp4")
            shutil.copy(src, dest)
            files.append(dest)
    with open(os.path.join(out_dir, "router-log.json"), "w") as f:
        json.dump({"model": f"ComfyUI graph {GRAPHS[graph]}", "elapsed_s": elapsed, "status": hist.get("status"), "files": files}, f, indent=1)
    return clip, graph, f"{elapsed}s {len(files)} files {hist.get('status', {}).get('status_str')}"


def collect(server, comfy_dir):
    """Copy finished oc-eval outputs from ComfyUI history into run folders (for runs whose client died)."""
    for pid, h in post(server, "/history").items():
        outs = [i for o in h.get("outputs", {}).values() for i in o.get("images", []) + o.get("videos", []) if i.get("type") == "output" and i.get("subfolder") == "oc-eval"]
        if not outs:
            continue
        clip, graph = outs[0]["filename"].split("-")[:2]
        out_dir = os.path.join(rb.ART, "runs", f"{clip}-comfyui-{graph}")
        if os.path.exists(os.path.join(out_dir, "router-log.json")):
            continue
        ts = {m[0]: m[1].get("timestamp") for m in h["status"].get("messages", [])}
        elapsed = round((ts["execution_success"] - ts["execution_start"]) / 1000, 1) if "execution_success" in ts else None
        os.makedirs(out_dir, exist_ok=True)
        files = []
        for item in sorted(outs, key=lambda i: "matte" in i["filename"]):
            dest = os.path.join(out_dir, f"out{len(files)}_{'alpha' if 'matte' in item['filename'] else 'render'}.mp4")
            shutil.copy(os.path.join(comfy_dir, "output", "oc-eval", item["filename"]), dest)
            files.append(dest)
        with open(os.path.join(out_dir, "router-log.json"), "w") as f:
            json.dump({"model": f"ComfyUI graph {GRAPHS[graph]}", "elapsed_s": elapsed, "elapsed_basis": "ComfyUI execution", "status": h.get("status", {}).get("status_str"), "files": files}, f, indent=1)
        print(clip, graph, elapsed, len(files))


def main():
    plan, locs = rb.load("plan.json"), rb.load("locations.json")
    ap = argparse.ArgumentParser()
    ap.add_argument("--comfy-dir", required=True)
    ap.add_argument("--server", default="http://127.0.0.1:8188")
    ap.add_argument("--clips", default=",".join(plan["pairs"]))
    ap.add_argument("--graphs", default="kling,switchx")
    ap.add_argument("--collect", action="store_true", help="only copy finished outputs from ComfyUI history")
    a = ap.parse_args()
    if a.collect:
        return collect(a.server, a.comfy_dir)
    # ComfyUI executes one prompt at a time; submit sequentially from a small pool.
    with cf.ThreadPoolExecutor(2) as ex:
        futs = [ex.submit(run, a.server, a.comfy_dir, c, g, plan, locs) for c in a.clips.split(",") for g in a.graphs.split(",")]
        for f in cf.as_completed(futs):
            print(*f.result(), flush=True)


if __name__ == "__main__":
    main()
