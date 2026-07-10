import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  CHILD_SAFE_IMAGE_PREAMBLE,
  ProviderNotConfiguredError,
  ProviderRequestError,
  type GenerationResult,
  type ImageGenRequest,
  type Provider,
  type ReferenceImage,
} from './types.js';

/**
 * Replicate adapter for "Nano Banana Pro" (Google Gemini 3 Pro Image).
 *
 * The Replicate API is STATELESS — it has no memory of earlier pictures in a
 * book — so we reconstruct that context on every call from the storybook itself:
 *
 *   - prompt       the scene to draw now + reinforcement instructions, with the
 *                  story so far appended as extra context;
 *   - image_input  the earlier illustrations (cover + recent pages), which Nano
 *                  Banana Pro copies characters, objects and art style from
 *                  (it accepts up to 14 reference images).
 *
 * This keeps characters, objects and settings consistent from page to page.
 *
 * Nano Banana Pro returns only an image (no caption), so there is no model text
 * to moderate on output; the picture still passes Vision SafeSearch downstream.
 */
export const replicateProvider: Provider<ImageGenRequest> = {
  name: 'replicate',

  isConfigured() {
    return Boolean(config.providers.replicate.apiToken);
  },

  inputTexts(req) {
    return req.context ? [req.prompt, req.context] : [req.prompt];
  },

  async generate(req): Promise<GenerationResult> {
    const { apiToken, baseUrl, model, resolution, safetyFilter } = config.providers.replicate;
    if (!apiToken) throw new ProviderNotConfiguredError('replicate');

    // One text channel only (no separate system prompt): the child-safety rule
    // FIRST, then the scene, then the story so far as extra context.
    const promptParts = [CHILD_SAFE_IMAGE_PREAMBLE, req.prompt];
    if (req.context) {
      promptParts.push(
        `Story context so far (background only — do not render as text in the image):\n${req.context}`,
      );
    }
    const prompt = promptParts.join('\n\n');

    // Earlier pictures become reference images. Replicate file inputs accept
    // data: URIs, so we can pass our stored base64 pages without hosting them.
    const image_input = (req.referenceImages ?? []).map(toDataUri);

    const input: Record<string, unknown> = {
      prompt,
      image_input,
      // Storybook covers and pages are displayed as squares.
      aspect_ratio: '1:1',
      output_format: 'png',
      resolution,
      safety_filter_level: safetyFilter,
      // Don't silently swap to a different (non-Nano-Banana) model under load;
      // keep the engine predictable for a kids' app.
      allow_fallback_model: false,
    };

    // `Prefer: wait` runs the prediction synchronously (up to ~60s). If it is
    // still running when the wait window closes, we poll below.
    const res = await fetch(`${baseUrl}/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiToken}`,
        'content-type': 'application/json',
        prefer: 'wait=55',
      },
      body: JSON.stringify({ input }),
    });

    if (!res.ok) {
      throw new ProviderRequestError('replicate', res.status, await safeText(res));
    }

    let prediction = (await res.json()) as ReplicatePrediction;
    prediction = await settle(prediction, apiToken);

    if (prediction.status !== 'succeeded') {
      throw new ProviderRequestError(
        'replicate',
        502,
        prediction.error || `prediction ${prediction.status}`,
      );
    }

    const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!url) {
      throw new ProviderRequestError('replicate', 502, 'prediction returned no image');
    }

    const image = await fetchImage(url);

    return {
      textToModerate: [],
      metadataToModerate: [],
      // Every generated image must pass SafeSearch before it is displayed.
      imagesToModerate: [image],
      result: { images: [image], captions: [] },
    };
  },
};

interface ReplicatePrediction {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string | null;
  urls?: { get?: string };
}

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 40; // ~60s on top of the initial synchronous wait

/** Poll a prediction to a terminal state if it wasn't finished by `Prefer: wait`. */
async function settle(prediction: ReplicatePrediction, apiToken: string): Promise<ReplicatePrediction> {
  let current = prediction;
  const getUrl = current.urls?.get;
  for (let i = 0; i < MAX_POLLS; i++) {
    if (current.status !== 'starting' && current.status !== 'processing') return current;
    if (!getUrl) return current;
    await delay(POLL_INTERVAL_MS);
    const res = await fetch(getUrl, { headers: { authorization: `Bearer ${apiToken}` } });
    if (!res.ok) {
      logger.warn('replicate poll failed', { status: res.status });
      return current;
    }
    current = (await res.json()) as ReplicatePrediction;
  }
  return current;
}

function toDataUri(img: ReferenceImage): string {
  return `data:${img.mimeType};base64,${img.dataBase64}`;
}

/** Fetch the generated image from replicate.delivery and re-encode as base64. */
async function fetchImage(url: string): Promise<ReferenceImage> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ProviderRequestError('replicate', res.status, 'failed to fetch generated image');
  }
  const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  const dataBase64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  return { mimeType, dataBase64 };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
