import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { SAFE_VERDICT, type RiskCategory, type Severity, type Verdict } from './types.js';

const execFileAsync = promisify(execFile);

/** A generated image handed to SafeSearch before it may reach the child. */
export interface ImageToModerate {
  mimeType: string;
  dataBase64: string;
}

// Google Cloud Vision SafeSearch likelihood scale, in ascending order.
const LIKELIHOOD_RANK = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 1,
  UNLIKELY: 2,
  POSSIBLE: 3,
  LIKELY: 4,
  VERY_LIKELY: 5,
} as const;
type Likelihood = keyof typeof LIKELIHOOD_RANK;

/** SafeSearch dimensions we enforce, mapped onto our risk categories. */
const DIMENSIONS: Array<{
  key: 'adult' | 'racy' | 'violence' | 'medical';
  category: RiskCategory;
  /** Extra rank added before comparing to the threshold (0 = strictest). */
  slack: number;
}> = [
  { key: 'adult', category: 'sexual', slack: 0 },
  { key: 'racy', category: 'sexual', slack: 0 },
  { key: 'violence', category: 'violence', slack: 0 },
  // Medical imagery is usually benign (band-aids, doctors); only block when
  // Vision is one step more confident than the base threshold.
  { key: 'medical', category: 'age_inappropriate', slack: 1 },
];

interface SafeSearchAnnotation {
  adult?: Likelihood;
  spoof?: Likelihood;
  medical?: Likelihood;
  violence?: Likelihood;
  racy?: Likelihood;
}
interface AnnotateResponse {
  responses?: Array<{
    safeSearchAnnotation?: SafeSearchAnnotation;
    error?: { code?: number; message?: string };
  }>;
}

const BLOCKED_IMAGE_MESSAGE =
  "I drew something, but it didn't pass our picture safety check, so I can't show it. Let's try a different idea!";

/**
 * Run Google Cloud Vision SafeSearch Detection over a batch of generated
 * images. Returns a blocked verdict if ANY image scores at or above the
 * configured likelihood threshold on an enforced dimension.
 *
 * Fail-closed: if the Vision call errors (auth, network, missing annotation),
 * the images are blocked when FAIL_CLOSED=true (default).
 */
export async function safeSearchImages(images: ImageToModerate[]): Promise<Verdict> {
  if (images.length === 0) return SAFE_VERDICT;

  let data: AnnotateResponse;
  try {
    data = await annotate(images);
  } catch (err) {
    logger.error('SafeSearch call failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return failVerdict(`SafeSearch call failed: ${err instanceof Error ? err.message : err}`);
  }

  const responses = data.responses ?? [];
  const threshold = LIKELIHOOD_RANK[config.vision.blockAt as Likelihood] ?? LIKELIHOOD_RANK.POSSIBLE;

  const categories = new Set<RiskCategory>();
  let worst = 0;
  const reasons: string[] = [];

  for (let i = 0; i < images.length; i++) {
    const res = responses[i];
    const annotation = res?.safeSearchAnnotation;
    if (!annotation) {
      // Per-image Vision error or missing annotation — treat as a failed check.
      const msg = res?.error?.message ?? 'no SafeSearch annotation returned';
      logger.error('SafeSearch missing annotation', { image: i, message: msg });
      return failVerdict(`image ${i}: ${msg}`);
    }

    for (const dim of DIMENSIONS) {
      const likelihood = annotation[dim.key] ?? 'UNKNOWN';
      const rank = LIKELIHOOD_RANK[likelihood] ?? 0;
      if (rank >= threshold + dim.slack) {
        categories.add(dim.category);
        worst = Math.max(worst, rank);
        reasons.push(`image ${i}: ${dim.key}=${likelihood}`);
      }
    }
  }

  if (categories.size === 0) return SAFE_VERDICT;

  const severity: Severity = worst >= LIKELIHOOD_RANK.LIKELY ? 'high' : 'medium';
  return {
    allowed: false,
    severity,
    categories: [...categories],
    reason: `SafeSearch flagged generated image(s): ${reasons.join('; ')}`,
    childMessage: BLOCKED_IMAGE_MESSAGE,
  };
}

/** Apply the fail-open/fail-closed policy to a SafeSearch failure. */
function failVerdict(reason: string): Verdict {
  if (!config.moderation.failClosed) {
    logger.warn('SafeSearch failed but FAIL_CLOSED=false — allowing image through (unsafe)');
    return SAFE_VERDICT;
  }
  return {
    allowed: false,
    severity: 'high',
    categories: ['other'],
    reason: `Fail-closed: ${reason}`,
    childMessage: BLOCKED_IMAGE_MESSAGE,
  };
}

async function annotate(images: ImageToModerate[]): Promise<AnnotateResponse> {
  const { apiKey, baseUrl } = config.vision;
  const url = new URL('/v1/images:annotate', baseUrl);
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (apiKey) {
    url.searchParams.set('key', apiKey);
  } else {
    headers.authorization = `Bearer ${await getAccessToken()}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: images.map((img) => ({
        image: { content: img.dataBase64 },
        features: [{ type: 'SAFE_SEARCH_DETECTION' }],
      })),
    }),
  });

  if (!res.ok) {
    const body = (await res.text().catch(() => '<no body>')).slice(0, 300);
    throw new Error(`Vision API ${res.status}: ${body}`);
  }
  return (await res.json()) as AnnotateResponse;
}

// --- OAuth access token (used when no VISION_API_KEY is set) -----------------
// Tries Application Default Credentials via gcloud, then the GCE metadata
// server. The token is cached until shortly before expiry.

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  // 1. Application Default Credentials (e.g. after `gcloud auth application-default login`).
  try {
    const { stdout } = await execFileAsync(
      'gcloud',
      ['auth', 'application-default', 'print-access-token'],
      { timeout: 10_000 },
    );
    const token = stdout.trim();
    if (token) {
      cachedToken = { value: token, expiresAt: Date.now() + 45 * 60 * 1000 };
      return token;
    }
  } catch {
    // fall through to metadata server
  }

  // 2. GCE metadata server (VM service account).
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!res.ok) throw new Error(`no Vision credentials: metadata token fetch failed (${res.status})`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(0, (data.expires_in - 300) * 1000),
  };
  return data.access_token;
}
