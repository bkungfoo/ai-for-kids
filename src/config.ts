import 'dotenv/config';

function str(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export type Effort = 'low' | 'medium' | 'high';

const effortRaw = str('MODERATION_EFFORT', 'low').toLowerCase();
const moderationEffort: Effort =
  effortRaw === 'medium' || effortRaw === 'high' ? effortRaw : 'low';

const blockAtRaw = str('SAFESEARCH_BLOCK_AT', 'POSSIBLE').toUpperCase();
const safeSearchBlockAt =
  blockAtRaw === 'LIKELY' || blockAtRaw === 'VERY_LIKELY' ? blockAtRaw : 'POSSIBLE';

// Which engine paints storybook illustrations:
//   'replicate' — "Nano Banana Pro" (Google Gemini 3 Pro Image) via Replicate;
//                 higher quality + up to 14 reference images for consistency.
//   'gemini'    — "Nano Banana 2" (Gemini 3.1 Flash Image) direct; cheaper.
// Default is Replicate / Nano Banana Pro; set STORY_IMAGE_PROVIDER=gemini to
// switch to the cheaper engine.
const storyImageProviderRaw = str('STORY_IMAGE_PROVIDER', 'replicate').toLowerCase();
const storyImageProvider: 'replicate' | 'gemini' =
  storyImageProviderRaw === 'gemini' ? 'gemini' : 'replicate';

// Operator review area. Opt-in: the whole /review surface is disabled (404)
// unless REVIEW_PASSWORD is set. It is a separate, adult-only audit tool that
// can view content the child-facing app blocked — never linked from the kids UI.
const reviewPassword = str('REVIEW_PASSWORD');

export interface Account {
  username: string;
  password: string;
}

// The valid login accounts. There is no registration path; these are the only
// users. The primary account comes from AUTH_USERNAME/AUTH_PASSWORD (defaulting
// to the provisioned HarborHouse credentials); AUTH_ADDITIONAL_USERS adds more
// as a comma-separated "username:password" list, e.g.
//   AUTH_ADDITIONAL_USERS=HarborHouse1:hhai123!,HarborHouse2:hhai123!
// Duplicate usernames are ignored (first definition wins).
function parseAccounts(): Account[] {
  const primary: Account = {
    username: str('AUTH_USERNAME', 'HarborHouse'),
    password: str('AUTH_PASSWORD', 'hhai123!'),
  };
  const accounts: Account[] = [primary];
  const seen = new Set([primary.username]);
  for (const pair of str('AUTH_ADDITIONAL_USERS').split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(':');
    if (sep <= 0) continue; // need a non-empty username before the colon
    const username = trimmed.slice(0, sep).trim();
    const password = trimmed.slice(sep + 1); // password kept verbatim (may hold anything but comma)
    if (!username || !password || seen.has(username)) continue;
    seen.add(username);
    accounts.push({ username, password });
  }
  return accounts;
}

const accounts = parseAccounts();

export const config = {
  port: int('PORT', 8080),
  // Interface to bind. 0.0.0.0 exposes the server on all interfaces (external
  // IP included) — fine for testing, but serve behind HTTPS for real use.
  host: str('HOST', '0.0.0.0'),

  anthropicApiKey: str('ANTHROPIC_API_KEY'),

  // Which engine paints storybook illustrations (see storyImageProvider above).
  storyImage: {
    provider: storyImageProvider,
  },

  moderation: {
    model: str('MODERATION_MODEL', 'claude-opus-4-8'),
    effort: moderationEffort,
    failClosed: bool('FAIL_CLOSED', true),
    maxConcurrency: int('MAX_MODERATION_CONCURRENCY', 16),
  },

  // Google Cloud Vision SafeSearch — screens every generated image before it
  // is returned to the child. Auth: VISION_API_KEY if set, else Application
  // Default Credentials / the GCE metadata token.
  vision: {
    apiKey: str('VISION_API_KEY'),
    baseUrl: str('VISION_BASE_URL', 'https://vision.googleapis.com'),
    // Block an image when adult/racy/violence likelihood is at or above this:
    // POSSIBLE (strict, default for kids) | LIKELY | VERY_LIKELY
    blockAt: safeSearchBlockAt,
  },

  http: {
    maxConcurrentRequests: int('MAX_CONCURRENT_REQUESTS', 10),
    maxQueue: int('MAX_QUEUE', 50),
    // Set true when running behind a reverse proxy (e.g. Caddy terminating TLS)
    // so Express reads the client IP/protocol from X-Forwarded-* headers.
    trustProxy: bool('TRUST_PROXY', false),
  },

  auth: {
    // All valid accounts (primary + AUTH_ADDITIONAL_USERS). No registration path.
    accounts,
    // The primary account, kept for back-compat / display.
    username: accounts[0]!.username,
    password: accounts[0]!.password,
    sessionTtlMs: int('SESSION_TTL_HOURS', 12) * 60 * 60 * 1000,
    cookieName: 'csai_session',
    // Set true when served over HTTPS so the cookie is sent only on secure connections.
    cookieSecure: bool('COOKIE_SECURE', false),
  },

  // Adult-only operator review area (see reviewPassword above). Disabled unless
  // a password is configured. Uses its own cookie/session, separate from the
  // child login, with a shorter default lifetime.
  review: {
    enabled: reviewPassword.length > 0,
    password: reviewPassword,
    cookieName: 'csai_review',
    sessionTtlMs: int('REVIEW_SESSION_TTL_HOURS', 4) * 60 * 60 * 1000,
  },

  providers: {
    suno: {
      apiKey: str('SUNO_API_KEY'),
      baseUrl: str('SUNO_BASE_URL', 'https://api.suno.ai'),
    },
    elevenlabs: {
      apiKey: str('ELEVENLABS_API_KEY'),
      baseUrl: str('ELEVENLABS_BASE_URL', 'https://api.elevenlabs.io'),
      // Storybook read-aloud narrator voice. When no ElevenLabs key is set the
      // reader falls back to the browser's built-in speech synthesis.
      narratorVoiceId: str('ELEVENLABS_NARRATOR_VOICE', 'EXAVITQu4vr4xnSDxMaL'),
    },
    gemini: {
      apiKey: str('GEMINI_API_KEY'),
      baseUrl: str('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com'),
      // "Nano Banana 2" — Gemini 3.1 Flash Image.
      model: str('GEMINI_IMAGE_MODEL', 'gemini-3.1-flash-image'),
    },
    // Replicate — hosts "Nano Banana Pro" (Google Gemini 3 Pro Image). Stateless
    // API; we feed it earlier pages as context and earlier pictures as reference
    // images so characters/objects/settings stay consistent across the book.
    replicate: {
      apiToken: str('REPLICATE_API_TOKEN'),
      baseUrl: str('REPLICATE_BASE_URL', 'https://api.replicate.com'),
      model: str('REPLICATE_IMAGE_MODEL', 'google/nano-banana-pro'),
      // Output resolution: 1K | 2K | 4K. Lower is cheaper; book pages display
      // small, so 2K is a good quality/cost balance.
      resolution: str('REPLICATE_IMAGE_RESOLUTION', '2K'),
      // Nano Banana Pro's own safety gate (in addition to our moderation +
      // Vision SafeSearch): block_low_and_above | block_medium_and_above |
      // block_only_high. Strict by default for a kids' app.
      safetyFilter: str('REPLICATE_SAFETY_FILTER', 'block_low_and_above'),
    },
    claudeCode: {
      // Uses the top-level Anthropic API key.
      model: str('CLAUDE_CODE_MODEL', 'claude-opus-4-8'),
    },
    // Storybook "fairy dust": rewrites a page's words with perfect grammar and
    // smooth story flow, in elementary-age language. Runs on Google Gemini via
    // the same AI Studio key as image generation (GEMINI_API_KEY).
    fairyDust: {
      model: str('FAIRY_DUST_MODEL', 'gemini-3.1-flash-lite'),
    },
  },
} as const;

export type Config = typeof config;
