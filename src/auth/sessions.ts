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
}

const sessions = new Map<string, SessionRecord>();

export function createSession(
  username: string,
  role: SessionRole = 'user',
  ttlMs: number = config.auth.sessionTtlMs,
): string {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { username, role, expiresAt: Date.now() + ttlMs });
  return token;
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
