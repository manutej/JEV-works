/**
 * CLAIM GATE (op-consist, step 3): the collapsed headline must agree with the composed strata.
 *
 * The headline is the "collapsed" answer: one paired test over the whole holdout. The strata are
 * the "composed" answer: the same test on seen vs novel messages and on each category. If they
 * disagree where the claim lives, or any edge of EVAL-TREE.md fails, the headline is REFUSED and the
 * failing edge is named. Consistency is not correctness (a gate pass raises confidence, never
 * certifies); REFUSE blocks quoting the headline, not a human, who may override with a logged reason.
 *
 * Pure: no I/O. leads/evaluate.ts and kit/score.ts feed it and write consist-report JSON.
 */

export type Direction = 'jev_better' | 'regex_better' | 'no_difference';
export type Edge = 'E1-text-disjoint' | 'E2-coverage' | 'E3-policy-predeclared' | 'E4-paired-test' | 'E5-strata-consistent';

/** A paired comparison: b = leads only Jev got right, c = leads only the regex got right. */
export type Paired = { name: string; n: number; b: number; c: number };

/** Gate settings. Defaults are the lab's rules (p < 0.05; I3: no verdict below 8; E1 limit 20%). */
export type GateConfig = { alpha: number; minStratum: number; seenShareLimit: number };
export const DEFAULT_GATE: GateConfig = { alpha: 0.05, minStratum: 8, seenShareLimit: 0.2 };

// The one exact McNemar implementation lives in kit/stats.ts; re-exported for existing callers.
import { mcnemarExact } from '../stats.ts';
export { mcnemarExact };

export function direction(p: Paired, alpha = DEFAULT_GATE.alpha): Direction {
  if (mcnemarExact(p.b, p.c) >= alpha) return 'no_difference';
  return p.b > p.c ? 'jev_better' : 'regex_better';
}

export type ClaimScope = 'all' | 'new_records' | 'novel_wording';

export type GateInput = {
  seed: string;
  role: 'dev' | 'holdout';
  claimScope?: ClaimScope; // undeclared -> E5 cannot be judged for scope
  leakageAccepted?: boolean; // declared before the run; narrows 'all' to 'new_records'
  seenShare: number;
  coverage: number;
  minCoverage?: number;
  policy: string;
  policyDeclaredBeforeSeed: boolean;
  headline: Paired;
  seen?: Paired;
  novel?: Paired;
  categories: Paired[];
};

export type GateReport = {
  seed: string;
  verdict: 'ACCEPT' | 'REFUSE' | 'NOT-A-HOLDOUT';
  claim: Direction;
  claimScope: ClaimScope | 'undeclared';
  policy: string;
  headline: Paired & { p: number };
  failingEdges: Array<{ edge: Edge; why: string }>;
  findings: string[];
  strata: Array<Paired & { p: number; direction: Direction | 'too_small' }>;
  settings: GateConfig;
  caveat: string;
};

export function gate(i: GateInput, settings: Partial<GateConfig> = {}): GateReport {
  const cfg: GateConfig = { ...DEFAULT_GATE, ...settings };
  const withP = (s: Paired) => ({ ...s, p: mcnemarExact(s.b, s.c) });
  const judged = (s: Paired) => ({ ...withP(s), direction: s.n < cfg.minStratum ? ('too_small' as const) : direction(s, cfg.alpha) });
  const claim = direction(i.headline, cfg.alpha);
  const strata = [i.seen, i.novel, ...i.categories].filter((s): s is Paired => !!s).map(judged);
  const failingEdges: GateReport['failingEdges'] = [];
  const findings: string[] = [];
  let scope: ClaimScope | 'undeclared' = i.claimScope ?? 'undeclared';

  const base = {
    seed: i.seed, claim, policy: i.policy, headline: withP(i.headline), strata, settings: cfg,
    caveat: 'Consistency is not correctness: ACCEPT raises confidence in the headline, it does not certify it.',
  };
  if (i.role !== 'holdout') {
    return { ...base, verdict: 'NOT-A-HOLDOUT', claimScope: scope, failingEdges, findings: ['dev seed: nothing here is holdout evidence'] };
  }

  // E1: text-level disjointness from the fit seeds.
  if (i.seenShare > cfg.seenShareLimit) {
    if (i.leakageAccepted && scope === 'all') {
      scope = 'new_records';
      findings.push(`E1: ${(i.seenShare * 100).toFixed(1)}% of messages seen in fit seeds; leakage accepted before the run, so the claim is narrowed to new records.`);
    } else if (!i.leakageAccepted) {
      failingEdges.push({ edge: 'E1-text-disjoint', why: `${(i.seenShare * 100).toFixed(1)}% of messages were seen in fit seeds (limit ${cfg.seenShareLimit * 100}%) and leakage was not accepted before the run` });
    }
  }
  // E2: declared coverage minimum.
  if (i.minCoverage === undefined) failingEdges.push({ edge: 'E2-coverage', why: 'no minimum coverage was declared' });
  else if (i.coverage < i.minCoverage) failingEdges.push({ edge: 'E2-coverage', why: `coverage ${(i.coverage * 100).toFixed(1)}% is below the declared ${(i.minCoverage * 100).toFixed(0)}%` });
  // E3: scoring rule fixed before the seed existed.
  if (!i.policyDeclaredBeforeSeed) failingEdges.push({ edge: 'E3-policy-predeclared', why: `policy ${i.policy} was chosen after this seed's results were seen` });
  // E4 is structural: the headline is a paired exact test by construction. A pooled number with no
  // discordant leads is not a test.
  if (i.headline.b + i.headline.c === 0) findings.push('E4: no discordant leads; the two systems agree on every lead');

  // E5: composed strata vs collapsed headline.
  if (scope === 'undeclared') failingEdges.push({ edge: 'E5-strata-consistent', why: 'no claim scope was declared, so no stratum can be said to carry the claim' });
  for (const s of strata) {
    if (s.direction === 'too_small' || s.direction === 'no_difference') continue;
    if (claim !== 'no_difference' && s.direction !== claim) {
      failingEdges.push({ edge: 'E5-strata-consistent', why: `stratum ${s.name} (n=${s.n}) says ${s.direction}, the headline says ${claim}` });
    } else if (claim === 'no_difference') {
      findings.push(`E5: headline shows no difference but stratum ${s.name} (n=${s.n}) shows ${s.direction} (p=${s.p.toPrecision(3)}); the pooled null hides it`);
    }
  }
  if (scope === 'novel_wording') {
    const nv = strata.find(s => s.name === 'novel');
    if (!nv || nv.direction === 'too_small') failingEdges.push({ edge: 'E5-strata-consistent', why: `the claim is about new wording but the novel stratum has n=${nv?.n ?? 0} (< ${cfg.minStratum})` });
    else if (nv.direction !== claim) failingEdges.push({ edge: 'E5-strata-consistent', why: `the claim is about new wording; the novel stratum says ${nv.direction}, the headline says ${claim}` });
  }
  if (claim !== 'no_difference') {
    const carrying = strata.filter(s => s.direction === claim).map(s => s.name);
    findings.push(`the headline's ${claim} is significant within: ${carrying.length ? carrying.join(', ') : 'no single stratum (pooled only)'}`);
  }

  return { ...base, verdict: failingEdges.length ? 'REFUSE' : 'ACCEPT', claimScope: scope, failingEdges, findings };
}
