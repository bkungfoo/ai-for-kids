"""Vertex AI custom-container shim for ACE-Step 1.5.

Vertex speaks {instances:[...]} -> {predictions:[...]} on AIP_PREDICT_ROUTE and
probes AIP_HEALTH_ROUTE; ACE-Step's bundled API server (acestep-api, :8001)
speaks release_task / query_result / v1/audio. This FastAPI app (port 8080)
bridges the two.

Readiness design (learned the hard way): ACE-Step is a single-worker server
that BLOCKS while it loads ~9 GB of weights onto the GPU, so it can't answer
its own health during load. If we gate Vertex health on ACE-Step readiness,
Vertex kills the replica mid-load (crash-loop) or the deploy times out. So:

  * /health returns 200 as soon as THIS shim is up (liveness only) — Vertex
    keeps the replica alive and finishes the deploy quickly.
  * A background thread warms ACE-Step (one tiny generation) to force the
    model load exactly once, then flips MODEL_READY.
  * /predict returns 503 (retryable) until MODEL_READY, so the caller's
    cold-start retry loop rides out the load instead of failing.

Field names verified against acestep/api/http/*_route.py (release_task ->
data.task_id; query_result body {"task_id_list":[...]} -> items with integer
status 0/1/2 and a "file" path; GET /v1/audio?path=<file>).
"""

import base64
import json
import os
import subprocess
import sys
import tempfile
import threading
import time

import requests
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

ACE_LOG = "/tmp/ace.log"


def _ace_log_tail(max_chars=1500):
    """Last chunk of ACE-Step's own log — surfaced in 503 bodies because
    Vertex's log capture drops background-process stdout."""
    try:
        with open(ACE_LOG, "rb") as fh:
            fh.seek(0, 2)
            size = fh.tell()
            fh.seek(max(0, size - max_chars))
            return fh.read().decode("utf-8", "replace")
    except OSError:
        return "(no ace.log)"

ACE = os.environ.get("ACESTEP_URL", "http://127.0.0.1:8001")
POLL_SECONDS = 1.0
GENERATION_TIMEOUT = float(os.environ.get("ACESTEP_GENERATION_TIMEOUT", "180"))
# ACE-Step is single-worker: while it loads weights, EVERY request blocks —
# including release_task. Requests need load-length timeouts, not 30s. On
# Vertex the image is STREAMED, so the first weight reads can take far longer
# than on a local disk — hence the generous default.
REQUEST_TIMEOUT = float(os.environ.get("ACESTEP_REQUEST_TIMEOUT", "600"))

app = FastAPI()
MODEL_READY = False
WARMUP_ERROR = None
WARMUP_ATTEMPTS = 0


def _log(msg):
    # stderr: the stream Vertex's log capture demonstrably keeps.
    print(f"[shim] {msg}", file=sys.stderr, flush=True)


def _find(node, keys, depth=0):
    """Depth-first search for the first non-empty value under any of `keys`."""
    if depth > 6 or not isinstance(node, (dict, list)):
        return None
    if isinstance(node, dict):
        for k in keys:
            if k in node and node[k] not in (None, "", []):
                return node[k]
        for v in node.values():
            found = _find(v, keys, depth + 1)
            if found is not None:
                return found
    else:
        for item in node:
            found = _find(item, keys, depth + 1)
            if found is not None:
                return found
    return None


def _generate(prompt, duration, deadline, inference_steps=None, key_scale=None):
    """release_task -> poll query_result -> download audio. Returns
    (audio_bytes, mime_type). Raises RuntimeError on failure/timeout."""
    # Two request shapes:
    #  * caption (default): direct DiT caption + explicit audio_duration —
    #    honors the requested length and skips the LM planning pass entirely
    #    (simple mode let the LM pick 2-3 MINUTE songs regardless of
    #    audio_duration, dominating latency).
    #  * simple: the repo's examples/simple_mode shape (description ->
    #    LM-planned song). Kept as a rollback: set ACESTEP_GEN_MODE=simple at
    #    model upload (env var) — no container rebuild needed.
    if os.environ.get("ACESTEP_GEN_MODE", "caption") == "simple":
        body = {
            "description": prompt,
            "instrumental": True,
            "vocal_language": "unknown",
            "audio_duration": duration,
        }
    else:
        body = {
            "caption": prompt,
            "lyrics": "",
            "task_type": "text2music",
            "audio_duration": duration,
        }
    # Fewer diffusion steps = faster, slightly rougher audio (turbo default 8).
    if inference_steps:
        body["inference_steps"] = max(1, min(int(inference_steps), 60))
    # Explicit key metadata (e.g. "A minor"): in caption mode nothing generates
    # the structured key_scale field, and the DiT follows raw "minor key" text
    # poorly — passing it explicitly is how key adherence comes back.
    if key_scale:
        body["key_scale"] = str(key_scale)[:32]
    r = requests.post(
        f"{ACE}/release_task",
        json=body,
        timeout=REQUEST_TIMEOUT,
    )
    if r.status_code == 429:
        raise RuntimeError("busy")  # queue full — caller should retry
    r.raise_for_status()
    task_id = _find(r.json(), ["task_id", "taskId", "id"])
    if not task_id:
        raise RuntimeError(f"no task id: {r.text[:200]}")

    while True:
        if time.monotonic() > deadline:
            raise RuntimeError("generation timed out")
        time.sleep(POLL_SECONDS)
        q = requests.post(f"{ACE}/query_result", json={"task_id_list": [task_id]}, timeout=REQUEST_TIMEOUT)
        q.raise_for_status()
        qd = q.json()
        # Response shape (verified live): data[0].status is the task status
        # (0 running / 1 done / 2 failed) and data[0].result is a JSON-ENCODED
        # STRING of items whose "file" is a ready-made /v1/audio?path=… URL.
        entries = qd.get("data") or []
        entry = entries[0] if entries else {}
        status = entry.get("status")
        if status in (2, "2"):
            raise RuntimeError(
                f"generation failed: progress={entry.get('progress_text')} :: {str(qd)[:1200]}"
            )
        if status in (1, "1"):
            result = entry.get("result")
            if isinstance(result, str):
                try:
                    result = json.loads(result)
                except ValueError:
                    result = None
            first = result[0] if isinstance(result, list) and result else {}
            file_url = str(first.get("file") or "").strip()
            if not file_url:
                raise RuntimeError(f"succeeded but no audio path: {str(qd)[:400]}")
            url = f"{ACE}{file_url}" if file_url.startswith("/") else f"{ACE}/v1/audio?path={file_url}"
            a = requests.get(url, timeout=60)
            a.raise_for_status()
            mime = a.headers.get("content-type", "audio/mpeg").split(";")[0]
            return a.content, (mime if mime.startswith("audio/") else "audio/mpeg")


