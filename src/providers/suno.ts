import { config } from '../config.js';
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type GenerationResult,
  type Provider,
} from './types.js';

export interface SunoRequest {
  /** What the child wants the song to be about. Moderated on input. */
  prompt: string;
  /** Optional musical style, e.g. "happy pop". Moderated on input. */
  style?: string;
  instrumental?: boolean;
}

/**
 * Suno (music generation) adapter.
 *
 * NOTE: Suno's public API surface changes; treat the request/response shapes
 * below as a template and adjust to the version you integrate against.
 */
export const sunoProvider: Provider<SunoRequest> = {
  name: 'suno',

  isConfigured() {
    return Boolean(config.providers.suno.apiKey);
  },

  inputTexts(req) {
    return [req.prompt, req.style ?? ''];
  },

  async generate(req): Promise<GenerationResult> {
    const { apiKey, baseUrl } = config.providers.suno;
    if (!apiKey) throw new ProviderNotConfiguredError('suno');

    const res = await fetch(`${baseUrl}/v1/generate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        prompt: req.prompt,
        tags: req.style,
        make_instrumental: req.instrumental ?? false,
      }),
    });

    if (!res.ok) {
      throw new ProviderRequestError('suno', res.status, await safeText(res));
    }

    const data = (await res.json()) as {
      id?: string;
      title?: string;
      audio_url?: string;
      lyrics?: string;
    };

    return {
      // Suno can return generated lyrics — moderate them as output text.
      textToModerate: [data.lyrics ?? ''],
      // The title is provider-chosen metadata — moderate it too.
      metadataToModerate: [data.title ?? ''],
      result: {
        id: data.id,
        title: data.title,
        audioUrl: data.audio_url,
        lyrics: data.lyrics,
      },
    };
  },
};

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
