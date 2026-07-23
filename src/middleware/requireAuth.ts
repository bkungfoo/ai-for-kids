import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { parseCookies } from '../auth/cookies.js';
import { getSession, setSessionExperimental } from '../auth/sessions.js';
import { SAFETY_LEVELS, type SafetyLevel } from '../safety/pipeline.js';
import { accountUniverse, type Universe } from '../auth/userStore.js';

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
  safetyLevel: string;
} {
  const token = parseCookies(req)[config.auth.cookieName];
  const session = getSession(token);
  return {
    eligible: experimentalEligible(req),
    enabled: session?.expFeatures ?? false,
    prompted: session?.expPrompted ?? false,
    safetyLevel: safetyLevelFor(req) ?? 'BLOCK_LOW_AND_ABOVE',
  };
}

/** Record the dialog answers. Only the eligible account can ever enable
 * experimental features or relax the safety level. */
export function setExperimental(req: Request, enabled: boolean, safetyLevel?: unknown): void {
  const token = parseCookies(req)[config.auth.cookieName];
  const eligible = experimentalEligible(req);
  const level =
    eligible && typeof safetyLevel === 'string' && (SAFETY_LEVELS as readonly string[]).includes(safetyLevel)
      ? safetyLevel
      : undefined;
  setSessionExperimental(token, enabled && eligible, level);
}

/** The session's moderation strictness — undefined means strictest. Only the
 * primary account's sessions can ever hold a relaxed level. */
export function safetyLevelFor(req: Request): SafetyLevel | undefined {
  if (!experimentalEligible(req)) return undefined;
  const token = parseCookies(req)[config.auth.cookieName];
  const level = getSession(token)?.safetyLevel;
  return (SAFETY_LEVELS as readonly string[]).includes(level ?? '') ? (level as SafetyLevel) : undefined;
}

/** True when this session opted into experimental features. */
export function experimentalEnabled(req: Request): boolean {
  const token = parseCookies(req)[config.auth.cookieName];
  return getSession(token)?.expFeatures ?? false;
}

/** The signed-in account's universe ('harborhouse' for env + legacy accounts,
 * 'public' for token-invited outsiders). Undefined when signed out. */
export function currentUniverse(req: Request): Universe | undefined {
  return accountUniverse(currentUser(req));
}

/** Gate for Harbor-House-only surfaces (music, voices, …): the public
 * universe gets a 404 so those features' existence isn't revealed. */
export function requireHarborUniverse(req: Request, res: Response, next: NextFunction): void {
  if (currentUniverse(req) === 'public') {
    res.status(404).json({ ok: false, error: 'Not found' });
    return;
  }
  next();
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
