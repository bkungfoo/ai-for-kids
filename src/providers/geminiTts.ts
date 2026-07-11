import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type GenerationResult,
  type Provider,
} from './types.js';

/**
 * Google Gemini TTS adapter — the storybook narrator when ElevenLabs isn't
 * configured. Uses the same AI Studio key as image generation. The model takes
 * a natural-language delivery instruction ("read warmly, for a young child"),
 * so the narration suits a picture book.
 *
 * Gemini returns raw PCM (audio/l16). Raw PCM is ~48 KB/s — far too heavy to
 * cache inside the book JSON — so we compress to MP3 with ffmpeg when it is
 * installed, and fall back to a WAV wrapper when it isn't.
 *
 * The input text is the page's story words (moderated on input by the guarded
 * pipeline); the output is audio only, so there is no output text to moderate.
 */

export interface GeminiTtsRequest {
  /** The words to narrate. Moderated on input. */
  text: string;
}

const DELIVERY_STYLE =
  'Read this children’s storybook page aloud warmly and gently, at an easy ' +
  'pace a young child can follow, with a little wonder in your voice: ';

interface GeminiTtsResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export const geminiTtsProvider: Provider<GeminiTtsRequest> = {
  name: 'gemini-tts',

  isConfigured() {
    return Boolean(config.providers.gemini.apiKey);
  },

  inputTexts(req) {
    return [req.text];
  },

  async generate(req): Promise<GenerationResult> {
    const { apiKey, baseUrl } = config.providers.gemini;
    if (!apiKey) throw new ProviderNotConfiguredError('gemini-tts');
    const { model, voice } = config.providers.geminiTts;

    const res = await fetch(`${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: DELIVERY_STYLE + req.text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    });
    if (!res.ok) {
      throw new ProviderRequestError('gemini-tts', res.status, await safeText(res));
    }

    const data = (await res.json()) as GeminiTtsResponse;
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      const why =
        data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? 'unknown';
      throw new ProviderRequestError('gemini-tts', 502, `no audio returned (${why})`);
    }

    const pcm = Buffer.from(part.inlineData.data, 'base64');
    const rate = parseSampleRate(part.inlineData.mimeType ?? '');
    const audio = await compressAudio(pcm, rate);

    return {
      textToModerate: [],
      metadataToModerate: [],
      result: {
        voiceId: voice,
        contentType: audio.contentType,
        audioBase64: audio.data.toString('base64'),
        bytes: audio.data.length,
      },
    };
  },
};

/** "audio/l16; rate=24000" -> 24000 (defaulting to Gemini TTS's 24kHz). */
function parseSampleRate(mimeType: string): number {
  const m = /rate=(\d+)/.exec(mimeType);
  return m ? Number(m[1]) : 24000;
}

/** MP3 via ffmpeg when available (~8x smaller); otherwise a WAV wrapper. */
async function compressAudio(
  pcm: Buffer,
  rate: number,
): Promise<{ contentType: string; data: Buffer }> {
  try {
    const mp3 = await pcmToMp3(pcm, rate);
    return { contentType: 'audio/mpeg', data: mp3 };
  } catch (err) {
    logger.warn('ffmpeg mp3 encode failed — caching narration as WAV', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { contentType: 'audio/wav', data: pcmToWav(pcm, rate) };
  }
}

function pcmToMp3(pcm: Buffer, rate: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      'ffmpeg',
      // s16le mono in on stdin -> 64kbps mp3 on stdout (plenty for speech).
      ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1',
        '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '64k', '-f', 'mp3', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err);
        else if (!stdout || stdout.length === 0) reject(new Error('ffmpeg produced no output'));
        else resolve(stdout as Buffer);
      },
    );
    child.stdin?.end(pcm);
  });
}

function pcmToWav(pcm: Buffer, rate: number, channels = 1, bits = 16): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE((rate * channels * bits) / 8, 28);
  header.writeUInt16LE((channels * bits) / 8, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
