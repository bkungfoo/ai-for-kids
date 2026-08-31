/**
 * Map raw requests onto the vocabulary the dashboard speaks: an ACTIVITY
 * (which part of the app) and — when the request invokes generative AI or a
 * notable interaction — a TOOL id. Paths are normalized (uuids/numbers → :id)
 * so no content ever reaches the log.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

export function normalizePath(p: string): string {
  return p.replace(UUID_RE, ':id').replace(/\/\d+(?=\/|$)/g, '/:n');
}

export interface Classification {
  activity: string;
  tool?: string;
  /** Automated traffic (polls/status) — not evidence the user is present. */
  auto?: boolean;
  bookId?: string;
  pageIndex?: number;
}

export function classifyRequest(method: string, rawPath: string): Classification {
  const p = rawPath.split('?')[0] ?? rawPath;
  const uuid = p.match(/[0-9a-f-]{36}/)?.[0];
  const pageIdx = /\/pages\/(\d+)\//.exec(p)?.[1];
  const base: Pick<Classification, 'bookId' | 'pageIndex'> = {
    ...(uuid ? { bookId: uuid } : {}),
    ...(pageIdx !== undefined ? { pageIndex: Number(pageIdx) } : {}),
  };

  if (p.startsWith('/v1/books') || p.startsWith('/v1/library')) {
    const a = { activity: 'storybook', ...base };
    if (method === 'POST' && p === '/v1/books') return { ...a, tool: 'book-create' };
    if (method === 'POST' && /\/pages$/.test(p)) return { ...a, tool: 'page-image' };
    if (method === 'POST' && /\/pages\/\d+\/image$/.test(p)) return { ...a, tool: 'image-regen' };
    if (method === 'POST' && /\/cover$/.test(p)) return { ...a, tool: 'cover-regen' };
    if (/\/sprinkle(-draft)?$/.test(p)) return { ...a, tool: 'fairy-dust' };
    if (/\/godmother$/.test(p)) return { ...a, tool: 'godmother' };
    if (/\/suggest-music-prompt$/.test(p)) return { ...a, tool: 'music-suggest' };
    if (/\/suggest-prompt$/.test(p)) return { ...a, tool: 'image-suggest' };
    if (method === 'POST' && /\/music-job$/.test(p)) return { ...a, tool: 'bg-music-gen' };
    if (method === 'POST' && /\/(pages\/\d+|cover)\/music$/.test(p)) return { ...a, tool: 'bg-music-accept' };
    if (/\/narration-takes$/.test(p)) return { ...a, tool: 'narration-retake' };
    if (/\/narration-accept$/.test(p)) return { ...a, tool: 'narration-accept' };
    if (method === 'POST' && /\/narration$/.test(p)) return { ...a, tool: 'narration' };
    if (/\/intro-narration$/.test(p)) return { ...a, tool: 'narration' };
    if (/\/narrator-voice$/.test(p)) return { ...a, tool: 'narrator-pick' };
    if (method === 'POST' && /\/clone$/.test(p)) return { ...a, tool: 'book-clone' };
    if (/\/publish$/.test(p)) return { ...a, tool: 'publish' };
    if (/\/(share|unshare|transfer)$/.test(p)) return { ...a, tool: 'share' };
    if (method === 'DELETE' && /\/v1\/books\/[0-9a-f-]{36}$/.test(p)) return { ...a, tool: 'book-delete' };
    // Background/polling traffic: not user-presence evidence.
    if (/\/(music-jobs?|narration-status|warm-narration|music-audio|audio)\b/.test(p) && method === 'GET') {
      return { ...a, auto: true };
    }
    if (/\/warm-narration$/.test(p)) return { ...a, auto: true };
    if (method === 'GET' && /\/music-job\//.test(p)) return { ...a, auto: true };
    return a;
  }
  if (p.startsWith('/v1/music')) {
    const a = { activity: 'music' };
    if (method === 'POST' && p === '/v1/music') return { ...a, tool: 'song-gen' };
    if (method === 'GET' && /\/job\//.test(p)) return { ...a, auto: true };
    if (/\/(publish|keep|save)$/.test(p)) return { ...a, tool: 'song-keep' };
    return a;
  }
  if (p.startsWith('/v1/voices')) {
    const a = { activity: 'voices' };
    if (method === 'POST' && p === '/v1/voices/clone') return { ...a, tool: 'voice-clone' };
    if (/\/speak$/.test(p)) return { ...a, tool: 'voice-speak' };
    if (method === 'POST' && /\/clone$/.test(p)) return { ...a, tool: 'voice-copy' };
    if (/\/(publish|save)$/.test(p)) return { ...a, tool: 'voice-keep' };
    return a;
  }
  if (p.startsWith('/v1/images')) return { activity: 'images', tool: 'image-gen' };
  if (p.startsWith('/v1/voice')) return { activity: 'voices', tool: 'tts' };
  if (p.startsWith('/v1/code')) return { activity: 'code', tool: 'code-gen' };
  return { activity: 'site' };
}

/** Which activity a PAGE path belongs to (for client heartbeats). */
export function activityForPage(p: string): string {
  if (p.startsWith('/books') || p.startsWith('/library')) return 'storybook';
  if (p.startsWith('/music')) return 'music';
  if (p.startsWith('/voice')) return 'voices';
  if (p.startsWith('/code')) return 'code';
  return 'site';
}
