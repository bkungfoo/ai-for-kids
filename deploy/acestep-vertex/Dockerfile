# ACE-Step 1.5 serving container for Vertex AI prediction (A100).
#
# Two processes: ACE-Step's own API server (port 8001) does the generating;
# predictor.py (port 8080, Vertex's AIP_HTTP_PORT) translates the Vertex
# {instances}->{predictions} contract onto it. Model weights are baked into
# the image at build time so a scale-to-zero cold start is container-pull +
# model-load only (no download).
#
# Build (Cloud Build; ~20-30 min, large image):
#   gcloud builds submit --tag $REGION-docker.pkg.dev/$PROJECT/acestep/acestep-vertex:latest .

FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl python3.11 python3.11-venv python3-pip ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# uv (ACE-Step's supported installer), then ACE-Step 1.5 itself.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app
RUN git clone --depth 1 https://github.com/ace-step/ACE-Step-1.5.git acestep
WORKDIR /app/acestep
RUN uv sync

# Bake the model weights into the image so scale-to-zero cold starts load from
# local disk instead of re-downloading ~9 GB (Vertex throttles egress to
# ~2 MB/s, so runtime downloads take hours there). They go at the DEFAULT
# checkpoints location, <project_root>/checkpoints: the server passes an
# explicit checkpoints dir that overrides ACESTEP_CHECKPOINTS_DIR, and a
# symlinked dir made the LM backend fall back to PyTorch (VRAM blowup) — real
# files at the default path exactly reproduce the verified-working layout.
# The ACE-Step/Ace-Step1.5 repo bundles every component the turbo config
# needs: acestep-v15-turbo (DiT), acestep-5Hz-lm-1.7B (LM),
# Qwen3-Embedding-0.6B, and vae — verified against the HF API 2026-07-17.
ENV ACESTEP_CHECKPOINTS_DIR=/app/acestep/checkpoints
RUN uv run python -c "from huggingface_hub import snapshot_download; \
    snapshot_download('ACE-Step/Ace-Step1.5', local_dir='/app/acestep/checkpoints')"

# Serve the turbo (fast, 8-step) checkpoint. Keep ACE-Step in LAZY mode (its
# default): loading blocks its single worker, so the shim (a separate process)
# drives a one-time background warmup while keeping /health alive — see
# predictor.py. Loading at startup here instead would block ACE-Step's own
# health and make Vertex time the deploy out.
ENV ACESTEP_CONFIG_PATH=acestep-v15-turbo
# Pin the LM to the 1.7B that ships in the baked bundle. Without this, the
# GPU tier detector picks the 4B on a 22GB card — which is NOT baked (8.4 GB
# runtime download, blew every Vertex timeout) and then exhausts VRAM anyway
# (0.2 GB free vs 12.2 GB free with 1.7B). Verified live on an L4 2026-07-18.
ENV ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-1.7B

# The Vertex-facing shim.
COPY predictor.py /app/predictor.py
RUN uv pip install fastapi uvicorn requests

# Vertex mounts /models read-only at serving time, and transformers must WRITE
# its dynamic-module cache (trust_remote_code models) to $HF_HOME/modules —
# which failed with EROFS and killed every model init on Vertex. Keep all HF
# caches in /tmp, which is always writable. (Weights are baked at
# /app/acestep/checkpoints and loaded by local path — unaffected by HF_HOME.)
ENV HF_HOME=/tmp/hf

# Vertex sends traffic to AIP_HTTP_PORT (8080) at AIP_PREDICT_ROUTE/-HEALTH_ROUTE.
EXPOSE 8080
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
CMD ["/app/start.sh"]
