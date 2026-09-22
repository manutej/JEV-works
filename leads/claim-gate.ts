/**
 * CLAIM GATE (op-consist, step 3): the collapsed headline must agree with the composed strata.
 *
 * The headline is the "collapsed" answer: one paired test over the whole holdout. The strata are
 * the "composed" answer: the same test on seen vs novel messages and on each category. If they
 * disagree where the claim lives, or any edge of EVAL-TREE.md fails, the headline is REFUSED and the
 * failing edge is named. Consistency is not correctness (a gate pass raises confidence, never
 * certifies); REFUSE blocks quoting the headline, not a human, who may override with a logged reason.
 *
 * Pure: no I/O. evaluate.ts feeds it and writes results/consist-report-<seed>.json.
 */

export type Direction = 'jev_better' | 'regex_better' | 'no_difference';
export type Edge = 'E1-text-disjoint' | 'E2-coverage' | 'E3-policy-predeclared' | 'E4-paired-test' | 'E5-strata-consistent';

/** A paired comparison: b = leads only Jev got right, c = leads only the regex got right. */
export type Paired = { name: string; n: number; b: number; c: number };

export const ALPHA = 0.05;
export const MIN_STRATUM = 8; // I3

/** Exact two-sided McNemar p on the discordant leads. */
export function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const logFact = (k: number) => {
    let s = 0;
    for (let i = 2; i <= k; i++) s += Math.log(i);
    return s;
  };
  let tail = 0;
  for (let k = 0; k <= Math.min(b, c); k++) tail += Math.exp(logFact(n) - logFact(k) - logFact(n - k) - n * Math.LN2);
  return Math.min(1, 2 * tail);
}

export function direction(p: Paired, alpha = ALPHA): Direction {
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
  seenShareLimit: number;
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
  caveat: string;
};

export function gate(i: GateInput): GateReport {
  const withP = (s: Paired) => ({ ...s, p: mcnemarExact(s.b, s.c) });
  const judged = (s: Paired) => ({ ...withP(s), direction: s.n < MIN_STRATUM ? ('too_small' as const) : direction(s) });
  const claim = direction(i.headline);
  const strata = [i.seen, i.novel, ...i.categories].filter((s): s is Paired => !!s).map(judged);
  const failingEdges: GateReport['failingEdges'] = [];
  const findings: string[] = [];
  let scope: ClaimScope | 'undeclared' = i.claimScope ?? 'undeclared';

  const base = {
    seed: i.seed, claim, policy: i.policy, headline: withP(i.headline), strata,
    caveat: 'Consistency is not correctness: ACCEPT raises confidence in the headline, it does not certify it.',
  };
  if (i.role !== 'holdout') {
    return { ...base, verdict: 'NOT-A-HOLDOUT', claimScope: scope, failingEdges, findings: ['dev seed: nothing here is holdout evidence'] };
  }

  // E1: text-level disjointness from the fit seeds.
  if (i.seenShare > i.seenShareLimit) {
    if (i.leakageAccepted && scope === 'all') {
      scope = 'new_records';
      findings.push(`E1: ${(i.seenShare * 100).toFixed(1)}% of messages seen in fit seeds; leakage accepted before the run, so the claim is narrowed to new records.`);
    } else if (!i.leakageAccepted) {
      failingEdges.push({ edge: 'E1-text-disjoint', why: `${(i.seenShare * 100).toFixed(1)}% of messages were seen in fit seeds (limit ${i.seenShareLimit * 100}%) and leakage was not accepted before the run` });
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
    if (!nv || nv.direction === 'too_small') failingEdges.push({ edge: 'E5-strata-consistent', why: `the claim is about new wording but the novel stratum has n=${nv?.n ?? 0} (< ${MIN_STRATUM})` });
    else if (nv.direction !== claim) failingEdges.push({ edge: 'E5-strata-consistent', why: `the claim is about new wording; the novel stratum says ${nv.direction}, the headline says ${claim}` });
  }
  if (claim !== 'no_difference') {
    const carrying = strata.filter(s => s.direction === claim).map(s => s.name);
    findings.push(`the headline's ${claim} is significant within: ${carrying.length ? carrying.join(', ') : 'no single stratum (pooled only)'}`);
  }

  return { ...base, verdict: failingEdges.length ? 'REFUSE' : 'ACCEPT', claimScope: scope, failingEdges, findings };
}
