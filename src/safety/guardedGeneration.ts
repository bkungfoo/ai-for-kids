import { logger } from '../logger.js';
import {
  ProviderNotConfiguredError,
  ProviderRequestError,
  type GenerationResult,
  type Provider,
} from '../providers/types.js';
import { sendOperatorAlert } from '../util/alerts.js';
import { CreditsExhaustedError, isCreditsErrorMessage } from '../util/credits.js';
import { recordBlocked } from './blockedStore.js';
import { guardText, permittedAtLevel, type SafetyLevel } from './pipeline.js';
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
  opts?: { safetyLevel?: SafetyLevel },
): Promise<GuardOutcome> {
  if (!provider.isConfigured()) {
    return { status: 501, body: { ok: false, error: `${provider.name} is not configured` } };
  }

  // 1. Input moderation — fail fast, no provider call, no cost spent upstream.
  const inputVerdict = await guardText(provider.inputTexts(req), 'input');
  if (!permittedAtLevel(inputVerdict, opts?.safetyLevel)) {
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
    // A generation provider ran out of credits/quota: page the owner and
    // surface a distinct error (errorHandler turns this into a 503 with
    // code=credits_exhausted) instead of a vague failure.
    if (err instanceof ProviderRequestError && isCreditsErrorMessage(err.message)) {
      sendOperatorAlert(
        `credits-provider-${provider.name}`,
        `⚠️ Harbor House: AI credits exhausted (${provider.name})`,
        `Generation requests are failing because the "${provider.name}" provider ` +
          `reports its credits/quota ran out.\n\nAPI error: ${err.message}\n\n` +
          'Top up the account to restore service; no restart is needed.',
      );
      throw new CreditsExhaustedError(provider.name, err.message);
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
  if (!permittedAtLevel(outputVerdict, opts?.safetyLevel)) {
    logger.warn('blocked on output', {
      provider: provider.name,
      categories: outputVerdict.categories,
      severity: outputVerdict.severity,
    });
    await auditBlocked(provider, req, generation, 'output', outputVerdict);
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
      await auditBlocked(provider, req, generation, 'image', imageVerdict);
      return blocked('output', imageVerdict);
    }
  }

  return { status: 200, body: { ok: true, result: generation.result } };
}

/**
 * Preserve a blocked generation (when it produced images) in the operator-only
 * audit store, so an adult can later review WHAT was stopped and why in
 * /review. Recording failures never break the block itself.
 */
async function auditBlocked<Req>(
  provider: Provider<Req>,
  req: Req,
  generation: GenerationResult,
  stage: 'output' | 'image',
  verdict: Verdict,
): Promise<void> {
  const images = generation.imagesToModerate ?? [];
  if (images.length === 0) return; // nothing visual to review
  try {
    await recordBlocked({
      provider: provider.name,
      stage,
      severity: verdict.severity,
      categories: verdict.categories,
      reason: verdict.reason,
      inputTexts: provider.inputTexts(req),
      captions: generation.textToModerate,
      images,
    });
  } catch (err) {
    logger.error('failed to record blocked generation', {
      provider: provider.name,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