def _trim_to_duration(audio_bytes, duration):
    """Hard-trim the clip to the requested duration with a 1s fade-out —
    belt-and-suspenders in case the model still runs long. Returns the input
    unchanged on any ffmpeg trouble (a long clip beats no clip)."""
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as src:
            src.write(audio_bytes)
            src_path = src.name
        out_path = src_path + ".out.mp3"
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src_path],
            capture_output=True, text=True, timeout=30,
        )
        actual = float(probe.stdout.strip() or 0)
        if actual <= duration + 2:  # close enough — don't re-encode
            return audio_bytes
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", src_path, "-t", str(duration),
             "-af", f"afade=t=out:st={max(0, duration - 1)}:d=1", "-b:a", "128k", out_path],
            capture_output=True, timeout=60, check=True,
        )
        with open(out_path, "rb") as fh:
            trimmed = fh.read()
        return trimmed if len(trimmed) > 1000 else audio_bytes
    except Exception as exc:  # noqa: BLE001
        _log(f"trim failed (returning full clip): {exc}")
        return audio_bytes
    finally:
        for p in (locals().get("src_path"), locals().get("out_path")):
            if p:
                try:
                    os.unlink(p)
                except OSError:
                    pass


def _warmup():
    """Wait for ACE-Step to accept connections, then force the one-time model
    load with a short generation. Retries FOREVER: during the load every
    request to the single-worker server blocks or times out (and on Vertex the
    streamed image makes the first weight reads very slow), so any fixed
    give-up deadline just freezes the replica in a permanently-unready state.
    The replica is useless until warm anyway — keep trying while it lives."""
    global MODEL_READY, WARMUP_ERROR, WARMUP_ATTEMPTS
    while True:
        try:
            if requests.get(f"{ACE}/v1/models", timeout=5).ok:
                break
        except requests.RequestException:
            pass
        time.sleep(2)
    _log("acestep server reachable, warming model…")
    while not MODEL_READY:
        WARMUP_ATTEMPTS += 1
        try:
            _generate("gentle warm calm instrumental", 10, time.monotonic() + REQUEST_TIMEOUT)
            MODEL_READY = True
            WARMUP_ERROR = None
            _log(f"warmup complete on attempt {WARMUP_ATTEMPTS} — model ready")
            return
        except Exception as exc:  # noqa: BLE001
            WARMUP_ERROR = str(exc)
            _log(f"warmup attempt {WARMUP_ATTEMPTS} failed: {exc}; retrying")
            time.sleep(10)


@app.on_event("startup")
def _startup():
    threading.Thread(target=_warmup, daemon=True).start()


@app.get(os.environ.get("AIP_HEALTH_ROUTE", "/health"))
def health():
    # Liveness only: 200 as soon as the shim is up, so Vertex keeps the replica
    # alive while ACE-Step loads its weights in the background.
    return {"status": "ok", "model_ready": MODEL_READY}


@app.post(os.environ.get("AIP_PREDICT_ROUTE", "/predict"))
async def predict(request: Request):
    body = await request.json()
    instance = (body.get("instances") or [{}])[0]
    prompt = str(instance.get("prompt", "")).strip()
    duration = float(instance.get("duration", 30))
    inference_steps = instance.get("inference_steps")
    key_scale = str(instance.get("key_scale") or "").strip()
    if not prompt:
        return JSONResponse({"predictions": [{"error": "empty prompt"}]}, status_code=400)

    if not MODEL_READY:
        # Still loading the model — tell the caller to retry (its cold-start
        # loop treats 503 as "wake in progress").
        return JSONResponse(
            {
                "predictions": [
                    {
                        "error": "model loading",
                        "warmup_attempts": WARMUP_ATTEMPTS,
                        "warmup_error": WARMUP_ERROR,
                        "ace_log_tail": _ace_log_tail(),
                    }
                ]
            },
            status_code=503,
        )

    started = time.monotonic()
    try:
        audio, mime = _generate(prompt, duration, started + GENERATION_TIMEOUT, inference_steps, key_scale)
    except RuntimeError as exc:
        if str(exc) == "busy":
            return JSONResponse({"predictions": [{"error": "busy"}]}, status_code=503)
        return JSONResponse({"predictions": [{"error": str(exc)}]}, status_code=500)
    audio = _trim_to_duration(audio, duration)
    return {
        "predictions": [
            {
                "audio_b64": base64.b64encode(audio).decode("ascii"),
                "mime_type": mime,
                "seconds": round(time.monotonic() - started, 1),
            }
        ]
    }
