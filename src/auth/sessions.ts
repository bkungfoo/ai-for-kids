import { randomBytes } from 'node:crypto';
import { config } from '../config.js';

/**
 * Minimal in-memory session store. A successful login mints a random token kept
 * in this map with an expiry; the token is handed to the client as an httpOnly
 * cookie. Sessions are lost on restart, which is fine for this lightweight
 * single-account gateway.
 */
/** 'user' = the child-facing app; 'operator' = the adult review area. */
export type SessionRole = 'user' | 'operator';

interface SessionRecord {
  username: string;
  role: SessionRole;
  expiresAt: number;
  /**
   * Experimental features (storybook background music) switched on for THIS
   * login session. Off by default for everyone; only the primary account is
   * ever offered the opt-in dialog. Resets on every new login.
   */
  expFeatures: boolean;
  /** The opt-in dialog has been answered this session (don't re-show it). */
  expPrompted: boolean;
  /** Moderation strictness for THIS session (primary account only; resets on
   * login). Undefined/strict for everyone else. */
  safetyLevel: string;
}

const sessions = new Map<string, SessionRecord>();

export function createSession(
  username: string,
  role: SessionRole = 'user',
  ttlMs: number = config.auth.sessionTtlMs,
): string {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, {
    username,
    role,
    expiresAt: Date.now() + ttlMs,
    expFeatures: false,
    expPrompted: false,
    safetyLevel: 'BLOCK_LOW_AND_ABOVE',
  });
  return token;
}

/** Record the experimental-features + safety-level choices for this session. */
export function setSessionExperimental(
  token: string | undefined,
  enabled: boolean,
  safetyLevel?: string,
): void {
  const record = getSession(token);
  if (!record) return;
  record.expFeatures = enabled;
  record.expPrompted = true;
  if (safetyLevel) record.safetyLevel = safetyLevel;
}

export function getSession(token: string | undefined): SessionRecord | undefined {
  if (!token) return undefined;
  const record = sessions.get(token);
  if (!record) return undefined;
  if (record.expiresAt <= Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return record;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

// Periodically evict expired sessions so the map doesn't grow unbounded.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [token, record] of sessions) {
    if (record.expiresAt <= now) sessions.delete(token);
  }
}, 10 * 60 * 1000);
cleanup.unref();
