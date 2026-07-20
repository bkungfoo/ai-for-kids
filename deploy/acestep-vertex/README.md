# ACE-Step 1.5 on Vertex AI (A100, scale-to-zero)

Serves the Apache-2.0 [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5)
music model as the `acestep` engine in the storybook music A/B test. On a warm
A100 a 30-second instrumental loop takes ~2 s; the endpoint scales to zero
after **15 idle minutes** so the GPU only bills while children are actively
making music.

## Pieces

- `Dockerfile` — CUDA image with ACE-Step 1.5 + weights baked in, its API
  server on :8001, and the Vertex shim on :8080.
- `predictor.py` — translates Vertex `{instances}→{predictions}` onto
  ACE-Step's `release_task` / `query_result` / `v1/audio` flow. Returns
  `{audio_b64, mime_type, seconds}`.
- `start.sh` — boots both processes; health stays 503 until the model loads.
- `deploy.sh` — Cloud Build → model upload → dedicated endpoint → deploy with
  `a2-highgpu-1g` + `NVIDIA_TESLA_A100`, `minReplicaCount: 0`,
  `maxReplicaCount: 1`, `scaleToZeroSpec.idleScaledownPeriod: 900s`.

## Deploying

Needs an account with Vertex AI / Cloud Build / Artifact Registry roles and
`a2-highgpu-1g` (A100) quota for Vertex online prediction in the region —
**the Harbor House VM's service account has neither**, so run it from a
workstation (`gcloud auth login` first):

```bash
PROJECT=nimble-unison-471817-c0 REGION=us-west1 ./deploy.sh
```

Then put the printed `ACESTEP_ENDPOINT_URL` into the app's `.env` and restart.

## App-side auth (important)

The adapter (`src/providers/aceStep.ts`) needs OAuth credentials that can call
Vertex. The VM's default service account tokens lack the `cloud-platform`
scope, so pick one:

1. `gcloud auth application-default login` on the VM (user credential — the
   adapter tries ADC first), or
2. Recreate/stop-start the VM with `--scopes=cloud-platform` and grant the
   service account `roles/aiplatform.user` (cleanest long-term).

## Behavior at the seams

- **Cold start**: a request while scaled to zero gets 429 from Vertex; the
  adapter retries every 15 s until the replica wakes (a few minutes: container
  is pre-baked, so it's mostly VM + model load). The child just sees the usual
  "Composing…" line a bit longer.
- **Warm**: generations return in seconds; each one resets the 15-minute idle
  clock.
- **Costs**: ~$3.7/hr while warm (a2-highgpu-1g), $0 scaled down.

## Untested notes

The ACE-Step API field names in `predictor.py` (`release_task` body, task id /
status / audio path keys) follow the upstream docs but haven't run against a
live A100 yet — smoke-test the container locally (`docker run -p 8080:8080
--gpus all IMAGE`, then POST a Vertex-shaped body to `/predict`) before the
Vertex deploy, and expect possibly one round of field-name fixes.
