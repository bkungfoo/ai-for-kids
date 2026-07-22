import { moderate } from './moderator.js';
import { SAFE_VERDICT, type ModerationDirection, type Severity, type Verdict } from './types.js';

const SEVERITY_RANK: Record<Severity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Moderate a batch of text fields in one direction. All fields are checked
 * concurrently. The combined verdict is blocked if ANY field is blocked, and
 * carries the union of categories and the highest severity seen.
 */
export async function guardText(
  texts: Array<string | undefined | null>,
  direction: ModerationDirection,
): Promise<Verdict> {
  const candidates = texts.filter((t): t is string => Boolean(t && t.trim()));
  if (candidates.length === 0) return SAFE_VERDICT;

  const verdicts = await Promise.all(candidates.map((t) => moderate(t, direction)));
  return combine(verdicts);
}

function combine(verdicts: Verdict[]): Verdict {
  const blocked = verdicts.filter((v) => !v.allowed);
  const categories = [...new Set(verdicts.flatMap((v) => v.categories))];
  const severity = verdicts.reduce<Severity>(
    (max, v) => (SEVERITY_RANK[v.severity] > SEVERITY_RANK[max] ? v.severity : max),
    'none',
  );

  if (blocked.length === 0) {
    return { allowed: true, severity, categories, reason: 'All fields passed.', childMessage: '' };
  }

  return {
    allowed: false,
    severity,
    categories,
    reason: blocked.map((v) => v.reason).join('; '),
    childMessage: blocked[0]!.childMessage,
  };
}

// --- Operator-tunable safety level ---------------------------------------------
// The primary account's login dialog can relax how much of a blocked verdict
// actually blocks, mirroring Gemini's HarmBlockThreshold names. Everyone else
// (and every session by default) runs the strictest level. SafeSearch image
// screening is NOT affected — generated pictures are always screened.

export const SAFETY_LEVELS = [
  'BLOCK_LOW_AND_ABOVE',
  'BLOCK_MEDIUM_AND_ABOVE',
  'BLOCK_ONLY_HIGH',
  'BLOCK_NONE',
] as const;
export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

/**
 * True when this verdict may pass at the session's safety level. An allowed
 * verdict always passes; a blocked one passes only when its severity sits
 * below the level's blocking floor. Undefined level = strictest behavior
 * (any blocked verdict blocks), which is also the only behavior non-primary
 * accounts can ever get.
 */
export function permittedAtLevel(verdict: Verdict, level?: SafetyLevel): boolean {
  if (verdict.allowed) return true;
  const rank = SEVERITY_RANK[verdict.severity] ?? 3;
  switch (level) {
    case 'BLOCK_NONE':
      return true;
    case 'BLOCK_ONLY_HIGH':
      return rank < SEVERITY_RANK.high;
    case 'BLOCK_MEDIUM_AND_ABOVE':
      return rank < SEVERITY_RANK.medium;
    default:
      return false;
  }
}
