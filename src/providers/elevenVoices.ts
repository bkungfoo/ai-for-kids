import { execFile } from 'node:child_process';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ProviderRequestError } from './types.js';

/**
 * ElevenLabs Instant Voice Cloning for the kids' Voices feature.
 *
 *   POST /v1/voices/add                 (multipart: name, files) -> { voice_id }
 *   POST /v1/text-to-speech/{voice_id}  ({ text, model_id })     -> mp3 bytes
 *   DELETE /v1/voices/{voice_id}
 *
 * Uses config.providers.elevenlabs.voicesApiKey — its own env variable so the
 * storybook narrator engine selection (which keys the narration cache) is not
 * affected by enabling this feature. The route layer owns ALL moderation: the
 * voice name and every spoken text are input-moderated before reaching here.
 */

export function voicesConfigured(): boolean {
  return Boolean(config.providers.elevenlabs.voicesApiKey);
}

function key(): string {
  return config.providers.elevenlabs.voicesApiKey;
}

function base(): string {
  return config.providers.elevenlabs.baseUrl;
}

/** Clone a voice from one recording. Resolves to the ElevenLabs voice id. */
export async function cloneVoice(
  name: string,
  audio: Buffer,
  mimeType: string,
): Promise<string> {
  const form = new FormData();
  form.append('name', name.slice(0, 80));
  // Mark provenance in the remote dashboard; not shown to kids.
  form.append('description', 'Harbor House kids app — instant voice clone');
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : mimeType.includes('mpeg') ? 'mp3' : 'webm';
  form.append('files', new Blob([new Uint8Array(audio)], { type: mimeType }), `recording.${ext}`);
  const res = await fetch(`${base()}/v1/voices/add`, {
    method: 'POST',
    headers: { 'xi-api-key': key() },
    body: form,
  });
  if (!res.ok) {
    throw new ProviderRequestError('elevenlabs-voices', res.status, await safeText(res));
  }
  const data = (await res.json()) as { voice_id?: string };
  if (!data.voice_id) {
    throw new ProviderRequestError('elevenlabs-voices', 502, `no voice_id in response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.voice_id;
}

/**
 * Make the read sound like a storybook: insert explicit ElevenLabs
 * `<break time="…" />` pauses after punctuation (the raw model barely
 * breathes at commas and periods). Only fires when the punctuation is
 * followed by whitespace, so decimals ("3.14") and mid-word marks survive.
 */
export function addPunctuationPauses(text: string): string {
  return text
    // Sentence enders (., !, ?, …, and any that arrive quoted): a real beat.
    .replace(/([.!?…]["”’)]?)\s+/g, '$1 <break time="0.6s" /> ')
    // Mid-sentence punctuation (commas, semicolons, colons, dashes): a breath.
    .replace(/([,;:]["”’)]?|—|--)\s+/g, '$1 <break time="0.35s" /> ');
}

/**
 * Pitch-preserving tempo change on an mp3 (same trick as the storybook
 * narrator's NARRATION_SPEED). Used for models like eleven_v3 that reject the
 * native speed setting. Falls back to the original audio on any ffmpeg
 * trouble — a natural-speed clip beats an error.
 */
function retimeMp3(mp3: Buffer, tempo: number): Promise<Buffer> {
  return new Promise((resolve) => {
    const child = execFile(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-f', 'mp3', '-i', 'pipe:0',
        '-filter:a', `atempo=${tempo}`, '-codec:a', 'libmp3lame', '-b:a', '128k',
        '-f', 'mp3', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout || stdout.length === 0) {
          logger.warn('voice tempo retime failed — serving natural speed', {
            error: err instanceof Error ? err.message : String(err ?? 'no output'),
          });
          resolve(mp3);
        } else {
          resolve(stdout as Buffer);
        }
      },
    );
    child.stdin?.end(mp3);
  });
}

/** Speak `text` (already moderated by the route) in a cloned voice. */
export async function speakWithVoice(
  elevenVoiceId: string,
  text: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const model = config.providers.elevenlabs.voicesModel;
  const speed = config.providers.elevenlabs.voicesSpeed;
  const isV3 = model.startsWith('eleven_v3');
  const res = await fetch(
    `${base()}/v1/text-to-speech/${encodeURIComponent(elevenVoiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'audio/mpeg',
        'xi-api-key': key(),
      },
      body: JSON.stringify({
        text: addPunctuationPauses(text),
        model_id: model,
        // eleven_v3 rejects the fine-grained settings object — its default
        // delivery is already the expressive one; only send settings for v2.
        ...(isV3
          ? {}
          : {
              voice_settings: {
                stability: config.providers.elevenlabs.voicesStability,
                similarity_boost: config.providers.elevenlabs.voicesSimilarity,
                style: config.providers.elevenlabs.voicesStyle,
                use_speaker_boost: true,
                speed,
              },
            }),
      }),
    },
  );
  if (!res.ok) {
    throw new ProviderRequestError('elevenlabs-voices', res.status, await safeText(res));
  }
  let bytes: Buffer = Buffer.from(await res.arrayBuffer());
  // v3 can't speed-adjust natively; apply the tempo in the encode instead.
  if (isV3 && Math.abs(speed - 1) > 0.01) {
    bytes = await retimeMp3(bytes, speed);
  }
  return { bytes, mimeType: 'audio/mpeg' };
}

/**
 * Release the remote voice slot (accounts have a limited number). Fire on
 * delete and on unkept-voice expiry; a failure is logged by the caller but
 * never blocks the kid-facing flow.
 */
export async function deleteRemoteVoice(elevenVoiceId: string): Promise<void> {
  const res = await fetch(`${base()}/v1/voices/${encodeURIComponent(elevenVoiceId)}`, {
    method: 'DELETE',
    headers: { 'xi-api-key': key() },
  });
  if (!res.ok && res.status !== 404) {
    throw new ProviderRequestError('elevenlabs-voices', res.status, await safeText(res));
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '<no body>';
  }
}
