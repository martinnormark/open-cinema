"""Minimal Comfy Router client for evaluation runs.

Credentials are never read here: in the agent environment the egress proxy
authenticates api.comfy.org. Locally, set COMFY_API_KEY and it is sent as
X-API-Key. Every run is recorded as JSON (request, estimate, timings, result)
so turnaround and cost can be reported from evidence.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = "https://api.comfy.org"


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {"Content-Type": "application/json", "User-Agent": "open-cinema-eval"}
    key = os.environ.get("COMFY_API_KEY")
    if key:
        headers["X-API-Key"] = key
    headers.update(extra or {})
    return headers


def _call(method: str, path: str, body: dict | None = None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method, headers=_headers(headers)
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw = res.read()
            ctype = res.headers.get("Content-Type", "")
            return res.status, dict(res.headers), (
                json.loads(raw) if "json" in ctype else raw
            )
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            payload = json.loads(raw)
        except ValueError:
            payload = raw.decode(errors="replace")
        return err.code, dict(err.headers), payload


def estimate(model: str, inputs: dict) -> dict:
    status, _, body = _call("POST", f"/v2/models/{model}/estimate", inputs)
    return {"status": status, "body": body}


def submit(model: str, inputs: dict, key: str | None = None) -> dict:
    key = key or str(uuid.uuid4())
    status, headers, body = _call(
        "POST", f"/v2/models/{model}/requests", inputs, {"Idempotency-Key": key}
    )
    if status != 201:
        raise RuntimeError(f"submit {model} -> {status}: {json.dumps(body)[:2000]}")
    return {"idempotency_key": key, **body}


def wait(model: str, request_id: str, poll: float = 10, limit: float = 4 * 3600):
    started = time.time()
    last = None
    while time.time() - started < limit:
        status, headers, body = _call(
            "GET", f"/v2/models/{model}/requests/{request_id}/status"
        )
        if status == 200 and isinstance(body, dict):
            if body.get("status") != last:
                last = body.get("status")
                print(f"  {model} {request_id[:8]} {last}", file=sys.stderr)
            if body.get("status") == "COMPLETED":
                return body
            if body.get("status") in ("FAILED", "CANCELLED", "ERROR"):
                raise RuntimeError(f"{model} {request_id} {body.get('status')}: {json.dumps(body)[:1000]}")
        time.sleep(poll)
    raise TimeoutError(f"{model} {request_id} did not finish within {limit}s")


def result(model: str, request_id: str):
    status, headers, body = _call("GET", f"/v2/models/{model}/requests/{request_id}")
    return status, headers, body


def run(model: str, inputs: dict, record: Path, poll: float = 10) -> dict:
    """Submit, wait, collect; write a JSON record. Returns the record."""
    record.parent.mkdir(parents=True, exist_ok=True)
    prior = json.loads(record.read_text()) if record.exists() else None
    if prior and prior.get("model") == model and prior.get("result_http") == 200:
        return prior  # already collected; output URLs stay valid for about 24 h
    if prior and prior.get("model") == model and prior.get("submit") and not prior.get("result_http"):
        # Resume a request this machine submitted before it restarted: never resubmit.
        rec, sub = prior, prior["submit"]
        t0 = t1 = prior["submitted_at"]
    else:
        t0 = time.time()
        sub = submit(model, inputs)
        t1 = time.time()
        rec = {
            "model": model,
            "input": _redact(inputs),
            "submit": sub,
            "submitted_at": t0,
        }
        record.write_text(json.dumps(rec, indent=2))
    final = wait(model, sub["request_id"], poll=poll)
    status, headers, body = result(model, sub["request_id"])
    t2 = time.time()
    rec.update(
        status=final,
        result_http=status,
        result=body if isinstance(body, (dict, list)) else f"<{len(body)} bytes>",
        credits_used=headers.get("X-Comfy-Credits-Used"),
        submit_seconds=round(t1 - t0, 2),
        turnaround_seconds=round(t2 - t0, 1),
    )
    record.write_text(json.dumps(rec, indent=2))
    if status != 200:
        raise RuntimeError(f"{model} failed: {json.dumps(body)[:2000]}")
    return rec


def _redact(value):
    """Keep records small: inline base64 media is replaced by its length."""
    if isinstance(value, str) and value.startswith("data:"):
        return f"<data-uri {len(value)} chars>"
    if isinstance(value, dict):
        return {k: _redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def find_urls(value) -> list[str]:
    """Every https URL in a model result, in document order."""
    out: list[str] = []
    if isinstance(value, str) and value.startswith("https://"):
        out.append(value)
    elif isinstance(value, dict):
        for v in value.values():
            out += find_urls(v)
    elif isinstance(value, list):
        for v in value:
            out += find_urls(v)
    return out


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "open-cinema-eval"})
    with urllib.request.urlopen(req, timeout=300) as res:
        dest.write_bytes(res.read())
    return dest


def data_uri(path: Path) -> str:
    import base64
    import mimetypes

    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def upload(path: Path, content_type: str | None = None) -> str:
    """Stage a local file on Comfy's partner-node storage and return a signed
    HTTPS download URL (valid ~24 h). This is the same staging ComfyUI's API
    nodes use for video inputs that providers only accept by URL."""
    import mimetypes
    import hashlib

    ctype = content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    digest = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    status, _, body = _call(
        "POST",
        "/customers/storage",
        {"file_name": f"{digest}-{path.name}", "content_type": ctype},
    )
    if status != 200:
        raise RuntimeError(f"storage -> {status}: {body}")
    req = urllib.request.Request(
        body["upload_url"], data=path.read_bytes(), method="PUT",
        headers={"Content-Type": ctype},
    )
    with urllib.request.urlopen(req, timeout=300) as res:
        if res.status not in (200, 201):
            raise RuntimeError(f"upload PUT -> {res.status}")
    return body["download_url"]
