import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger.js';

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
  logger.error('unhandled error', {
    error: err instanceof Error ? err.message : String(err),
  });
  if (res.headersSent) return;
  res.status(500).json({ ok: false, error: 'Internal server error' });
}
