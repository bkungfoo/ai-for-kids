import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/**
 * File-backed store for self-registered accounts (data/users.json), alongside
 * the fixed env-provisioned accounts. Passwords are scrypt-hashed with a
 * per-user salt — never stored in the clear. Synchronous IO is fine here:
 * registrations are rare and the file is tiny.
 */

/** 'harborhouse' = the original family universe (env accounts + legacy
 * registrations); 'public' = token-invited outside users, fully isolated. */
export type Universe = 'harborhouse' | 'public';

interface StoredUser {
  username: string;
  /** hex(scrypt(password, salt)) */
  passwordHash: string;
  salt: string;
  /** Absent on legacy records — they are harborhouse. */
  universe?: Universe;
  createdAt: string;
}

const FILE = path.resolve('data', 'users.json');
const MAX_REGISTERED = 200; // sanity cap for a family deployment
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

let cache: StoredUser[] | null = null;

function load(): StoredUser[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(FILE, 'utf8')) as StoredUser[];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(users: StoredUser[]): void {
  mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
  renameSync(tmp, FILE);
  cache = users;
}

function hash(password: string, salt: string): Buffer {
  return scryptSync(password, salt, 32);
}

/** Case-insensitive: registered names must not shadow env accounts or each other. */
export function usernameTaken(username: string): boolean {
  const lower = username.toLowerCase();
  if (config.auth.accounts.some((a) => a.username.toLowerCase() === lower)) return true;
  return load().some((u) => u.username.toLowerCase() === lower);
}

/**
 * Create an account. Returns null on success or a machine-readable error id
 * ('invalid' | 'weak' | 'taken' | 'full') the login page maps to friendly text.
 */
export function registerUser(
  username: string,
  password: string,
  universe: Universe = 'harborhouse',
): string | null {
  if (!USERNAME_RE.test(username)) return 'invalid';
  if (password.length < 8 || password.length > 100) return 'weak';
  if (usernameTaken(username)) return 'taken';
  const users = load();
  if (users.length >= MAX_REGISTERED) return 'full';
  const salt = randomBytes(16).toString('hex');
  users.push({
    username,
    passwordHash: hash(password, salt).toString('hex'),
    salt,
    universe,
    createdAt: new Date().toISOString(),
  });
  persist(users);
  return null;
}

/** Verify a registered account. Returns the canonical username or null. */
export function verifyRegisteredUser(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  let matched: string | null = null;
  for (const u of load()) {
    // No short-circuit: hash every candidate so timing stays flat.
    const ok =
      u.username.toLowerCase() === username.toLowerCase() &&
      timingSafeEqual(hash(password, u.salt), Buffer.from(u.passwordHash, 'hex'));
    if (ok) matched = u.username;
  }
  return matched;
}

/** Case-insensitive lookup across env + registered accounts. Returns the
 * canonical username (for storage) or null when no such account exists. */
export function canonicalAccount(username: unknown): string | null {
  if (typeof username !== 'string' || !username.trim()) return null;
  const lower = username.trim().toLowerCase();
  const env = config.auth.accounts.find((a) => a.username.toLowerCase() === lower);
  if (env) return env.username;
  const reg = load().find((u) => u.username.toLowerCase() === lower);
  return reg ? reg.username : null;
}

/** Which universe an account lives in. Env accounts and legacy registrations
 * are harborhouse; unknown usernames return undefined. */
export function accountUniverse(username: unknown): Universe | undefined {
  if (typeof username !== 'string') return undefined;
  const lower = username.toLowerCase();
  if (config.auth.accounts.some((a) => a.username.toLowerCase() === lower)) return 'harborhouse';
  const reg = load().find((u) => u.username.toLowerCase() === lower);
  return reg ? (reg.universe ?? 'harborhouse') : undefined;
}
