export type ModerationDirection = 'input' | 'output';

export type Severity = 'none' | 'low' | 'medium' | 'high';

/**
 * Risk categories the moderator can flag. Kept as a closed set so the model
 * returns predictable values (enforced via the structured-output schema).
 */
export const RISK_CATEGORIES = [
  'sexual',
  'violence',
  'self_harm',
  'harassment',
  'hate',
  'dangerous_acts',
  'weapons',
  'drugs',
  'pii', // a child sharing or being asked for personal info
  'profanity',
  'illegal',
  'age_inappropriate',
  'jailbreak', // attempts to bypass safety / extract system instructions
  'other',
] as const;

export type RiskCategory = (typeof RISK_CATEGORIES)[number];

/** The structured judgment returned for a single piece of text. */
export interface Verdict {
  /** True when the content is safe for a child to send or receive. */
  allowed: boolean;
  severity: Severity;
  categories: RiskCategory[];
  /** Internal explanation (for logs/audit) — never shown to the child. */
  reason: string;
  /** Gentle, age-appropriate message shown to the child when blocked. */
  childMessage: string;
}

export const SAFE_VERDICT: Verdict = {
  allowed: true,
  severity: 'none',
  categories: [],
  reason: 'No moderatable content.',
  childMessage: '',
};

export function blockedVerdict(reason: string, childMessage: string): Verdict {
  return {
    allowed: false,
    severity: 'high',
    categories: ['other'],
    reason,
    childMessage,
  };
}
