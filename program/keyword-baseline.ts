/**
 * Cheap regex baseline for E1 (PROGRAM.md ground rule 1: a cheap baseline runs
 * in every experiment). Written once, before any model result is seen, and not
 * retuned afterwards no matter how it scores — retuning a baseline to lose (or
 * win) on purpose would defeat the point of having one.
 *
 * Order matters: rules are checked top to bottom and the first match wins,
 * because several patterns can co-occur (a hook can both name a number and
 * confess a mistake) and priority has to be declared, not implicit.
 */

type Rule = { formula: string; test: (t: string) => boolean };

const has = (t: string, re: RegExp) => re.test(t);

const RULES: Rule[] = [
  {
    formula: 'how-to-without',
    test: t => /\bhow to\b/i.test(t) && /\bwithout\b/i.test(t),
  },
  {
    formula: 'receipt',
    test: t =>
      /"[^"]{6,}"/.test(t) || // a literal quoted line
      /\b(screenshot|receipt|proof|verified|exact(ly)?\s+\$?\d)/i.test(t),
  },
  {
    formula: 'mistakes',
    test: t => /\bmistakes?\b/i.test(t) || /\b(wrong|stop doing|you're doing .* wrong)\b/i.test(t),
  },
  {
    formula: 'damaging-admission',
    test: t =>
      /\bi (failed|screwed up|was wrong|lost|blew it|got fired|embarrassed)\b/i.test(t) ||
      /\b(confession|embarrassing admission)\b/i.test(t),
  },
  {
    formula: 'halbert-a-pile',
    test: t => /\b(pile|stack|mountain|ton|truckload|mound)s?\s+of\b/i.test(t),
  },
  {
    formula: 'call-out',
    test: t =>
      /\bif you'?re\s+(a|an|the)\b/i.test(t) ||
      /\bcalling all\b/i.test(t) ||
      /\battention\s+[a-z]/i.test(t) ||
      /\bfor\s+(founders|agencies|coaches|marketers|freelancers|solopreneurs|creators|owners)\b/i.test(t),
  },
  {
    formula: 'number-outcome-time',
    test: t =>
      /\$\s?\d/.test(t) &&
      /\b(day|days|hour|hours|week|weeks|month|months|minute|minutes|min|sec|seconds|year|years)\b/i.test(t),
  },
  {
    formula: 'adjective-good',
    test: t => {
      const adjectives = /\b(amazing|incredible|powerful|proven|ultimate|best|game-?changing|revolutionary|effortless|simple|easy)\b/gi;
      const hits = t.match(adjectives) ?? [];
      const hasNumber = /\d/.test(t);
      return hits.length >= 2 && !hasNumber;
    },
  },
];

/** Majority class in the 80-item corpus — the fallback and the other baseline. */
export const MAJORITY_CLASS = 'deprivation-moment';

export function keywordClassify(text: string): string {
  for (const rule of RULES) {
    if (rule.test(text)) return rule.formula;
  }
  return MAJORITY_CLASS;
}
