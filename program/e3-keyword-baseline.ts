/**
 * E3's keyword baseline — FITTED on the 80 fit items (PROGRAM.md E3: "a keyword baseline built on the
 * same 80"). Unlike E1's baseline, these rules were written by reading the fit set with its labels, so
 * the fit-set accuracy is in-sample and flattering by construction; only the holdout number is honest.
 * That asymmetry is the point: the model and the regex get the same 80 to learn from.
 *
 * Frozen with the rest of E3 before the holdout run and not retuned afterwards.
 *
 * First match wins. Order encodes which device dominates when several co-occur, the same convention
 * as keyword-baseline.ts.
 */

type Rule = { formula: string; test: (t: string) => boolean };

const RULES: Rule[] = [
  {
    // A-pile: a short lowercase subject-line fragment with no selling punctuation.
    formula: 'halbert-a-pile',
    test: t => /^[a-z]/.test(t) && t.length <= 32 && !/[—,?!]/.test(t),
  },
  {
    formula: 'call-out',
    test: t =>
      /^for\s+[a-z\s-]+:/i.test(t) ||
      /\[name\]/i.test(t) ||
      /\beveryone else\b/i.test(t) ||
      /^they\b.*\byou\b/i.test(t) ||
      /\bnot in this house\b/i.test(t),
  },
  {
    formula: 'receipt',
    test: t => /\b(receipts?|citations?|proof|fortune 500|charges \$)/i.test(t),
  },
  {
    formula: 'damaging-admission',
    test: t =>
      /\b(we tried|wasn'?t enough|flops|you walk|before you'?re committed|after they'?d already paid|in the mix)\b/i.test(t),
  },
  {
    formula: 'how-to-without',
    test: t => /\bhow to\b/i.test(t) || /\bwithout\b/i.test(t) || /^stop\b/i.test(t) || /\bdon'?t need\b/i.test(t),
  },
  {
    formula: 'mistakes',
    test: t => /\b(mistakes?|wrong|habits|already gone|missed|embarrass)/i.test(t),
  },
  {
    formula: 'number-outcome-time',
    test: t =>
      /→/.test(t) ||
      /\$\s?\d/.test(t) ||
      /\d+\s*(hr|hours?|min|minutes?|sec|seconds?|weeks?|days?|seats?)\b/i.test(t) ||
      /\b(six|five|ten|twelve)\s+(weeks?|minutes?|hours?|days?)\b/i.test(t) ||
      /\b(last call|closes|seats left)\b/i.test(t),
  },
  {
    formula: 'adjective-good',
    test: t => /^(a|an|the)\s+(free|lazy|simple|easy|quick|best|buyer who)\b/i.test(t) || /^furnished\b/i.test(t),
  },
];

/** Majority class of the 80 fit items (21/80) — the fallback. */
export const E3_MAJORITY_CLASS = 'deprivation-moment';

export function e3KeywordClassify(text: string): string {
  for (const rule of RULES) {
    if (rule.test(text)) return rule.formula;
  }
  return E3_MAJORITY_CLASS;
}
