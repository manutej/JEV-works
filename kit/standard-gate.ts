/**
 * Standardized kit gates: ONE contract every gate returns, ONE catalogue of stable gate ids, ONE suite verdict.
 *
 * Every experiment, question module and demo passes the same named gates, so reports compare across contexts:
 * "G3 REFUSE" means the same thing in leads, E5 and a cookbook. Gates may live anywhere (core here; the claim-gate
 * edges G5–G7 in kit/gate/, owned by the leads session) as long as they return a GateResult with a catalogue id.
 *
 *   preflight (before any call)  G1 spec valid · G2 privacy · G3 text-disjoint
 *   run                          G4 coverage
 *   claim                        G5 policy predeclared · G6 paired test · G7 strata consistent   (kit/gate/claim.ts)
 *                                G8 threshold fitted and held · G9 calibration audited · G10 tree consistent
 *
 * Verdict rule: any REFUSE ⇒ the claim is REFUSED. WARN never refuses but is always printed. SKIP must say why.
 */
import { problems } from './spec.ts';
import { disjointness, privacyScan } from './checks.ts';
import type { Item, Spec } from './spec.ts';
import type { Gate, GateOutcome, CalibrationVerdict } from './threshold.ts';

export type GateId =
  | 'G1-spec-valid' | 'G2-privacy' | 'G3-text-disjoint' | 'G4-coverage'
  | 'G5-policy-predeclared' | 'G6-paired-test' | 'G7-strata-consistent'
  | 'G8-threshold-fitted-and-held' | 'G9-calibration-audited' | 'G10-tree-consistent';
export type Stage = 'preflight' | 'run' | 'claim';
export type GateVerdict = 'PASS' | 'REFUSE' | 'WARN' | 'SKIP';
export type GateResult = { id: GateId; stage: Stage; verdict: GateVerdict; why: string; evidence: Record<string, unknown> };

/** The catalogue: stable ids, what each checks, where it is implemented, and the lesson it encodes. */
export const CATALOGUE: Record<GateId, { stage: Stage; checks: string; owner: 'core' | 'kit/gate'; source: string }> = {
  'G1-spec-valid': { stage: 'preflight', checks: 'spec matches the TypeSafe-docs schema; labels fit their question types', owner: 'core', source: 'kit/spec.ts' },
  'G2-privacy': { stage: 'preflight', checks: 'no emails, phones, keys or tokens in states bound for the external API', owner: 'core', source: 'kit/checks.ts' },
  'G3-text-disjoint': { stage: 'preflight', checks: 'test items overlap fit items neither by id nor by normalised text', owner: 'core', source: 'L31, L40' },
  'G4-coverage': { stage: 'run', checks: 'share of items with an answer ≥ the minimum declared before the run', owner: 'core', source: 'retro §9.2' },
  'G5-policy-predeclared': { stage: 'claim', checks: 'the scoring policy was fixed before the holdout existed', owner: 'kit/gate', source: 'L38' },
  'G6-paired-test': { stage: 'claim', checks: 'the headline is an exact paired test (McNemar) with n ≥ 8', owner: 'kit/gate', source: 'I6, I3' },
  'G7-strata-consistent': { stage: 'claim', checks: 'every stratum large enough to judge agrees with the pooled headline', owner: 'kit/gate', source: 'L41' },
  'G8-threshold-fitted-and-held': { stage: 'claim', checks: 'every threshold was fitted on the fit split and its promised error bound held on the test split', owner: 'core', source: 'kit/threshold.ts' },
  'G9-calibration-audited': { stage: 'claim', checks: 'a cost threshold is only trusted on probabilities an audited evaluator calls calibrated', owner: 'core', source: 'L42' },
  'G10-tree-consistent': { stage: 'claim', checks: 'the question tree agrees with its own partial collapses (operadic consistency)', owner: 'core', source: 'P34, L43' },
};

const r = (id: GateId, verdict: GateVerdict, why: string, evidence: Record<string, unknown> = {}): GateResult =>
  ({ id, stage: CATALOGUE[id].stage, verdict, why, evidence });

