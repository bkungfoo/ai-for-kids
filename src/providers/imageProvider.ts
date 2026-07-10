import { config } from '../config.js';
import { logger } from '../logger.js';
import { geminiProvider } from './gemini.js';
import { replicateProvider } from './replicate.js';
import type { ImageEngine, ImageGenRequest, Provider } from './types.js';

/** Human-readable engine names (title-page "illustrated by" credit). */
export const ENGINE_NAMES: Record<ImageEngine, string> = {
  replicate: 'Google Nano Banana Pro',
  gemini: 'Google Nano Banana 2',
};

function providerOf(engine: ImageEngine): Provider<ImageGenRequest> {
  return engine === 'gemini' ? geminiProvider : replicateProvider;
}

/**
 * Resolve the engine that paints a book's illustrations. Each book can carry
 * its own choice (picked when the book is started); with no choice, the
 * STORY_IMAGE_PROVIDER default applies. Both adapters take the same
 * `ImageGenRequest`, so they are interchangeable.
 *
 * If the wanted engine isn't configured but the other one is, we fall back to
 * it so the app keeps working (with a warning). If neither is configured we
 * return the wanted one, which surfaces the usual "not configured" (501).
 */
export function imageProviderFor(engine?: ImageEngine): Provider<ImageGenRequest> {
  const wanted = providerOf(engine ?? config.storyImage.provider);
  if (wanted.isConfigured()) return wanted;

  const fallback = wanted === geminiProvider ? replicateProvider : geminiProvider;
  if (fallback.isConfigured()) {
    logger.warn('wanted image engine not configured — falling back', {
      wanted: wanted.name,
      fallback: fallback.name,
    });
    return fallback;
  }
  return wanted;
}

/**
 * Engines that are actually usable right now (configured with a key). The
 * new-book picker only offers these, so a disabled engine (e.g. Nano Banana
 * Pro switched off for cost) simply disappears from the UI.
 */
export function availableEngines(): ImageEngine[] {
  return (['replicate', 'gemini'] as const).filter((e) => providerOf(e).isConfigured());
}

/** The default engine (no per-book choice), e.g. for /v1/images and /review. */
export function storyImageProvider(): Provider<ImageGenRequest> {
  return imageProviderFor();
}

/** Human-readable name of the default engine actually in use. */
export function illustratorName(): string {
  return storyImageProvider() === geminiProvider ? ENGINE_NAMES.gemini : ENGINE_NAMES.replicate;
}
