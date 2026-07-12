/**
 * "The AI ran out of credits" is an operator problem, not a content problem —
 * it must surface as its own error (and page the owner), never hide behind the
 * child-facing safety-block message.
 */
export class CreditsExhaustedError extends Error {
  constructor(
    public readonly provider: string,
    detail: string,
  ) {
    super(`AI credits exhausted (${provider}): ${detail}`);
    this.name = 'CreditsExhaustedError';
  }
}

/** Matches the billing/quota-exhaustion messages of Anthropic and Google APIs. */
export function isCreditsErrorMessage(message: string): boolean {
  return /credit balance is too low|insufficient credits|RESOURCE_EXHAUSTED|exceeded your current quota|quota exceeded|billing hard limit/i.test(
    message,
  );
}
