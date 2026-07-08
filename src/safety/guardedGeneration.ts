import { logger } from '../logger.js';
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type Provider,
} from '../providers/types.js';
import { guardText } from './pipeline.js';
import { safeSearchImages } from './safeSearch.js';
import type { Verdict } from './types.js';

export type GuardOutcome =
  | { status: 200; body: { ok: true; result: unknown } }
  | {
      status: 403;
      body: { ok: false; blocked: true; stage: 'input' | 'output'; message: string; verdict: PublicVerdict };
    }
  | { status: 501; body: { ok: false; error: string } }
  | { status: 502; body: { ok: false; error: string } };

/** The slice of a verdict we are willing to expose to clients (no internal reason). */
export interface PublicVerdict {
  severity: Verdict['severity'];
  categories: Verdict['categories'];
}

/**
 * Run a provider request through the full safety pipeline:
 *   1. moderate input  -> block before any provider call if unsafe
 *   2. call provider
 *   3. moderate output -> block before returning if unsafe
 *   4. SafeSearch      -> screen any generated images before returning
 */
export async function runGuardedGeneration<Req>(
  provider: Provider<Req>,
  req: Req,
): Promise<GuardOutcome> {
  if (!provider.isConfigured()) {
    return { status: 501, body: { ok: false, error: `${provider.name} is not configured` } };
  }

  // 1. Input moderation — fail fast, no provider call, no cost spent upstream.
  const inputVerdict = await guardText(provider.inputTexts(req), 'input');
  if (!inputVerdict.allowed) {
    logger.warn('blocked on input', {
      provider: provider.name,
      categories: inputVerdict.categories,
      severity: inputVerdict.severity,
    });
    return blocked('input', inputVerdict);
  }

  // 2. Provider call.
  let generation;
  try {
    generation = await provider.generate(req);
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return { status: 501, body: { ok: false, error: err.message } };
    }
    if (err instanceof ProviderRequestError) {
      logger.error('provider request error', { provider: provider.name, message: err.message });
      return { status: 502, body: { ok: false, error: `${provider.name} request failed` } };
    }
    logger.error('provider unexpected error', {
      provider: provider.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 502, body: { ok: false, error: `${provider.name} request failed` } };
  }

  // 3. Output moderation — re-check anything the provider produced.
  const outputVerdict = await guardText(
    [...generation.textToModerate, ...generation.metadataToModerate],
    'output',
  );
  if (!outputVerdict.allowed) {
    logger.warn('blocked on output', {
      provider: provider.name,
      categories: outputVerdict.categories,
      severity: outputVerdict.severity,
    });
    return blocked('output', outputVerdict);
  }

  // 4. Image moderation — every generated image must pass Google SafeSearch
  //    Detection before it can be displayed to the child.
  const images = generation.imagesToModerate ?? [];
  if (images.length > 0) {
    const imageVerdict = await safeSearchImages(images);
    if (!imageVerdict.allowed) {
      logger.warn('blocked on image (SafeSearch)', {
        provider: provider.name,
        categories: imageVerdict.categories,
        severity: imageVerdict.severity,
        reason: imageVerdict.reason,
      });
      return blocked('output', imageVerdict);
    }
  }

  return { status: 200, body: { ok: true, result: generation.result } };
}

// --- Operator review generation ---------------------------------------------
// A variant of the pipeline for the adult-only review area. It runs the SAME
// safety checks but, instead of withholding blocked content, it returns the
// generated output together with every stage verdict (including the internal
// `reason`, which the child-facing API never exposes) so an operator can audit
// exactly what was flagged and why.

export interface ReviewStage {
  stage: 'input' | 'output' | 'image';
  allowed: boolean;
  severity: Verdict['severity'];
  categories: Verdict['categories'];
  /** Internal explanation — intentionally surfaced here (operator-only). */
  reason: string;
}

export type ReviewOutcome =
  | {
      status: 200;
      body: {
        ok: true;
        /** True if the child-facing app would have blocked this. */
        blocked: boolean;
        stages: ReviewStage[];
        /** Present when the provider ran; may contain content that was blocked. */
        result?: unknown;
      };
    }
  | { status: 501; body: { ok: false; error: string } }
  | { status: 502; body: { ok: false; error: string } };

function toStage(stage: ReviewStage['stage'], v: Verdict): ReviewStage {
  return {
    stage,
    allowed: v.allowed,
    severity: v.severity,
    categories: v.categories,
    reason: v.reason,
  };
}

export async function runReviewGeneration<Req>(
  provider: Provider<Req>,
  req: Req,
): Promise<ReviewOutcome> {
  if (!provider.isConfigured()) {
    return { status: 501, body: { ok: false, error: `${provider.name} is not configured` } };
  }

  const stages: ReviewStage[] = [];

  // 1. Input moderation. If the prompt is blocked, the provider is never called
  //    (nothing is generated), so there is no output to review — return early.
  const inputVerdict = await guardText(provider.inputTexts(req), 'input');
  stages.push(toStage('input', inputVerdict));
  if (!inputVerdict.allowed) {
    return { status: 200, body: { ok: true, blocked: true, stages } };
  }

  // 2. Provider call.
  let generation;
  try {
    generation = await provider.generate(req);
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return { status: 501, body: { ok: false, error: err.message } };
    }
    logger.error('review provider error', {
      provider: provider.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 502, body: { ok: false, error: `${provider.name} request failed` } };
  }

  // 3. Output + 4. image checks — recorded but NOT enforced (content returned).
  const outputVerdict = await guardText(
    [...generation.textToModerate, ...generation.metadataToModerate],
    'output',
  );
  stages.push(toStage('output', outputVerdict));

  const images = generation.imagesToModerate ?? [];
  if (images.length > 0) {
    stages.push(toStage('image', await safeSearchImages(images)));
  }

  const blocked = stages.some((s) => !s.allowed);
  if (blocked) {
    // Audit trail: an operator viewed content the child app would have blocked.
    logger.warn('operator reviewed blocked content', {
      provider: provider.name,
      stages: stages.filter((s) => !s.allowed).map((s) => ({ stage: s.stage, categories: s.categories })),
    });
  }

  return { status: 200, body: { ok: true, blocked, stages, result: generation.result } };
}

function blocked(stage: 'input' | 'output', verdict: Verdict): GuardOutcome {
  return {
    status: 403,
    body: {
      ok: false,
      blocked: true,
      stage,
      message: verdict.childMessage,
      verdict: { severity: verdict.severity, categories: verdict.categories },
    },
  };
}
