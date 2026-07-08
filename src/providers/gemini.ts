import { config } from '../config.js';
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type GenerationResult,
  type Provider,
} from './types.js';

export interface GeminiImageRequest {
  /** Description of the picture to make. Moderated on input. */
  prompt: string;
  /** Image model, e.g. a "Banana Pro" / Imagen-style model id. */
  model?: string;
}

/**
 * Google Gemini / "Banana Pro" (text-to-image) adapter.
 *
 * Input moderation guards the prompt. On output we moderate any text the model
 * returns alongside the image (a revised prompt or caption), since the image
 * itself is binary.
 */
export const geminiProvider: Provider<GeminiImageRequest> = {
  name: 'gemini',

  isConfigured() {
    return Boolean(config.providers.gemini.apiKey);
  },

  inputTexts(req) {
    return [req.prompt];
  },

  async generate(req): Promise<GenerationResult> {
    const { apiKey, baseUrl } = config.providers.gemini;
    if (!apiKey) throw new ProviderNotConfiguredError('gemini');

    // "Nano Banana 2" — Gemini 3.1 Flash Image.
    const model = req.model ?? 'gemini-3.1-flash-image';
    const res = await fetch(
      `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            // Always generate square images: storybook covers and pages are
            // displayed as squares, so any other ratio would get cropped.
            imageConfig: { aspectRatio: '1:1' },
          },
        }),
      },
    );

    if (!res.ok) {
      throw new ProviderRequestError('gemini', res.status, await safeText(res));
    }

    const data = (await res.json()) as GeminiResponse;
    const parts = data.candidates?.[0]?.content?.parts ?? [];

    const images = parts
      .map((p) => p.inlineData)
      .filter((d): d is InlineData => Boolean(d))
      .map((d) => ({ mimeType: d.mimeType, dataBase64: d.data }));

    const captions = parts.map((p) => p.text).filter((t): t is string => Boolean(t));

    return {
      textToModerate: captions,
      metadataToModerate: [],
      // Every generated image must pass SafeSearch before it is displayed.
      imagesToModerate: images,
      result: { images, captions },
    };
  },
};

interface InlineData {
  mimeType: string;
  data: string;
}
interface GeminiPart {
  text?: string;
  inlineData?: InlineData;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
