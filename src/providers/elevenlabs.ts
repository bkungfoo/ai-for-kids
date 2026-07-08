import { config } from '../config.js';
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type GenerationResult,
  type Provider,
} from './types.js';

export interface ElevenLabsRequest {
  /** The words to speak. Moderated on input. */
  text: string;
  /** Voice id to use for synthesis. */
  voiceId?: string;
  modelId?: string;
}

/**
 * ElevenLabs (text-to-speech / voice generation) adapter.
 *
 * The risky surface here is the INPUT text the child wants spoken — that is
 * what input moderation guards. The output is audio, so there is no output text
 * to moderate (we only echo back metadata).
 */
export const elevenLabsProvider: Provider<ElevenLabsRequest> = {
  name: 'elevenlabs',

  isConfigured() {
    return Boolean(config.providers.elevenlabs.apiKey);
  },

  inputTexts(req) {
    return [req.text];
  },

  async generate(req): Promise<GenerationResult> {
    const { apiKey, baseUrl } = config.providers.elevenlabs;
    if (!apiKey) throw new ProviderNotConfiguredError('elevenlabs');

    const voiceId = req.voiceId ?? 'EXAVITQu4vr4xnSDxMaL'; // a default preset voice
    const res = await fetch(`${baseUrl}/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: req.text,
        model_id: req.modelId ?? 'eleven_multilingual_v2',
      }),
    });

    if (!res.ok) {
      throw new ProviderRequestError('elevenlabs', res.status, await safeText(res));
    }

    const audio = Buffer.from(await res.arrayBuffer());

    return {
      textToModerate: [],
      metadataToModerate: [],
      result: {
        voiceId,
        contentType: 'audio/mpeg',
        // Return audio as base64 so the JSON API stays simple. For large/streamed
        // audio you would instead pipe the upstream response straight through.
        audioBase64: audio.toString('base64'),
        bytes: audio.length,
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
