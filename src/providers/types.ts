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
