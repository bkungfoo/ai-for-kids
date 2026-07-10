import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { parseCookies } from '../auth/cookies.js';
import { getSession } from '../auth/sessions.js';

function isAuthed(req: Request): boolean {
  const token = parseCookies(req)[config.auth.cookieName];
  return getSession(token) !== undefined;
}

/** The signed-in child-app username, or undefined when not signed in. */
export function currentUser(req: Request): string | undefined {
  const token = parseCookies(req)[config.auth.cookieName];
  return getSession(token)?.username;
}

/** True when the request carries a valid operator (review-area) session. */
export function isOperator(req: Request): boolean {
  if (!config.review.enabled) return false;
  const token = parseCookies(req)[config.review.cookieName];
  return getSession(token)?.role === 'operator';
}

/**
 * Gate the operator review JSON API. 404 when the review area is disabled (so
 * its existence isn't revealed), 401 when enabled but not unlocked.
 */
export function requireOperatorApi(req: Request, res: Response, next: NextFunction): void {
  if (!config.review.enabled) {
    res.status(404).json({ ok: false, error: 'Not found' });
    return;
  }
  if (isOperator(req)) return next();
  res.status(401).json({ ok: false, error: 'Operator authentication required' });
}

/** For JSON API routes: respond 401 when not signed in. */
export function requireApiAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthed(req)) return next();
  res.status(401).json({ ok: false, error: 'Authentication required' });
}

/** For browser pages: redirect to the login page when not signed in. */
export function requirePageAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthed(req)) return next();
  res.redirect('/login');
}
