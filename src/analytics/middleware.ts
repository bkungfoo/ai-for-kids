import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { currentUser, currentUniverse } from './../middleware/requireAuth.js';
import { classifyRequest, normalizePath } from './classify.js';
import { appendEvent } from './store.js';

/**
 * Records one UsageEvent per signed-in /v1 request, after the response is
 * decided (so status + safety verdicts are known). Captures a short HASH of
 * the creative prompt for change-detection — raw text never reaches the log.
 */
export function analyticsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(req);
  if (!user || req.path.startsWith('/analytics')) return next();

  // Sniff blocked-verdicts as they are sent, without altering the response.
  let blocked = false;
  let categories: string[] | undefined;
  const origJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const b = body as { blocked?: unknown; verdict?: { categories?: unknown } } | null;
    if (b && b.blocked === true) {
      blocked = true;
      if (Array.isArray(b.verdict?.categories)) categories = b.verdict.categories as string[];
    }
    return origJson(body);
  }) as Response['json'];

  const startedAt = Date.now();
  const cls = classifyRequest(req.method, req.originalUrl);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const creative = body.imagePrompt ?? body.prompt ?? body.coverPrompt ?? body.text;
  const promptHash =
    typeof creative === 'string' && creative.trim()
      ? createHash('sha256').update(creative.trim()).digest('hex').slice(0, 10)
      : undefined;

  res.on('finish', () => {
    appendEvent({
      t: startedAt,
      user,
      universe: currentUniverse(req) ?? 'harborhouse',
      kind: 'api',
      activity: cls.activity,
      ...(cls.tool ? { tool: cls.tool } : {}),
      method: req.method,
      path: normalizePath(req.originalUrl.split('?')[0] ?? req.originalUrl),
      status: res.statusCode,
      ...(blocked ? { blocked: true } : {}),
      ...(categories ? { categories } : {}),
      ...(promptHash ? { promptHash } : {}),
      ...(cls.bookId ? { bookId: cls.bookId } : {}),
      ...(cls.pageIndex !== undefined ? { pageIndex: cls.pageIndex } : {}),
      ...(cls.auto ? { auto: true } : {}),
    });
  });
  next();
}
