#!/usr/bin/env python3
"""Minimal Comfy Router client for the evaluation harness (stdlib only).

Auth: COMFY_API_KEY is sent as X-API-Key when set; in the agent container the
egress proxy injects credentials for api.comfy.org instead. The key is never
printed or written to disk.

  router.py upload FILE                      -> prints a signed download URL
  router.py run MODEL BODY.json OUT_DIR      -> queued submit, poll, download outputs
  router.py schema MODEL                     -> prints the model's request schema
"""
import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("COMFY_ROUTER_BASE", "https://api.comfy.org")


def _headers(extra=None):
    h = {"accept": "application/json"}
    key = os.environ.get("COMFY_API_KEY")
    if key:
        h["X-API-Key"] = key
    h.update(extra or {})
    return h


def _call(method, path, body=None, headers=None, timeout=120):
    data = None if body is None else json.dumps(body).encode()
    h = _headers(headers)
    if data is not None:
        h["content-type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            text = r.read().decode()
            return r.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        text = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, {"raw": text[:2000]}


def upload(path):
    """Upload a local file to Comfy's API-node storage and return a signed GET URL."""
    name = f"{uuid.uuid4().hex[:8]}-{os.path.basename(path)}"
    ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
    status, res = _call("POST", "/customers/storage", {"file_name": name, "content_type": ctype})
    if status != 200:
        raise RuntimeError(f"storage slot failed: {status} {res}")
    with open(path, "rb") as f:
        req = urllib.request.Request(res["upload_url"], data=f.read(), method="PUT", headers={"content-type": ctype})
    with urllib.request.urlopen(req, timeout=600) as r:
        if r.status not in (200, 201):
            raise RuntimeError(f"upload failed: {r.status}")
    return res["download_url"]


MEDIA_URL = re.compile(r"https://[^\s\"']+\.(?:mp4|mov|webm|png|jpe?g|webp)(?:\?[^\s\"']*)?", re.I)


def _find_urls(doc):
    out = []

    def walk(v, key=""):
        if isinstance(v, dict):
            for k, x in v.items():
                walk(x, k)
        elif isinstance(v, list):
            for x in v:
                walk(x, key)
        elif isinstance(v, str) and v.startswith("https://"):
            if MEDIA_URL.match(v) or key.endswith(("url", "uri", "render", "alpha", "source", "video", "image")):
                out.append((key, v))

    walk(doc)
    return out


def run(model, body, out_dir, poll_s=5, deadline_s=3600):
    os.makedirs(out_dir, exist_ok=True)
    log = {"model": model, "submitted_at": time.time(), "request": body}
    idem = uuid.uuid4().hex
    status, res = _call("POST", f"/v2/models/{model}/requests", body, {"Idempotency-Key": idem})
    log["submit_status"], log["submit_response"] = status, res
    if status >= 300:
        _write(out_dir, log)
        raise RuntimeError(f"submit failed {status}: {json.dumps(res)[:800]}")
    rid = res.get("request_id") or res.get("id")
    log["request_id"] = rid
    t0 = time.time()
    last = None
    while time.time() - t0 < deadline_s:
        s, st = _call("GET", f"/v2/models/{model}/requests/{rid}/status")
        state = (st or {}).get("status") if isinstance(st, dict) else None
        if state != last:
            print(f"[{model}] {int(time.time()-t0)}s {state}", flush=True)
            last = state
        if state and state.upper() in ("COMPLETED", "FAILED", "CANCELLED", "ERROR"):
            log["final_status"] = st
            break
        time.sleep(poll_s)
    else:
        log["final_status"] = "deadline"
    log["elapsed_s"] = round(time.time() - t0, 1)
    s, result = _call("GET", f"/v2/models/{model}/requests/{rid}")
    log["result_status"], log["result"] = s, result
    files = _save_inline(result, out_dir)
    for i, (key, url) in enumerate(_find_urls(result)):
        ext = os.path.splitext(url.split("?")[0])[1] or ".bin"
        dest = os.path.join(out_dir, f"out{i}_{key}{ext}")
        try:
            urllib.request.urlretrieve(url, dest)
            files.append(dest)
        except Exception as e:  # noqa: BLE001
            log.setdefault("download_errors", []).append(f"{key}: {e}")
    log["files"] = files
    _write(out_dir, log)
    return log


def _save_inline(doc, out_dir):
    """Decode inline base64 media (Veo returns `bytesBase64Encoded`) and redact it from the log."""
    import base64

    saved = []

    def walk(v):
        if isinstance(v, dict):
            for k, x in list(v.items()):
                if k == "bytesBase64Encoded" and isinstance(x, str):
                    ext = ".mp4" if "video" in (v.get("mimeType") or "video/mp4") else ".png"
                    dest = os.path.join(out_dir, f"out{len(saved)}_inline{ext}")
                    with open(dest, "wb") as f:
                        f.write(base64.b64decode(x))
                    saved.append(dest)
                    v[k] = f"<{len(x)} base64 chars saved to {os.path.basename(dest)}>"
                else:
                    walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(doc)
    return saved


def _write(out_dir, log):
    with open(os.path.join(out_dir, "router-log.json"), "w") as f:
        json.dump(log, f, indent=2)


def schema(model):
    s, d = _call("GET", f"/v2/models/{model}/openapi.json")
    post = list(d["paths"].values())[0]["post"]
    return post["requestBody"]["content"]["application/json"]["schema"]


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "upload":
        print(upload(sys.argv[2]))
    elif cmd == "run":
        body = json.load(open(sys.argv[3]))
        log = run(sys.argv[2], body, sys.argv[4])
        print(json.dumps({k: log.get(k) for k in ("request_id", "elapsed_s", "files", "final_status")}, indent=1))
    elif cmd == "schema":
        print(json.dumps(schema(sys.argv[2]), indent=1))