// ---------------------------------------------------------------- core gates

export function g1SpecValid(raw: unknown): GateResult {
  const errs = problems(raw);
  return errs.length ? r('G1-spec-valid', 'REFUSE', `${errs.length} spec problem(s)`, { problems: errs })
    : r('G1-spec-valid', 'PASS', 'spec is valid');
}

export function g2Privacy(items: readonly Item[], scanEnabled = true): GateResult {
  if (!scanEnabled) return r('G2-privacy', 'WARN', 'privacy scan disabled by the spec: the reason must be recorded next to the spec');
  const hits = privacyScan(items);
  return hits.length ? r('G2-privacy', 'REFUSE', `${hits.length} privacy hit(s) in states bound for an external API`, { hits })
    : r('G2-privacy', 'PASS', `0 hits in ${items.length} states`);
}

export function g3TextDisjoint(items: readonly Item[], opts: { accepted?: boolean } = {}): GateResult {
  const d = disjointness(items);
  if (!d) return r('G3-text-disjoint', 'SKIP', 'no fit/test split declared: nothing to be disjoint from (label-free or single-split run)');
  if (d.idOverlap || d.textOverlap) {
    return opts.accepted
      ? r('G3-text-disjoint', 'WARN', `${d.textOverlap} test item(s) seen in fit (${(d.seenShare * 100).toFixed(1)}%), accepted before the run; report seen vs novel`, d)
      : r('G3-text-disjoint', 'REFUSE', `test overlaps fit: ${d.idOverlap} by id, ${d.textOverlap} by text`, d);
  }
  return r('G3-text-disjoint', 'PASS', `fit ${d.fit} / test ${d.test}, 0 overlap by id or text`, d);
}

export function g4Coverage(coverage: number, minCoverage: number | undefined): GateResult {
  if (minCoverage === undefined) return r('G4-coverage', 'WARN', `coverage ${(coverage * 100).toFixed(1)}% but no minimum was declared before the run`, { coverage });
  return coverage >= minCoverage
    ? r('G4-coverage', 'PASS', `coverage ${(coverage * 100).toFixed(1)}% ≥ ${(minCoverage * 100).toFixed(0)}%`, { coverage, minCoverage })
    : r('G4-coverage', 'REFUSE', `coverage ${(coverage * 100).toFixed(1)}% < declared ${(minCoverage * 100).toFixed(0)}%`, { coverage, minCoverage });
}

/**
 * G8: a threshold counts only if it was fitted on the fit split and held on the test split.
 * `fittedOn` is declared by the caller; 'hand-set' always refuses (that is the point of the gate).
 */
export function g8ThresholdFittedAndHeld(t: { name: string; fittedOn: 'fit-split' | 'hand-set'; gate?: Gate; outcome?: GateOutcome; unstable?: boolean }): GateResult {
  if (t.fittedOn === 'hand-set') return r('G8-threshold-fitted-and-held', 'REFUSE', `${t.name} is hand-set; fit it on the fit split (kit/threshold.ts fitSelective or costThreshold)`, { name: t.name });
  if (!t.gate || !t.outcome) return r('G8-threshold-fitted-and-held', 'REFUSE', `${t.name}: fitted gate or its held-out outcome is missing`, { name: t.name });
  const ev = { name: t.name, hi: t.gate.hi, lo: t.gate.lo, maxError: t.gate.maxError, test: t.outcome };
  if (!t.outcome.held) return r('G8-threshold-fitted-and-held', 'REFUSE', `${t.name}: held-out error ${(t.outcome.errorRate * 100).toFixed(1)}% broke the promised ${(t.gate.maxError * 100).toFixed(1)}%`, ev);
  if (t.unstable) return r('G8-threshold-fitted-and-held', 'WARN', `${t.name}: bound held, but the cut is unstable under resampling (bootstrapCuts)`, ev);
  return r('G8-threshold-fitted-and-held', 'PASS', `${t.name}: fitted on the fit split; held-out error ${(t.outcome.errorRate * 100).toFixed(1)}% ≤ ${(t.gate.maxError * 100).toFixed(1)}% at coverage ${(t.outcome.coverage * 100).toFixed(1)}%`, ev);
}

