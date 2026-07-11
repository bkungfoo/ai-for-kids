import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { Semaphore } from '../util/semaphore.js';
import { CHILD_SAFETY_RUBRIC, buildModerationPrompt } from './rubric.js';
import {
  RISK_CATEGORIES,
  SAFE_VERDICT,
  blockedVerdict,
  type ModerationDirection,
  type RiskCategory,
  type Severity,
  type Verdict,
} from './types.js';

/**
 * The moderation engine. Which provider runs the child-safety classification
 * is inferred from MODERATION_MODEL:
 *   - claude-* -> Anthropic (structured outputs, cached rubric)
 *   - gemini-* -> Google Gemini via GEMINI_API_KEY (JSON mode + response schema)
 * Both use the same rubric, the same prompt shape and the same Verdict schema,
 * so the rest of the pipeline doesn't care which engine judged the text.
 */

const client = new Anthropic({ apiKey: config.anthropicApiKey });

// Bound how many moderation calls hit the model API at once. This protects
// us from fanning out unbounded concurrent requests under load.
const limiter = new Semaphore(config.moderation.maxConcurrency);

// JSON Schema for structured output. Note the structured-output constraints:
// every object needs additionalProperties:false + required, and we use enums
// rather than free-form strings so verdicts are predictable.
const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    allowed: { type: 'boolean' },
    severity: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
    categories: {
      type: 'array',
      items: { type: 'string', enum: [...RISK_CATEGORIES] },
    },
    reason: { type: 'string' },
    childMessage: { type: 'string' },
  },
  required: ['allowed', 'severity', 'categories', 'reason', 'childMessage'],
} as const;

// The same schema in Gemini's OpenAPI-style responseSchema dialect.
const GEMINI_VERDICT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    allowed: { type: 'BOOLEAN' },
    severity: { type: 'STRING', enum: ['none', 'low', 'medium', 'high'] },
    categories: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: [...RISK_CATEGORIES] },
    },
    reason: { type: 'STRING' },
    childMessage: { type: 'STRING' },
  },
  required: ['allowed', 'severity', 'categories', 'reason', 'childMessage'],
} as const;

const GENERIC_BLOCK_MESSAGE =
  "Let's try a different idea — keep it friendly and safe!";

function moderationEngine(): 'gemini' | 'anthropic' {
  return config.moderation.model.startsWith('gemini') ? 'gemini' : 'anthropic';
}

/**
 * Classify a single piece of text for child safety. Empty/whitespace text is
 * always allowed without an API call. On a moderation error we honor the
 * FAIL_CLOSED setting (block by default).
 */
export async function moderate(
  text: string,
  direction: ModerationDirection,
): Promise<Verdict> {
  if (!text || !text.trim()) return SAFE_VERDICT;

  const release = await limiter.acquire();
  try {
    return moderationEngine() === 'gemini'
      ? await classifyWithGemini(text, direction)
      : await classifyWithClaude(text, direction);
  } catch (err) {
    logger.error('moderation call failed', {
      direction,
      error: err instanceof Error ? err.message : String(err),
      engine: moderationEngine(),
    });
    return failVerdict('moderation_error', direction);
  } finally {
    release();
  }
}

async function classifyWithClaude(
  text: string,
  direction: ModerationDirection,
): Promise<Verdict> {
  // output_config + adaptive thinking are recent API additions; the request
  // shape is stable but may outpace the installed SDK's static types, so we
  // build the params object and pass it through.
  const params = {
    model: config.moderation.model,
    max_tokens: 1024,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: config.moderation.effort,
      format: { type: 'json_schema', schema: VERDICT_SCHEMA },
    },
    system: [
      {
        type: 'text',
        text: CHILD_SAFETY_RUBRIC,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      { role: 'user', content: buildModerationPrompt(text, direction) },
    ],
  };

  const response: Anthropic.Message = await client.messages.create(
    params as unknown as Anthropic.MessageCreateParamsNonStreaming,
  );

  if (response.stop_reason === 'refusal') {
    logger.warn('moderation refused by safety classifier', { direction });
    return failVerdict('moderation_refusal', direction);
  }

  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') {
    return failVerdict('moderation_no_text_block', direction);
  }

  return normalize(JSON.parse(block.text) as Record<string, unknown>);
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

async function classifyWithGemini(
  text: string,
  direction: ModerationDirection,
): Promise<Verdict> {
  const { apiKey, baseUrl } = config.providers.gemini;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set (required for Gemini moderation)');

  const res = await fetch(
    `${baseUrl}/v1beta/models/${config.moderation.model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: CHILD_SAFETY_RUBRIC }] },
        contents: [
          { role: 'user', parts: [{ text: buildModerationPrompt(text, direction) }] },
        ],
        // The classifier must be able to READ risky text in order to judge it;
        // its own output is only a JSON verdict. Relax Gemini's request-level
        // filter so it doesn't pre-empt the classification (a pre-empted call
        // would fail closed and block benign-but-flagged content unreviewed).
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_VERDICT_SCHEMA,
          // Deterministic verdicts.
          temperature: 0,
          maxOutputTokens: 1024,
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`gemini moderation HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const cand = data.candidates?.[0];
  const raw = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!raw.trim()) {
    // Gemini declined to produce a verdict at all — treat like a refusal and
    // let the caller fail closed.
    const why = cand?.finishReason ?? data.promptFeedback?.blockReason ?? 'unknown';
    throw new Error(`gemini moderation returned no verdict (${why})`);
  }
  return normalize(JSON.parse(raw) as Record<string, unknown>);
}

function failVerdict(reason: string, direction: ModerationDirection): Verdict {
  if (config.moderation.failClosed) {
    return blockedVerdict(
      `${reason} (failing closed, direction=${direction})`,
      GENERIC_BLOCK_MESSAGE,
    );
  }
  return { ...SAFE_VERDICT, reason: `${reason} (failing open)` };
}

/** Coerce the model's JSON into a well-formed Verdict, defensively. */
function normalize(raw: Record<string, unknown>): Verdict {
  const allowed = raw.allowed === true;
  const severity = asSeverity(raw.severity);
  const categories = asCategories(raw.categories);
  const reason = typeof raw.reason === 'string' ? raw.reason : '';
  let childMessage = typeof raw.childMessage === 'string' ? raw.childMessage : '';
  if (!allowed && !childMessage.trim()) childMessage = GENERIC_BLOCK_MESSAGE;

  return { allowed, severity, categories, reason, childMessage };
}

function asSeverity(v: unknown): Severity {
  return v === 'low' || v === 'medium' || v === 'high' ? v : v === 'none' ? 'none' : 'none';
}

function asCategories(v: unknown): RiskCategory[] {
  if (!Array.isArray(v)) return [];
  return v.filter((c): c is RiskCategory =>
    (RISK_CATEGORIES as readonly string[]).includes(c as string),
  );
}
