import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Invite tokens for the PUBLIC universe. The flow:
 *   1. A visitor requests a token (name, birthday, email) on the login page.
 *   2. The owner gets an email with an HMAC-signed approval link.
 *   3. Approving emails the token to the requester.
 *   4. The token (approved, single-use) unlocks "Create an account".
 * Requests live in data/invites.json; the HMAC secret is generated once and
 * kept in data/invite-secret so approval links survive restarts.
 */

export interface Invite {
  id: string;
  name: string;
  birthday: string;
  email: string;
  /** The code the requester will type into the create-account form. */
  token: string;
  approved: boolean;
  used: boolean;
  createdAt: string;
  approvedAt?: string;
}

const FILE = path.resolve('data', 'invites.json');
const SECRET_FILE = path.resolve('data', 'invite-secret');
const MAX_PENDING = 200;

let cache: Invite[] | null = null;

function load(): Invite[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(readFileSync(FILE, 'utf8')) as Invite[];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(invites: Invite[]): void {
  mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(invites, null, 2), 'utf8');
  renameSync(tmp, FILE);
  cache = invites;
}

function secret(): Buffer {
  if (!existsSync(SECRET_FILE)) {
    mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    writeFileSync(SECRET_FILE, randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return Buffer.from(readFileSync(SECRET_FILE, 'utf8').trim(), 'hex');
}

/** Readable, unambiguous token like "HH-7K3M-9QRD" (no 0/O/1/I). */
function mintToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = () => alphabet[randomBytes(1)[0]! % alphabet.length];
  const chunk = () => Array.from({ length: 4 }, pick).join('');
  return `HH-${chunk()}-${chunk()}`;
}

export function createInvite(name: string, birthday: string, email: string): Invite | null {
  const invites = load();
  if (invites.length >= MAX_PENDING) return null;
  const invite: Invite = {
    id: randomBytes(16).toString('hex'),
    name,
    birthday,
    email,
    token: mintToken(),
    approved: false,
    used: false,
    createdAt: new Date().toISOString(),
  };
  invites.push(invite);
  persist(invites);
  return invite;
}

/** The signature that makes an approval link owner-only. */
export function approvalSig(id: string): string {
  return createHmac('sha256', secret()).update(id).digest('hex');
}

export function getInvite(id: string): Invite | undefined {
  return load().find((i) => i.id === id);
}

/** Verify the signed link and mark the invite approved. */
export function approveInvite(id: unknown, sig: unknown): Invite | null {
  if (typeof id !== 'string' || typeof sig !== 'string') return null;
  const expected = approvalSig(id);
  const given = Buffer.from(sig, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const invites = load();
  const invite = invites.find((i) => i.id === id);
  if (!invite) return null;
  if (!invite.approved) {
    invite.approved = true;
    invite.approvedAt = new Date().toISOString();
    persist(invites);
  }
  return invite;
}

/** Redeem a token: approved and unused. Marks it used on success. */
export function consumeToken(token: unknown): Invite | null {
  if (typeof token !== 'string') return null;
  const normalized = token.trim().toUpperCase();
  const invites = load();
  const invite = invites.find((i) => i.token === normalized && i.approved && !i.used);
  if (!invite) return null;
  invite.used = true;
  persist(invites);
  return invite;
}

/** Check without consuming (so registration can fail on other fields first). */
export function tokenUsable(token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const normalized = token.trim().toUpperCase();
  return load().some((i) => i.token === normalized && i.approved && !i.used);
}
