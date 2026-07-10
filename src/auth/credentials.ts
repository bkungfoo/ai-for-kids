import { createHash, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * A fixed set of accounts from config (env-overridable), defaulting to the
 * provisioned HarborHouse credentials plus any AUTH_ADDITIONAL_USERS. There is
 * intentionally no registration path — these are the only valid users.
 */

/** Constant-time string compare via fixed-length SHA-256 digests. */
function safeEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}

/**
 * Return the matched account's username, or null if the credentials are wrong.
 * Every account is checked with no short-circuit, so timing doesn't reveal
 * which username exists or which field was wrong.
 */
export function authenticate(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  let matched: string | null = null;
  for (const acct of config.auth.accounts) {
    const userOk = safeEqual(username, acct.username);
    const passOk = safeEqual(password, acct.password);
    if (userOk && passOk) matched = acct.username;
  }
  return matched;
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
