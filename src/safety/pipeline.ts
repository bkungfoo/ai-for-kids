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
