import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { Semaphore } from '../util/semaphore.js';

/**
 * Bounds how many requests are processed concurrently. Node's event loop
 * already serves many clients at once; this simply caps the in-flight work so a
 * burst of clients can't fan out unbounded upstream calls. Requests beyond the
 * limit wait briefly; if the wait queue is too deep we shed load with 503.
 */
const gate = new Semaphore(config.http.maxConcurrentRequests);

export function concurrencyLimiter(req: Request, res: Response, next: NextFunction): void {
  if (gate.waiting >= config.http.maxQueue) {
    res.status(503).json({ ok: false, error: 'Server busy, please retry shortly.' });
    return;
  }

  void gate.acquire().then((release) => {
    // res emits 'finish' on a normal response and 'close' if the client hangs
    // up; release is idempotent, so wiring both is safe.
    res.on('finish', release);
    res.on('close', release);
    next();
  });
}
