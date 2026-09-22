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

/** `${systems.a}_better`, `${systems.b}_better`, or 'no_difference'. */
export type Direction = string;
/** A reason code registered in kit/standard-gate.ts REASON_CODES. */
export type ReasonCode = (typeof REASON_CODES)[number];
export type Edge = 'E1-text-disjoint' | 'E2-coverage' | 'E3-policy-predeclared' | 'E4-paired-test' | 'E5-strata-consistent';

/** A paired comparison: b = leads only Jev got right, c = leads only the regex got right. */
/** Per-stratum discordant counts: b = only system A right, c = only system B right (kit/stats.ts Paired is the full result). */
export type Discordant = { name: string; n: number; b: number; c: number };
/** @deprecated name kept for existing callers; it collided with kit/stats.ts Paired. */
export type Paired = Discordant;
/** The two systems being compared, named by the caller (leads: jev vs regex). */
export type Systems = { a: string; b: string };

/** Gate settings. Defaults are the lab's rules (p < 0.05; I3: no verdict below 8; E1 limit 20%). */
export type GateConfig = { alpha: number; minStratum: number; minDiscordant: number; seenShareLimit: number };
/** minDiscordant: McNemar's power comes from b + c, not n; below it a stratum can neither contradict nor confirm. */
export const DEFAULT_GATE: GateConfig = { alpha: 0.05, minStratum: 8, minDiscordant: 8, seenShareLimit: 0.2 };

// The one exact McNemar implementation lives in kit/stats.ts; re-exported for existing callers.
import { mcnemarExact } from '../stats.ts';
export { mcnemarExact };

export const NO_DIFFERENCE = 'no_difference';
export const DEFAULT_SYSTEMS: Systems = { a: 'jev', b: 'regex' };

export function direction(p: Discordant, alpha = DEFAULT_GATE.alpha, sys: Systems = DEFAULT_SYSTEMS): Direction {
  if (mcnemarExact(p.b, p.c) >= alpha) return NO_DIFFERENCE;
  return p.b > p.c ? `${sys.a}_better` : `${sys.b}_better`;
}

/** Holm step-down: which of these p-values are significant at family-wise alpha. */
export function holm(ps: readonly number[], alpha: number): boolean[] {
  const order = ps.map((p, i) => [p, i] as const).sort((x, y) => x[0] - y[0]);
  const sig = ps.map(() => false);
  for (let k = 0; k < order.length; k++) {
    if (order[k][0] > alpha / (order.length - k)) break;
    sig[order[k][1]] = true;
  }
  return sig;
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
  /** Names the two systems in directions and findings; default jev vs regex. */
  systems?: Systems;
};

export type GateReport = {
  seed: string;
  verdict: 'ACCEPT' | 'REFUSE' | 'NOT-A-HOLDOUT';
  claim: Direction;
  claimScope: ClaimScope | 'undeclared';
  policy: string;
  headline: Paired & { p: number };
  failingEdges: Array<{ edge: Edge; why: string; code?: ReasonCode }>;
  findings: string[];
  strata: Array<Paired & { p: number; direction: Direction | 'too_small' }>;
  settings: GateConfig;
  systems: Systems;
  caveat: string;
};

