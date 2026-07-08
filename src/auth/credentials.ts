import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Single hard-coded account. Username/password come from config (env-overridable)
 * and default to the provisioned HarborHouse credentials. There is intentionally
 * no registration path — this is the only valid user.
 */

/** Constant-time string compare via fixed-length SHA-256 digests. */
function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}

export function verifyCredentials(username: unknown, password: unknown): boolean {
  if (typeof username !== 'string' || typeof password !== 'string') return false;
  // Evaluate both comparisons (no short-circuit) to avoid leaking which field
  // was wrong via timing.
  const userOk = safeEqual(username, config.auth.username);
  const passOk = safeEqual(password, config.auth.password);
  return userOk && passOk;
}

/**
 * Verify the operator password for the adult-only review area. Returns false
 * when review is disabled (no password configured) so the gate can never be
 * unlocked in a child deployment.
 */
export function verifyReviewPassword(password: unknown): boolean {
  if (!config.review.enabled) return false;
  if (typeof password !== 'string') return false;
  return safeEqual(password, config.review.password);
}
