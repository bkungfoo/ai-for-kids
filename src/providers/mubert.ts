import { config } from '../config.js';
import { ProviderRequestError } from './types.js';

/**
 * Mubert B2B API adapter — fast, royalty-free INSTRUMENTAL loops, used for
 * storybook background music (A/B-tested against AIMusicAPI, which composes
 * full Suno-style songs and takes minutes; Mubert renders a loop in seconds).
 *
 * Protocol (api-b2b.mubert.com/v2, JSON-RPC-ish bodies):
 *   POST GetServiceAccess { email, license, token, mode } -> data.pat
 *   POST RecordTrackTTM   { pat, duration, text, mode }   -> data.tasks[].download_link
 * The download link then 404s until rendering finishes; we poll it for the
 * audio bytes. Mubert output is always instrumental, so there are no lyrics
 * to moderate — the route layer still input-moderates the child's prompt.
 */

const PAT_TTL_MS = 30 * 60 * 1000;
const RENDER_POLL_MS = 3000;

let cachedPat: { pat: string; fetchedAt: number } | null = null;

export function mubertConfigured(): boolean {
  const { email, license, token } = config.providers.mubert;
  return Boolean(email && license && token);
}

async function getPat(): Promise<string> {
  if (cachedPat && Date.now() - cachedPat.fetchedAt < PAT_TTL_MS) return cachedPat.pat;
  const { email, license, token, baseUrl } = config.providers.mubert;
  const res = await fetch(`${baseUrl}/v2/GetServiceAccess`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      method: 'GetServiceAccess',
      params: { email, license, token, mode: 'loop' },
    }),
  });
  if (!res.ok) throw new ProviderRequestError('mubert', res.status, await safeText(res));
  const data = (await res.json()) as { status?: number; data?: { pat?: string }; error?: { text?: string } };
  const pat = data.status === 1 ? data.data?.pat : undefined;
  if (!pat) {
    throw new ProviderRequestError('mubert', 502, `no pat in response: ${data.error?.text ?? JSON.stringify(data).slice(0, 200)}`);
  }
  cachedPat = { pat, fetchedAt: Date.now() };
  return pat;
}

/**
 * Generate one instrumental loop for the prompt and download it. Resolves with
 * the audio bytes; rejects on upstream failure or when `deadlineMs` passes
 * while the track is still rendering.
 */
export async function generateMubertTrack(
  prompt: string,
  deadlineMs: number,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const { baseUrl, durationSec } = config.providers.mubert;
  const pat = await getPat();
  const res = await fetch(`${baseUrl}/v2/RecordTrackTTM`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      method: 'RecordTrackTTM',
      params: { pat, duration: durationSec, text: prompt, mode: 'loop' },
    }),
  });
  if (!res.ok) throw new ProviderRequestError('mubert', res.status, await safeText(res));
  const data = (await res.json()) as {
    status?: number;
    data?: { tasks?: Array<{ download_link?: string }> };
    error?: { text?: string };
  };
  const link = data.status === 1 ? data.data?.tasks?.[0]?.download_link : undefined;
  if (!link) {
    throw new ProviderRequestError('mubert', 502, `no download link: ${data.error?.text ?? JSON.stringify(data).slice(0, 200)}`);
  }

  // The link 404s while Mubert renders; poll until the audio appears.
  for (;;) {
    if (Date.now() > deadlineMs) {
      throw new ProviderRequestError('mubert', 504, 'track render timed out');
    }
    const dl = await fetch(link);
    if (dl.ok) {
      const bytes = Buffer.from(await dl.arrayBuffer());
      if (bytes.length >= 1000) {
        const mimeType = dl.headers.get('content-type')?.split(';')[0] || 'audio/mpeg';
        return { bytes, mimeType: mimeType.startsWith('audio/') ? mimeType : 'audio/mpeg' };
      }
    } else if (dl.status !== 404 && dl.status !== 403 && dl.status !== 425) {
      throw new ProviderRequestError('mubert', dl.status, `track download failed`);
    }
    await new Promise((r) => setTimeout(r, RENDER_POLL_MS));
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return '<no body>';
  }
}
