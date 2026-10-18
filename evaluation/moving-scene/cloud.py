#!/usr/bin/env python3
"""Submit API graphs to Comfy Cloud (proxy injects auth). Usage:
  cloud.py upload FILE            -> prints stored name
  cloud.py submit GRAPH.json      -> prints prompt_id
  cloud.py status PROMPT_ID       -> prints job status/outputs
"""
import json, sys, uuid, urllib.request, mimetypes, os
BASE = "https://cloud.comfy.org"

def upload(path):
    boundary = uuid.uuid4().hex
    name = os.path.basename(path)
    ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
    parts = []
    for k, v in (("type", "input"), ("overwrite", "true")):
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: {ctype}\r\n\r\n".encode() + open(path, "rb").read() + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(BASE + "/api/upload/image", data=b"".join(parts), method="POST",
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    return json.load(urllib.request.urlopen(req, timeout=600))["name"]

def submit(graph):
    req = urllib.request.Request(BASE + "/api/prompt", data=json.dumps({"prompt": graph}).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        return json.load(urllib.request.urlopen(req, timeout=120))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{e.code} {e.read().decode()[:4000]}")

def status(pid):
    return json.load(urllib.request.urlopen(BASE + f"/api/jobs/{pid}", timeout=60))

if __name__ == "__main__":
    cmd, arg = sys.argv[1], sys.argv[2]
    if cmd == "upload": print(upload(arg))
    elif cmd == "submit": print(json.dumps(submit(json.load(open(arg)))))
    elif cmd == "status": print(json.dumps(status(arg), indent=1)[:6000])
