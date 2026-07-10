/**
 * Each provider adapter turns a validated request into a normalized result and
 * tells the gateway which strings to moderate on the way back out.
 */
export interface GenerationResult {
  /**
   * Free-text the provider produced that should be moderated on output
   * (e.g. generated code, captions, story text).
   */
  textToModerate: string[];
  /**
   * Metadata strings to moderate on output (titles, filenames, revised prompts,
   * URLs). Kept separate so callers can treat them differently if desired.
   */
  metadataToModerate: string[];
  /**
   * Generated images to screen with Google SafeSearch Detection before the
   * result may reach the child. Omit/empty for text-only providers.
   */
  imagesToModerate?: Array<{ mimeType: string; dataBase64: string }>;
  /** The payload returned to the client once output moderation passes. */
  result: unknown;
}

/**
 * Safety instruction placed FIRST in every image prompt — before the story
 * context, reference images and scene description — steering the model toward
 * child-safe output so fewer generations are lost to the downstream blocks
 * (output moderation / Vision SafeSearch). Added by the image adapters at
 * generate() time; it is our text, so it is never input-moderated.
 */
export const CHILD_SAFE_IMAGE_PREAMBLE =
  'IMPORTANT SAFETY RULE — this comes first and overrides everything below: ' +
  "this picture is for a children's picture book (ages 5-12). It must be " +
  'completely safe and gentle for young children: friendly and non-frightening, ' +
  'with no violence, blood, injuries shown graphically, weapons, scary or ' +
  'disturbing imagery, and no romantic or adult content of any kind. If any ' +
  'detail requested below would not be child-safe, soften it into a gentle, ' +
  'child-friendly version instead.';

/**
 * The engine that paints storybook illustrations:
 *   'replicate' — Nano Banana Pro (Google Gemini 3 Pro Image) via Replicate
 *   'gemini'    — Nano Banana 2 (Gemini 3.1 Flash Image) direct; cheaper
 */
export type ImageEngine = 'replicate' | 'gemini';

/** A picture (base64) that can be fed back to an image model as a reference. */
export interface ReferenceImage {
  mimeType: string;
  dataBase64: string;
}

/**
 * A request to paint a storybook illustration. It is deliberately richer than a
 * bare prompt so a STATELESS image API (e.g. Nano Banana Pro on Replicate) can
 * still stay consistent across a whole book:
 *   - `prompt`          the scene to draw now, plus reinforcement instructions
 *   - `context`         the narrative so far (earlier pages), as extra context
 *   - `referenceImages` earlier illustrations, so the model can copy the same
 *                       characters, objects and art style forward
 * Each adapter maps these onto whatever channels its API exposes.
 */
export interface ImageGenRequest {
  /** The picture to make now — user-supplied text; moderated on input. */
  prompt: string;
  /** Story text from earlier pages, carried forward for consistency. */
  context?: string;
  /** Earlier pictures from the same book, used as visual references. */
  referenceImages?: ReferenceImage[];
  /** Override the underlying model id. */
  model?: string;
}

export interface Provider<Req> {
  readonly name: string;
  /** True when the provider has the credentials/config it needs to run. */
  isConfigured(): boolean;
  /** Pull the text fields that must pass INPUT moderation from a request. */
  inputTexts(req: Req): string[];
  /** Call the upstream provider. Only invoked after input moderation passes. */
  generate(req: Req): Promise<GenerationResult>;
}

/** Thrown by an adapter when its credentials are missing. */
export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Provider "${provider}" is not configured. Set its API key to enable it.`);
    this.name = 'ProviderNotConfiguredError';
  }
}

/** Thrown when the upstream provider call fails. */
export class ProviderRequestError extends Error {
  constructor(
    provider: string,
    public readonly status: number,
    detail: string,
  ) {
    super(`Provider "${provider}" request failed (${status}): ${detail}`);
    this.name = 'ProviderRequestError';
  }
}