export function gate(i: GateInput, settings: Partial<GateConfig> = {}): GateReport {
  const cfg: GateConfig = { ...DEFAULT_GATE, ...settings };
  const sys = i.systems ?? DEFAULT_SYSTEMS;
  const withP = (s: Discordant) => ({ ...s, p: mcnemarExact(s.b, s.c) });
  const judged = (s: Discordant) => ({
    ...withP(s),
    direction: s.n < cfg.minStratum || s.b + s.c < cfg.minDiscordant ? ('too_small' as const) : direction(s, cfg.alpha, sys),
  });
  const claim = direction(i.headline, cfg.alpha, sys);
  const strata = [i.seen, i.novel, ...i.categories].filter((s): s is Discordant => !!s).map(judged);
  const failingEdges: GateReport['failingEdges'] = [];
  const findings: string[] = [];
  let scope: ClaimScope | 'undeclared' = i.claimScope ?? 'undeclared';
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  const base = {
    seed: i.seed, claim, policy: i.policy, headline: withP(i.headline), strata, settings: cfg, systems: sys,
    caveat: 'Consistency is not correctness: ACCEPT raises confidence in the headline, it does not certify it.',
  };
  if (i.role !== 'holdout') {
    return { ...base, verdict: 'NOT-A-HOLDOUT', claimScope: scope, failingEdges, findings: ['dev seed: nothing here is holdout evidence'] };
  }

  // E1, for EVERY scope: leakage either fails the run or, if accepted beforehand, narrows the claim.
  // A claim about new wording can never be rescued by accepting leakage: the wording was seen.
  if (i.seenShare > cfg.seenShareLimit) {
    if (!i.leakageAccepted) {
      failingEdges.push({ edge: 'E1-text-disjoint', code: 'G3.text-overlap', why: `${pct(i.seenShare)} of messages were seen in fit seeds (limit ${pct(cfg.seenShareLimit)}) and leakage was not accepted before the run` });
    } else if (scope === 'novel_wording') {
      failingEdges.push({ edge: 'E1-text-disjoint', code: 'G3.leakage-accepted', why: `the claim is about new wording but ${pct(i.seenShare)} of messages were seen; accepting leakage cannot make seen wording new` });
    } else {
      if (scope === 'all') scope = 'new_records';
      findings.push(`E1: ${pct(i.seenShare)} of messages seen in fit seeds; leakage accepted before the run, so the claim covers new records only (scope ${scope}).`);
    }
  }
  // E2: declared coverage minimum.
  if (i.minCoverage === undefined) failingEdges.push({ edge: 'E2-coverage', code: 'G4.undeclared', why: 'no minimum coverage was declared' });
  else if (i.coverage < i.minCoverage) failingEdges.push({ edge: 'E2-coverage', code: 'G4.below-minimum', why: `coverage ${pct(i.coverage)} is below the declared ${(i.minCoverage * 100).toFixed(0)}%` });
  // E3: scoring rule fixed before the seed existed.
  if (!i.policyDeclaredBeforeSeed) failingEdges.push({ edge: 'E3-policy-predeclared', code: 'G5.policy-after-seed', why: `policy ${i.policy} was chosen after this seed's results were seen` });
  // E4 is structural: the headline is a paired exact test by construction.
  if (i.headline.b + i.headline.c === 0) findings.push('E4: no discordant items; the two systems agree on every item');
  if (i.headline.n < cfg.minStratum) failingEdges.push({ edge: 'E4-paired-test', code: 'G6.no-paired-test', why: `headline n=${i.headline.n} is below ${cfg.minStratum} (I3): no verdict` });

  // E5: composed strata vs collapsed headline.
  if (scope === 'undeclared') failingEdges.push({ edge: 'E5-strata-consistent', code: 'G7.scope-undeclared', why: 'no claim scope was declared, so no stratum can be said to carry the claim' });
  // The categories must partition the headline, or an inconvenient stratum could simply be left out.
  const sum = (k: 'n' | 'b' | 'c') => i.categories.reduce((t, x) => t + x[k], 0);
  if (i.categories.length && (sum('n') !== i.headline.n || sum('b') !== i.headline.b || sum('c') !== i.headline.c))
    failingEdges.push({ edge: 'E5-strata-consistent', code: 'G7.partition', why: `categories do not partition the headline (n ${sum('n')}/${i.headline.n}, b ${sum('b')}/${i.headline.b}, c ${sum('c')}/${i.headline.c})` });
  // Only strata inside the claim's scope can contradict it: a claim narrowed away from seen text is not
  // refuted by the seen stratum. Categories span seen and novel items, so under novel_wording they are
  // reported, not tested; the novel stratum carries that claim.
  const inScope = strata.filter(s =>
    scope === 'novel_wording' ? s.name === 'novel' : scope === 'new_records' ? s.name !== 'seen' : true,
  );
  // One test per stratum at alpha inflates false refusals, so contradictions are Holm-corrected.
  const testable = inScope.filter(s => s.direction !== 'too_small');
  const sig = holm(testable.map(s => s.p), cfg.alpha);
  testable.forEach((s, k) => {
    if (!sig[k] || s.direction === NO_DIFFERENCE) return;
    if (claim !== NO_DIFFERENCE && s.direction !== claim) {
      failingEdges.push({ edge: 'E5-strata-consistent', code: 'G7.contradiction', why: `stratum ${s.name} (n=${s.n}, b+c=${s.b + s.c}) says ${s.direction}, the headline says ${claim} (Holm-corrected)` });
    } else if (claim === NO_DIFFERENCE) {
      findings.push(`E5: headline shows no difference but stratum ${s.name} (n=${s.n}) shows ${s.direction} (p=${s.p.toPrecision(3)}, Holm-significant); the pooled null hides it`);
    }
  });
  if (scope === 'novel_wording') {
    const nv = strata.find(s => s.name === 'novel');
    if (!nv || nv.direction === 'too_small') failingEdges.push({ edge: 'E5-strata-consistent', code: 'G7.novel-too-small', why: `the claim is about new wording but the novel stratum has n=${nv?.n ?? 0}, b+c=${nv ? nv.b + nv.c : 0} (need n >= ${cfg.minStratum}, b+c >= ${cfg.minDiscordant})` });
    else if (nv.direction !== claim) failingEdges.push({ edge: 'E5-strata-consistent', code: 'G7.contradiction', why: `the claim is about new wording; the novel stratum says ${nv.direction}, the headline says ${claim}` });
  }
  if (claim !== NO_DIFFERENCE) {
    const carrying = strata.filter(s => s.direction === claim).map(s => s.name);
    findings.push(`the headline's ${claim} is significant within: ${carrying.length ? carrying.join(', ') : 'no single stratum (pooled only)'}`);
  }

  return { ...base, verdict: failingEdges.length ? 'REFUSE' : 'ACCEPT', claimScope: scope, failingEdges, findings };
}

