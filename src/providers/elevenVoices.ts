import { config } from '../config.js';
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

/** Speak `text` (already moderated by the route) in a cloned voice. */
export async function speakWithVoice(
  elevenVoiceId: string,
  text: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(
    `${base()}/v1/text-to-speech/${encodeURIComponent(elevenVoiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'audio/mpeg',
        'xi-api-key': key(),
      },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
    },
  );
  if (!res.ok) {
    throw new ProviderRequestError('elevenlabs-voices', res.status, await safeText(res));
  }
  return { bytes: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/mpeg' };
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
