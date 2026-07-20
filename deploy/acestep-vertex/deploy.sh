#!/bin/bash
# Deploy ACE-Step 1.5 to a Vertex AI prediction endpoint:
#   A100 (a2-highgpu-1g), max 1 replica, scale-to-zero after 15 idle minutes.
#
# Run this from a machine/account with Vertex AI + Artifact Registry + Cloud
# Build permissions (the Harbor House VM's service account does NOT have them;
# `gcloud auth login` as an owner first). Costs while a replica is warm:
# a2-highgpu-1g ≈ $3.7/hr — the 15-min idle scaledown is what keeps that sane.
#
# Scale-to-zero requires a DEDICATED endpoint and the v1beta1 API, and the
# endpoint then serves on its own DNS name — the script prints the final
# ACESTEP_ENDPOINT_URL to put in the app's .env.
set -euo pipefail

PROJECT="${PROJECT:-nimble-unison-471817-c0}"
REGION="${REGION:-us-west1}"            # needs a2-highgpu-1g quota for Vertex
REPO="acestep"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/acestep-vertex:latest"
MODEL_NAME="acestep-15"
ENDPOINT_NAME="acestep-15"
IDLE_SCALEDOWN_SECONDS=900              # 15 minutes: the GPU stays warm while kids compose
MIN_SCALEUP_SECONDS=300                 # don't re-sleep within 5 min of waking

echo "== 1. Artifact Registry repo (idempotent) =="
gcloud artifacts repositories create "$REPO" --project="$PROJECT" \
  --repository-format=docker --location="$REGION" 2>/dev/null || true

echo "== 2. Build the serving container (Cloud Build) =="
gcloud builds submit --project="$PROJECT" --tag "$IMAGE" "$(dirname "$0")"

echo "== 3. Upload the model =="
gcloud ai models upload --project="$PROJECT" --region="$REGION" \
  --display-name="$MODEL_NAME" \
  --container-image-uri="$IMAGE" \
  --container-predict-route=/predict \
  --container-health-route=/health \
  --container-ports=8080
MODEL_ID=$(gcloud ai models list --project="$PROJECT" --region="$REGION" \
  --filter="displayName=$MODEL_NAME" --sort-by=~createTime --limit=1 --format="value(name)" | awk -F/ '{print $NF}')

echo "== 4. Dedicated endpoint (required for scale-to-zero) =="
TOKEN=$(gcloud auth print-access-token)
API="https://${REGION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/${REGION}"
ENDPOINT_ID=$(curl -sf -X POST "${API}/endpoints" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d "{\"displayName\": \"${ENDPOINT_NAME}\", \"dedicatedEndpointEnabled\": true}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['name'].split('/')[5])")
echo "endpoint: ${ENDPOINT_ID} (operation may still be finishing)"
sleep 30

echo "== 5. Deploy: A100, min 0 / max 1, 15-min idle scaledown =="
curl -sf -X POST "${API}/endpoints/${ENDPOINT_ID}:deployModel" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "deployedModel": {
    "model": "projects/${PROJECT}/locations/${REGION}/models/${MODEL_ID}",
    "displayName": "${MODEL_NAME}",
    "dedicatedResources": {
      "machineSpec": {
        "machineType": "a2-highgpu-1g",
        "acceleratorType": "NVIDIA_TESLA_A100",
        "acceleratorCount": 1
      },
      "minReplicaCount": 0,
      "maxReplicaCount": 1,
      "scaleToZeroSpec": {
        "idleScaledownPeriod": "${IDLE_SCALEDOWN_SECONDS}s",
        "minScaleupPeriod": "${MIN_SCALEUP_SECONDS}s"
      }
    }
  },
  "trafficSplit": { "0": 100 }
}
EOF

echo
echo "== 6. Wait for the deploy operation in the console, then: =="
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")
echo "Add to /home/brianfoo/code/ai-for-kids/.env:"
echo "  ACESTEP_ENDPOINT_URL=https://${ENDPOINT_ID}.${REGION}-${PROJECT_NUMBER}.prediction.vertexai.goog/v1/projects/${PROJECT}/locations/${REGION}/endpoints/${ENDPOINT_ID}:predict"
echo "…and make sure the VM has Vertex-capable credentials (see README)."