/** G9: only matters when a cost threshold assumes calibrated p. Selective gates don't need calibration (SKIP). */
export function g9CalibrationAudited(c: CalibrationVerdict | undefined, usedForCostThreshold: boolean): GateResult {
  if (!usedForCostThreshold) return r('G9-calibration-audited', 'SKIP', 'no cost threshold relies on calibrated probabilities');
  if (!c) return r('G9-calibration-audited', 'REFUSE', 'a cost threshold assumes calibration, but calibration was never judged');
  const ev = { n: c.n, slope: c.slope, intercept: c.intercept, spiegelhalterP: c.spiegelhalterP, ece: c.ece, eceCI95: c.eceCI95 };
  return c.calibrated ? r('G9-calibration-audited', 'PASS', `calibrated by audited evaluators (n=${c.n})`, ev)
    : r('G9-calibration-audited', 'REFUSE', `cost threshold on uncalibrated p: ${c.reasons.join('; ')}. Recalibrate (isotonic) on the fit split, or use a selective gate`, ev);
}

/** G10: accepts an op-consist report ({verdict, oc_signal, failing_edges}) or absence of a tree. */
export function g10TreeConsistent(report?: { verdict: string; oc_signal?: number | null; failing_edges?: unknown[] }): GateResult {
  if (!report) return r('G10-tree-consistent', 'SKIP', 'no question tree declared for this context');
  if (report.verdict === 'ACCEPT') return r('G10-tree-consistent', 'PASS', `all partial collapses agree (OC ${report.oc_signal ?? 'n/a'})`, report);
  if (report.verdict === 'UNFACTORABLE') return r('G10-tree-consistent', 'SKIP', 'tree could not be factored; no signal (never a pass)', report);
  return r('G10-tree-consistent', 'REFUSE', `question tree disagrees with its own collapses at ${(report.failing_edges ?? []).length} edge(s)`, report);
}

// ---------------------------------------------------------------- the suite

export type SuiteReport = { verdict: 'ACCEPT' | 'REFUSE'; refusing: GateId[]; warnings: GateId[]; results: GateResult[] };

export function suite(results: readonly GateResult[]): SuiteReport {
  for (const x of results) {
    if (!(x.id in CATALOGUE)) throw new Error(`unknown gate id ${x.id}: add it to the CATALOGUE before using it`);
    if (x.verdict === 'SKIP' && !x.why) throw new Error(`${x.id}: a SKIP must say why`);
  }
  const refusing = results.filter(x => x.verdict === 'REFUSE').map(x => x.id);
  return { verdict: refusing.length ? 'REFUSE' : 'ACCEPT', refusing, warnings: results.filter(x => x.verdict === 'WARN').map(x => x.id), results: [...results] };
}

export function renderSuite(s: SuiteReport): string {
  const mark = { PASS: '✓', REFUSE: '✗', WARN: '!', SKIP: '·' } as const;
  const lines = s.results.map(x => `  ${mark[x.verdict]} ${x.id.padEnd(30)} ${x.verdict.padEnd(6)} ${x.why}`);
  return [`gates: ${s.verdict}${s.refusing.length ? ` (refused by ${s.refusing.join(', ')})` : ''}`, ...lines].join('\n');
}

/** The preflight trio, in order, for any spec: what kit/run.ts runs before spending a call. */
export function preflight(raw: unknown, spec: Spec | null, opts: { acceptOverlap?: boolean } = {}): GateResult[] {
  const g1 = g1SpecValid(raw);
  if (g1.verdict === 'REFUSE' || !spec) return [g1];
  const scored = spec.items.some(i => i.split) ? spec.items.filter(i => i.split === 'test') : spec.items;
  return [g1, g2Privacy(scored, spec.privacyScan !== false), g3TextDisjoint(spec.items, { accepted: opts.acceptOverlap })];
}
