import { config } from '../config.js';
import { ProviderRequestError } from './types.js';

/**
 * AIMusicAPI (aimusicapi.org) adapter — Suno-style song generation for the
 * kids' music maker. The API is asynchronous:
 *
 *   POST /api/v2/generate            -> { workId }
 *   GET  /api/v2/feed?workId={id}    -> { data: { type, response_data[...] } }
 *
 * Observed task lifecycle: type=IN_PROGRESS (items empty, then status "text",
 * then "first" — which already carries a PARTIAL audio_url) and finally
 * type=SUCCESS with status "complete" / "All generated successfully.". We only
 * take clips once the task reports success, never the partial stream.
 *
 * We use inspiration mode: one natural-language description in (max 400
 * chars), a full song out. The route layer owns moderation (the child's words
 * are input-moderated before submit; returned title/lyrics are
 * output-moderated before the child sees or hears anything).
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
  'A wholesome, completely child-friendly song for kids ages 5-12: clean and ' +
  'positive, no violence, fear, romance, innuendo, profanity or dark themes.';

/** The API caps inspiration descriptions at 400 characters. */
export const MUSIC_DESCRIPTION_MAX = 400;

export function aiMusicConfigured(): boolean {
  return Boolean(config.providers.aiMusic.apiKey);
}

/** Submit an inspiration-mode generation. Resolves to the upstream work id. */
export async function submitMusicTask(
  description: string,
  instrumental: boolean,
): Promise<string> {
  const { apiKey, baseUrl, model } = config.providers.aiMusic;
  const res = await fetch(`${baseUrl}/api/v2/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      gpt_description_prompt: description.slice(0, MUSIC_DESCRIPTION_MAX),
      make_instrumental: instrumental,
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

/** Poll a generation task and normalize the response. */
export async function pollMusicTask(taskId: string): Promise<MusicTaskStatus> {
  const { apiKey, baseUrl } = config.providers.aiMusic;
  const res = await fetch(`${baseUrl}/api/v2/feed?workId=${encodeURIComponent(taskId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new ProviderRequestError('aimusic', res.status, await safeText(res));
  }
  const data = (await res.json()) as Record<string, unknown>;

  // data.type is the authoritative task state (found before the per-clip
  // status fields, which report the partial "text"/"first" stages).
  const state = findString(data, ['state', 'type', 'status'])?.toLowerCase() ?? '';
  if (state === 'failed' || state === 'error' || state === 'fail') {
    return { state: 'failed', clips: [], error: findString(data, ['error', 'message']) ?? 'generation failed' };
  }

  // Clips can live under different keys depending on API version — scan for
  // any objects that carry an audio URL.
  const clips = collectClips(data);
  if (state === 'success' || state === 'succeeded' || state === 'complete' || state === 'completed') {
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
  return findString(data, ['workId', 'task_id', 'taskId', 'id']);
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
