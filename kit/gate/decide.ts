/**
 * DECIDE — turn one item's answers into a verdict, from JSON rules instead of code.
 *
 * Rules read answers the way this lab learned to (NETER P4–P6): a noul acts only at its confident
 * ends (`is: yes|no|unsure`), a choice by its selected option, a score by level, and any choice or
 * noul by the entropy of its distribution. The first rule whose condition holds wins; otherwise the
 * default. Pure: no I/O, no model calls.
 *
 *   { "positive": "lead is garbage",
 *     "thresholds": { "yes": 0.85, "no": 0.15 },
 *     "rules": [ { "when": { "q": "isEmptyOrMarkup", "is": "yes" }, "then": true }, ... ],
 *     "default": "escalate" }
 */

/** The AI SDK's evaluate() answer shapes (noul arrives as boolean with P(true)). */
export type Answer =
  | { type: 'boolean'; probability: number }
  | { type: 'choice'; choice: string; probabilities?: Record<string, number> }
  | { type: 'score'; score: number; probabilities?: Record<string, number> };

export type Verdict = true | false | 'escalate';

export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { q: string; is: 'yes' | 'no' | 'unsure' }
  | { q: string; choice: string }
  | { q: string; choiceIn: string[] }
  | { q: string; scoreAtLeast: number }
  | { q: string; entropyAbove: number };

export type Decision = {
  positive: string;
  thresholds?: { yes: number; no: number };
  rules: Array<{ when: Cond; then: Verdict }>;
  default: Verdict;
};

/** NETER P4: ends 0.70 apart, far outside the per-answer jitter band. */
export const DEFAULT_THRESHOLDS = { yes: 0.85, no: 0.15 };

/** Normalised entropy in [0, 1] of a distribution (P6: the usable uncertainty signal). */
export function normalizedEntropy(dist: Record<string, number>): number {
  const ps = Object.values(dist).filter(p => p > 0);
  const k = Object.keys(dist).length;
  if (k < 2) return 0;
  return -ps.reduce((h, p) => h + p * Math.log(p), 0) / Math.log(k) || 0; // || 0 turns -0 into 0
}

function distributionOf(a: Answer): Record<string, number> | undefined {
  if (a.type === 'boolean') return { true: a.probability, false: 1 - a.probability };
  return a.probabilities;
}

/**
 * Evaluate one condition. A missing answer makes its leaf UNKNOWN (neither true nor false), which
 * propagates, so a rule never fires on an answer that was not given (the NaN-reads-as-pass bug).
 */
export function holds(c: Cond, answers: Record<string, Answer>, t = DEFAULT_THRESHOLDS): boolean | undefined {
  if ('all' in c) {
    const vs = c.all.map(x => holds(x, answers, t));
    return vs.includes(false) ? false : vs.includes(undefined) ? undefined : true;
  }
  if ('any' in c) {
    const vs = c.any.map(x => holds(x, answers, t));
    return vs.includes(true) ? true : vs.includes(undefined) ? undefined : false;
  }
  if ('not' in c) {
    const v = holds(c.not, answers, t);
    return v === undefined ? undefined : !v;
  }
  const a = answers[c.q];
  if (!a) return undefined;
  if ('is' in c) {
    if (a.type !== 'boolean') return undefined;
    const end = a.probability >= t.yes ? 'yes' : a.probability <= t.no ? 'no' : 'unsure';
    return end === c.is;
  }
  if ('choice' in c) return a.type === 'choice' ? a.choice === c.choice : undefined;
  if ('choiceIn' in c) return a.type === 'choice' ? c.choiceIn.includes(a.choice) : undefined;
  if ('scoreAtLeast' in c) return a.type === 'score' ? a.score >= c.scoreAtLeast : undefined;
  if ('entropyAbove' in c) {
    const d = distributionOf(a);
    return d ? normalizedEntropy(d) > c.entropyAbove : undefined;
  }
  return undefined;
}

/** First rule that definitely holds wins; a rule whose condition is unknown is skipped. */
export function decide(answers: Record<string, Answer>, d: Decision): { verdict: Verdict; rule: number | 'default' } {
  const t = d.thresholds ?? DEFAULT_THRESHOLDS;
  for (let i = 0; i < d.rules.length; i++) {
    if (holds(d.rules[i].when, answers, t) === true) return { verdict: d.rules[i].then, rule: i };
  }
  return { verdict: d.default, rule: 'default' };
}
