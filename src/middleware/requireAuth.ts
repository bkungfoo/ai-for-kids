import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { parseCookies } from '../auth/cookies.js';
import { getSession, setSessionExperimental } from '../auth/sessions.js';

function isAuthed(req: Request): boolean {
  const token = parseCookies(req)[config.auth.cookieName];
  return getSession(token) !== undefined;
}

/** The signed-in child-app username, or undefined when not signed in. */
export function currentUser(req: Request): string | undefined {
  const token = parseCookies(req)[config.auth.cookieName];
  return getSession(token)?.username;
}

// --- Experimental features (storybook background music) -------------------------
// Hidden for everyone by default: the buttons don't render and the API 404s, so
// ordinary accounts can't tell the feature exists. Only the PRIMARY account
// (HarborHouse) is offered an opt-in dialog at login; the choice lives on the
// session and resets at the next login.

/** True when this account may be OFFERED the experimental-features dialog. */
export function experimentalEligible(req: Request): boolean {
  return currentUser(req) === config.auth.accounts[0]?.username;
}

/** The session's experimental state, for the client bootstrap. */
export function experimentalState(req: Request): {
  eligible: boolean;
  enabled: boolean;
  prompted: boolean;
} {
  const token = parseCookies(req)[config.auth.cookieName];
  const session = getSession(token);
  return {
    eligible: experimentalEligible(req),
    enabled: session?.expFeatures ?? false,
    prompted: session?.expPrompted ?? false,
  };
}

/** Record the dialog answer. Only the eligible account can ever enable. */
export function setExperimental(req: Request, enabled: boolean): void {
  const token = parseCookies(req)[config.auth.cookieName];
  setSessionExperimental(token, enabled && experimentalEligible(req));
}

/** True when this session opted into experimental features. */
export function experimentalEnabled(req: Request): boolean {
  const token = parseCookies(req)[config.auth.cookieName];
  return getSession(token)?.expFeatures ?? false;
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
