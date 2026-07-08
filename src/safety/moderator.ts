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

const client = new Anthropic({ apiKey: config.anthropicApiKey });

// Bound how many moderation calls hit the Anthropic API at once. This protects
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

const GENERIC_BLOCK_MESSAGE =
  "Let's try a different idea — keep it friendly and safe!";

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
  } catch (err) {
    logger.error('moderation call failed', {
      direction,
      error: err instanceof Error ? err.message : String(err),
    });
    return failVerdict('moderation_error', direction);
  } finally {
    release();
  }
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
