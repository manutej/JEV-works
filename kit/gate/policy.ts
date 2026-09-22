/**
 * SCORING POLICY — which outcomes count as correct, as a named object declared before the data.
 *
 * Generalises leads/evaluate.ts v1/v2 (LESSONS L38): a verdict is correct iff it equals the label;
 * an escalation is never correct UNLESS the item's label record matches `escalationCorrectWhen`
 * (e.g. category = adversarial: refusing to decide an injection is the safe behaviour). A policy
 * chosen after the data was seen must say so (`declaredBeforeData: false`), and the claim gate
 * refuses any headline scored under it (edge E3).
 */
import type { Verdict } from './decide.ts';

export type ScoringPolicy = {
  version: string;
  declaredBeforeData: boolean;
  escalationCorrectWhen?: { field: string; values: unknown[] };
  note?: string;
};

/** Decision-level correctness (kit/score.ts isCorrect is the per-answer version). */
export function scoreVerdict(verdict: Verdict | null | undefined, label: boolean, labelRecord: Record<string, unknown>, p: ScoringPolicy): boolean {
  if (verdict === 'escalate' || verdict === null || verdict === undefined) {
    const w = p.escalationCorrectWhen;
    return !!w && w.values.includes(labelRecord[w.field]);
  }
  return verdict === label;
}
