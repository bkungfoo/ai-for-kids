import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { ProviderRequestError } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * ACE-Step 1.5 adapter — an Apache-2.0 open-source music model served from OUR
 * OWN Vertex AI prediction endpoint (custom container on an A100; see
 * deploy/acestep-vertex/). Third engine in the storybook music A/B test:
 * generates a short instrumental loop in a few seconds once the GPU is warm.
 *
 * The endpoint is deployed with scale-to-zero (idle_scaledown_period = 15 min),
 * so the GPU stays warm while children are actively making music and shuts
 * down after 15 quiet minutes. A request that lands while it is scaled down
 * gets a 429 "not yet ready" — we retry until the replica wakes (a few
 * minutes), which still beats composing a full song elsewhere.
 *
 * Vertex custom-container predict contract:
 *   POST {endpoint}/v1/projects/{p}/locations/{l}/endpoints/{e}:predict
 *   { instances: [{ prompt, duration }] }
 *     -> { predictions: [{ audio_b64, mime_type, seconds }] }
 */

const COLD_START_RETRY_MS = 15_000;

export function aceStepConfigured(): boolean {
  const { endpointUrl, project, location, endpointId } = config.providers.aceStep;
  return Boolean(endpointUrl || (project && location && endpointId));
}

function endpointUrl(): string {
  const cfg = config.providers.aceStep;
  // Dedicated endpoints (required for scale-to-zero) live on their own DNS —
  // the full URL wins when set; the shared domain is the fallback.
  if (cfg.endpointUrl) return cfg.endpointUrl;
  return (
    `https://${cfg.location}-aiplatform.googleapis.com/v1/projects/${cfg.project}` +
    `/locations/${cfg.location}/endpoints/${cfg.endpointId}:predict`
  );
}

/**
 * Detect an explicit key request in the prompt ("in a minor key", "D minor",
 * "F sharp major"…) and normalize it to ACE-Step's key_scale form ("D minor").
 * The DiT follows raw key words in caption text poorly — minor-key prompts
 * came out mostly major — but honors the structured key_scale field.
 * A bare "minor"/"major" with no tonic gets a common default tonic.
 */
export function detectKeyScale(prompt: string): string | undefined {
  const specific = /\b([A-G])\s?(#|b|sharp|flat)?\s+(minor|major)\b/i.exec(prompt);
  if (specific) {
    const note = specific[1]!.toUpperCase();
    const acc = specific[2] ? (/^s/i.test(specific[2]) || specific[2] === '#' ? '#' : 'b') : '';
    return `${note}${acc} ${specific[3]!.toLowerCase()}`;
  }
  if (/\bminor\b/i.test(prompt)) return 'A minor';
  if (/\bmajor\b/i.test(prompt)) return 'C major';
  return undefined;
}

/**
 * Generate one instrumental loop. Waits out a scale-to-zero cold start (429s)
 * until `deadlineMs`; rejects on any other upstream failure.
 */
export async function generateAceStepTrack(
  prompt: string,
  deadlineMs: number,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const { durationSec, inferenceSteps } = config.providers.aceStep;
  const keyScale = detectKeyScale(prompt);
  for (;;) {
    const token = await getAccessToken();
    const res = await fetch(endpointUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        instances: [
          {
            prompt,
            duration: durationSec,
            inference_steps: inferenceSteps,
            ...(keyScale ? { key_scale: keyScale } : {}),
          },
        ],
      }),
    });
    if (res.status === 429 || res.status === 503) {
      // Scaled to zero / still warming up: Vertex returns 429 ("not ready") or
      // 503 ("no healthy backend servers") until the replica is up. Wait and
      // retry rather than failing the whole job.
      if (Date.now() + COLD_START_RETRY_MS > deadlineMs) {
        throw new ProviderRequestError('acestep', 504, 'endpoint did not wake before the deadline');
      }
      await new Promise((r) => setTimeout(r, COLD_START_RETRY_MS));
      continue;
    }
    if (!res.ok) {
      throw new ProviderRequestError('acestep', res.status, (await safeText(res)).slice(0, 300));
    }
    const data = (await res.json()) as {
      predictions?: Array<{ audio_b64?: string; mime_type?: string; error?: string }>;
    };
    const pred = data.predictions?.[0];
    if (!pred?.audio_b64) {
      throw new ProviderRequestError(
        'acestep',
        502,
        `no audio in prediction: ${pred?.error ?? JSON.stringify(data).slice(0, 200)}`,
      );
    }
    const bytes = Buffer.from(pred.audio_b64, 'base64');
    if (bytes.length < 1000) {
      throw new ProviderRequestError('acestep', 502, 'prediction audio came back empty');
    }
    const mimeType = pred.mime_type && pred.mime_type.startsWith('audio/') ? pred.mime_type : 'audio/mpeg';
    return { bytes, mimeType };
  }
}

// --- OAuth access token (same ladder as Vision SafeSearch) ----------------------
// Application Default Credentials via gcloud first, then the GCE metadata
// server. NOTE: this VM's service account lacks the cloud-platform scope, so
// in practice ADC must be set up (gcloud auth application-default login) or
// the VM's scopes widened before this engine can reach Vertex.

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  try {
    const { stdout } = await execFileAsync(
      'gcloud',
      ['auth', 'application-default', 'print-access-token'],
      { timeout: 10_000 },
    );
    const token = stdout.trim();
    if (token) {
      cachedToken = { value: token, expiresAt: Date.now() + 45 * 60 * 1000 };
      return token;
    }
  } catch {
    // fall through to metadata server
  }

  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!res.ok) throw new Error(`no Vertex credentials: metadata token fetch failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(0, (data.expires_in - 300) * 1000),
  };
  return data.access_token;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}
