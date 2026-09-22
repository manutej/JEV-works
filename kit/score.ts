/** Scoring primitives, pure (no I/O), so tests and kit/gate can import them without running the CLI. */
import type { Answer } from './ask.ts';
import type { Label, Question } from './spec.ts';

/** Is Jev's answer correct for this label? noul at 0.5, choice by key, score by nearest level. */
export function isCorrect(q: Question, a: Answer | undefined, label: Label): boolean {
  if (!a) return false;                                   // a non-answer counts as wrong (coverage is reported beside)
  if (q.type === 'noul' && a.type === 'noul') return (a.p >= 0.5) === label;
  if (q.type === 'choice' && a.type === 'choice') return a.choice === label;
  if (q.type === 'score' && a.type === 'score') return Math.round(a.score) === label;
  return false;
}

export function majorityOf(labels: readonly Label[]): Label | undefined {
  const counts = new Map<string, { v: Label; n: number }>();
  for (const v of labels) { const k = JSON.stringify(v); counts.set(k, { v, n: (counts.get(k)?.n ?? 0) + 1 }); }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.v;
}

