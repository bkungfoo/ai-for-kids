import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger.js';
import { CreditsExhaustedError } from '../util/credits.js';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ ok: false, error: 'Not found' });
}

// Express recognizes this as an error handler by its four-argument signature.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;
  // Out of AI credits: a distinct, honest error (never the safety-block
  // message). The operator alert was already sent where it was detected.
  if (err instanceof CreditsExhaustedError) {
    res.status(503).json({
      ok: false,
      code: 'credits_exhausted',
      error: `The AI credits have run out (${err.provider}) — ask a grown-up to top up the account.`,
    });
    return;
  }
  logger.error('unhandled error', {
    error: err instanceof Error ? err.message : String(err),
  });
  res.status(500).json({ ok: false, error: 'Internal server error' });
}
