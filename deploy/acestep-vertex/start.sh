#!/bin/bash
# Start ACE-Step's API server (the generator), then the Vertex shim in front.
# ACE-Step's output goes to /tmp/ace.log — Vertex's log capture is unreliable
# for background-process stdout, so the shim surfaces the tail of that file in
# its 503 "model loading" responses instead (observability from the outside).
set -e
cd /app/acestep

# ACE-Step 1.5 API server: no CLI flags (config via env), listens on :8001.
uv run acestep-api > /tmp/ace.log 2>&1 &

# The shim runs from the SAME uv project (that's where fastapi/uvicorn were
# installed); --app-dir points it at /app/predictor.py.
exec uv run uvicorn --app-dir /app predictor:app \
  --host 0.0.0.0 --port "${AIP_HTTP_PORT:-8080}" --workers 1
