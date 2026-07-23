import { randomUUID } from 'node:crypto';

/**
 * Kid-simple bot filter for the registration form: the server mints a tiny
 * puzzle (small addition, or counting a specific emoji in a row of decoys),
 * remembers the answer for a few minutes, and each puzzle is single-use.
 * Trivial for a person of any age; enough to stop dumb form-spam bots —
 * paired with per-IP rate limiting in the route.
 */

interface Challenge {
  answer: number;
  expiresAt: number;
}

const challenges = new Map<string, Challenge>();
const TTL_MS = 10 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [id, c] of challenges) {
    if (c.expiresAt <= now) challenges.delete(id);
  }
}

const COUNT_EMOJI = ['🐟', '⭐', '🎈', '🍎', '🐢'] as const;
const DECOY_EMOJI = ['🐠', '🌙', '🎁', '🍋', '🐸', '🌼'] as const;

function rand(n: number): number {
  return Math.floor(Math.random() * n);
}

/** Mint a puzzle. Returns its id and the question to render (plain text). */
export function newChallenge(): { id: string; question: string } {
  prune();
  const id = randomUUID();
  let question: string;
  let answer: number;
  if (Math.random() < 0.5) {
    const a = 2 + rand(7);
    const b = 1 + rand(7);
    answer = a + b;
    question = `Quick puzzle: what is ${a} + ${b}?`;
  } else {
    const target = COUNT_EMOJI[rand(COUNT_EMOJI.length)]!;
    answer = 3 + rand(4); // 3..6 targets
    const row: string[] = Array.from({ length: answer }, () => target);
    const decoy = DECOY_EMOJI[rand(DECOY_EMOJI.length)]!;
    for (let i = 0, extras = 2 + rand(3); i < extras; i++) row.push(decoy);
    for (let i = row.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [row[i], row[j]] = [row[j]!, row[i]!];
    }
    question = `Quick puzzle: how many ${target} do you see?  ${row.join(' ')}`;
  }
  challenges.set(id, { answer, expiresAt: Date.now() + TTL_MS });
  return { id, question };
}

/** Check an answer. Single-use: right or wrong, the puzzle is consumed. */
export function verifyChallenge(id: unknown, answer: unknown): boolean {
  prune();
  if (typeof id !== 'string') return false;
  const c = challenges.get(id);
  if (!c) return false;
  challenges.delete(id);
  const n = Number.parseInt(String(answer ?? ''), 10);
  return Number.isInteger(n) && n === c.answer;
}