// ── Standard gate results (kit/standard-gate.ts): the one catalogue every experiment reports ──
import { CATALOGUE, REASON_CODES, suite, type G7Evidence, type GateId, type GateResult, type StratumRow, type SuiteReport } from '../standard-gate.ts';

const LEGACY: Record<string, GateId> = {
  'E1-text-disjoint': 'G3-text-disjoint',
  'E2-coverage': 'G4-coverage',
  'E3-policy-predeclared': 'G5-policy-predeclared',
  'E4-paired-test': 'G6-paired-test',
  'E5-strata-consistent': 'G7-strata-consistent',
};

/**
 * This gate's report as standard GateResults. G5–G7 are kit/gate's; G3/G4 are core gates, emitted here
 * only when `includeCore` (a run with no core suite, e.g. leads) so a suite never counts one check twice.
 * The old E-label stays in evidence.legacyEdge so earlier reports still read.
 */
export function toGateResults(rep: GateReport, opts: { includeCore?: boolean } = {}): GateResult[] {
  const ids: GateId[] = opts.includeCore
    ? ['G3-text-disjoint', 'G4-coverage', 'G5-policy-predeclared', 'G6-paired-test', 'G7-strata-consistent']
    : ['G5-policy-predeclared', 'G6-paired-test', 'G7-strata-consistent'];
  const legacyOf = (id: GateId) => Object.keys(LEGACY).find(k => LEGACY[k] === id)!;
  if (rep.verdict === 'NOT-A-HOLDOUT')
    return ids.map(id => ({ id, stage: CATALOGUE[id].stage, verdict: 'SKIP' as const, why: 'dev seed: not a holdout, nothing to claim', evidence: { legacyEdge: legacyOf(id) } }));
  return ids.map(id => {
    const legacyEdge = legacyOf(id);
    const fails = rep.failingEdges.filter(f => LEGACY[f.edge] === id);
    const notes = rep.findings.filter(f => f.startsWith(legacyEdge.split('-')[0] + ':'));
    const evidence: Record<string, unknown> = { legacyEdge, settings: rep.settings, ...(notes.length ? { findings: notes } : {}) };
    if (id === 'G6-paired-test') Object.assign(evidence, { headline: rep.headline, claim: rep.claim, test: 'exact McNemar' });
    if (id === 'G7-strata-consistent') {
      // Contract v1 G7Evidence: neutral a/b directions; the systems are named once, in `systems`.
      const neutral = (d: string) => (d === `${rep.systems.a}_better` ? 'a_better' : d === `${rep.systems.b}_better` ? 'b_better' : d);
      const row = (x: { name: string; n: number; b: number; c: number; p: number; direction?: string }): StratumRow =>
        ({ name: x.name, n: x.n, b: x.b, c: x.c, p: x.p, direction: neutral(x.direction ?? rep.claim) });
      const g7: G7Evidence = { systems: [rep.systems.a, rep.systems.b], correction: 'holm', headline: row(rep.headline), strata: rep.strata.map(row), legacyEdge };
      Object.assign(evidence, g7, { scope: rep.claimScope });
    }
    if (fails.length) return { id, stage: CATALOGUE[id].stage, verdict: 'REFUSE' as const, why: fails.map(f => f.why).join('; '), evidence, code: fails[0].code };
    // A finding (e.g. a pooled null hiding a significant stratum) passes the gate but must be read.
    const why = notes.length ? notes.join('; ') : `${CATALOGUE[id].checks}: passed`;
    return { id, stage: CATALOGUE[id].stage, verdict: notes.length ? ('WARN' as const) : ('PASS' as const), why, evidence };
  });
}

/** The standard suite for one claim-gate report: same verdict, contract-v1 shape, this gate's settings recorded. */
export function claimSuite(rep: GateReport, opts: { includeCore?: boolean; role?: 'holdout' | 'dev' } = {}): SuiteReport {
  return suite(toGateResults(rep, opts), { role: opts.role ?? (rep.verdict === 'NOT-A-HOLDOUT' ? 'dev' : 'holdout'), settings: rep.settings });
}
