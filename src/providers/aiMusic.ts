import { config } from '../config.js';
import { ProviderRequestError } from './types.js';

/**
 * AIMusicAPI (musicapi.ai family) adapter — Suno-style song generation for the
 * kids' music maker. The API is asynchronous:
 *
 *   POST /api/v1/sonic/create              -> { task_id }
 *   GET  /api/v1/sonic/task/{task_id}      -> { state, clips[...] }   (1–3 min)
 *
 * We use description mode (custom_mode=false): one natural-language prompt in,
 * a full song out. The route layer owns moderation (the child's words are
 * input-moderated before submit; returned title/lyrics are output-moderated
 * before the child sees or hears anything).
 */

export interface MusicTaskClip {
  audioUrl: string;
  title: string;
  lyrics: string;
  durationSec?: number;
}

export interface MusicTaskStatus {
  state: 'working' | 'succeeded' | 'failed';
  clips: MusicTaskClip[];
  error?: string;
}

/**
 * Every generation leads with a child-safety preamble (mirroring the image
 * pipeline): the description steers the model toward wholesome, kid-safe
 * songs before the child's own words and pickers are applied.
 */
export const CHILD_SAFE_MUSIC_PREAMBLE =
  "A wholesome song for a children's creative app (ages 5-12). It must be " +
  'completely child-friendly: clean, positive lyrics with no violence, fear, ' +
  'romance, innuendo, profanity, drugs or dark themes. ';

export function aiMusicConfigured(): boolean {
  return Boolean(config.providers.aiMusic.apiKey);
}

/** Submit a description-mode generation. Resolves to the upstream task id. */
export async function submitMusicTask(
  description: string,
  instrumental: boolean,
): Promise<string> {
  const { apiKey, baseUrl, model } = config.providers.aiMusic;
  const res = await fetch(`${baseUrl}/api/v1/sonic/create`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      task_type: 'create_music',
      custom_mode: false,
      gpt_description_prompt: description,
      make_instrumental: instrumental,
      mv: model,
    }),
  });
  if (!res.ok) {
    throw new ProviderRequestError('aimusic', res.status, await safeText(res));
  }
  const data = (await res.json()) as Record<string, unknown>;
  const taskId = pickTaskId(data);
  if (!taskId) {
    throw new ProviderRequestError('aimusic', 502, `no task id in response: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return taskId;
}

/** Poll a generation task and normalize the (loosely documented) response. */
export async function pollMusicTask(taskId: string): Promise<MusicTaskStatus> {
  const { apiKey, baseUrl } = config.providers.aiMusic;
  const res = await fetch(`${baseUrl}/api/v1/sonic/task/${encodeURIComponent(taskId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new ProviderRequestError('aimusic', res.status, await safeText(res));
  }
  const data = (await res.json()) as Record<string, unknown>;

  const state = findString(data, ['state', 'status'])?.toLowerCase() ?? '';
  if (state === 'failed' || state === 'error') {
    return { state: 'failed', clips: [], error: findString(data, ['error', 'message']) ?? 'generation failed' };
  }

  // Clips can live under different keys depending on API version — scan for
  // any objects that carry an audio URL.
  const clips = collectClips(data);
  if (state === 'succeeded' || state === 'complete' || state === 'completed') {
    return clips.length
      ? { state: 'succeeded', clips }
      : { state: 'failed', clips: [], error: 'succeeded but no audio in response' };
  }
  return { state: 'working', clips: [] };
}

/** Download the generated audio (mp3) from the provider's CDN. */
export async function downloadAudio(url: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ProviderRequestError('aimusic', res.status, `audio download failed for ${url.slice(0, 120)}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 1000) {
    throw new ProviderRequestError('aimusic', 502, 'audio download came back empty');
  }
  const mimeType = res.headers.get('content-type')?.split(';')[0] || 'audio/mpeg';
  return { bytes, mimeType: mimeType.startsWith('audio/') ? mimeType : 'audio/mpeg' };
}

// --- response spelunking ---------------------------------------------------------

function pickTaskId(data: Record<string, unknown>): string | undefined {
  return findString(data, ['task_id', 'taskId', 'id']);
}

/** Depth-first search for the first string value under any of the keys. */
function findString(node: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 4 || typeof node !== 'object' || node === null) return undefined;
  const obj = node as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v) return v;
  }
  for (const v of Object.values(obj)) {
    const found = findString(v, keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** Collect every object in the tree that has an audio URL. */
function collectClips(node: unknown, out: MusicTaskClip[] = [], depth = 0): MusicTaskClip[] {
  if (depth > 5 || typeof node !== 'object' || node === null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectClips(item, out, depth + 1);
    return out;
  }
  const obj = node as Record<string, unknown>;
  const audioUrl =
    (typeof obj.audio_url === 'string' && obj.audio_url) ||
    (typeof obj.audioUrl === 'string' && obj.audioUrl) ||
    '';
  if (audioUrl) {
    out.push({
      audioUrl,
      title: (typeof obj.title === 'string' && obj.title) || '',
      lyrics:
        (typeof obj.lyrics === 'string' && obj.lyrics) ||
        (typeof obj.prompt === 'string' && obj.prompt) ||
        '',
      ...(typeof obj.duration === 'number' ? { durationSec: obj.duration } : {}),
    });
  } else {
    for (const v of Object.values(obj)) collectClips(v, out, depth + 1);
  }
  return out;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
