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

// Operator review area. Opt-in: the whole /review surface is disabled (404)
// unless REVIEW_PASSWORD is set. It is a separate, adult-only audit tool that
// can view content the child-facing app blocked — never linked from the kids UI.
const reviewPassword = str('REVIEW_PASSWORD');

export const config = {
  port: int('PORT', 8080),
  // Interface to bind. 0.0.0.0 exposes the server on all interfaces (external
  // IP included) — fine for testing, but serve behind HTTPS for real use.
  host: str('HOST', '0.0.0.0'),

  anthropicApiKey: str('ANTHROPIC_API_KEY'),

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
  },

  auth: {
    // The single valid account. No registration path exists.
    username: str('AUTH_USERNAME', 'HarborHouse'),
    password: str('AUTH_PASSWORD', 'hhai123!'),
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
    },
    gemini: {
      apiKey: str('GEMINI_API_KEY'),
      baseUrl: str('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com'),
    },
    claudeCode: {
      // Uses the top-level Anthropic API key.
      model: str('CLAUDE_CODE_MODEL', 'claude-opus-4-8'),
    },
  },
} as const;

export type Config = typeof config;
