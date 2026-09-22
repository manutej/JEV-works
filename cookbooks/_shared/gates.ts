/**
 * cookbooks/_shared/gates.ts — the standard gate suite (kit/standard-gate.ts) for each cookbook, from saved readings.
 *
 *   /opt/homebrew/bin/node cookbooks/_shared/gates.ts     → cookbooks/<domain>/results/gates.json
 *
 * No Jev calls: every input is a committed result file. What runs:
 *   G1–G4   preflight + coverage, on spec.json and results/test.json
 *   G5–G7   kit/gate/claim.ts on the DECLARED headline (frozen rule vs fit-only keyword lists), strata = true labels;
 *           and again, reported separately, on the POST-HOC headline (frozen rule vs naive Bayes)
 *   G8      POST-HOC bounded gate: kit/threshold.ts fitSelective on the FIT readings (95% Clopper-Pearson bound on
 *           auto-decided error ≤ maxError), applyGate once on the TEST readings, bootstrapCuts for stability.
 *           Chosen after the test run, so labelled post-hoc; the frozen rule's numbers stay the record beside it.
 *   G9      judgeCalibration when the frozen rule used a COST threshold (on the held-out test readings: a logistic
 *           score fitted on the fit items is calibrated on those same items by construction); otherwise SKIP.
 *   G10     SKIP: no question tree in these cookbooks.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyGate, bootstrapCuts, fitSelective, judgeCalibration, minItemsForBound, type Gate } from '../../kit/threshold.ts';
import { g1SpecValid, g2Privacy, g3TextDisjoint, g4Coverage, g8ThresholdFittedAndHeld, g9CalibrationAudited, g10TreeConsistent, suite, renderSuite, type GateResult } from '../../kit/standard-gate.ts';
import { gate as claimGate, toGateResults } from '../../kit/gate/claim.ts';
import { parseSpec } from '../../kit/spec.ts';
import { DOMAINS, ROOT, type DomainId } from './load.ts';

/** maxError per domain: 0.05 by default; 0.10 only where the cookbook's cost story says a wrong auto-decision is cheap. */
export const MAX_ERROR: Record<DomainId, { maxError: number; why: string }> = {
  'youtube-spam': { maxError: 0.05, why: 'default: a wrongly hidden comment silences a real person' },
  'intent-routing': { maxError: 0.05, why: 'default: a wrong auto-route bounces the user' },
  'review-triage': { maxError: 0.10, why: 'a wrong call costs an agent a minute or delays a reply; no safety or money decision (rule.ts)' },
  'contract-clauses': { maxError: 0.05, why: 'default: a mis-filed clause is checked against the wrong playbook' },
  'job-postings': { maxError: 0.05, why: 'default: a false fraud flag takes down a real employer\'s ad' },
  'issue-triage': { maxError: 0.10, why: 'a wrong label is re-labelled in seconds and maintainer labels are themselves noisy (rule.ts)' },
};

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
/**
 * Longest error-free run a cut could auto-decide on one side of the fit readings, tie-aware (a cut can't split tied
 * scores): accept side = items at or above a cut, all positive; reject side = items at or below a cut, all negative.
 */
function errorFreeRun(p: number[], y: boolean[], side: 'accept' | 'reject'): number {
  const cuts = [...new Set(p)].sort((a, b) => (side === 'accept' ? b - a : a - b));
  let best = 0;
  for (const t of cuts) {
    const idx = p.map((v, i) => i).filter(i => (side === 'accept' ? p[i] >= t : p[i] <= t));
    if (idx.some(i => y[i] !== (side === 'accept'))) break;
    best = idx.length;
  }
  return best;
}
const conf = (probs: Record<string, number>) => { const v = Object.values(probs), k = v.length; return Math.max(0, Math.min(1, (k * Math.max(...v) - 1) / (k - 1))); };

export function gatesFor(id: DomainId) {
  const d = join(ROOT, id);
  const raw = read(join(d, 'spec.json')), spec = parseSpec(raw, d);
  const test = read(join(d, 'results', 'test.json')), fitRes = read(join(d, 'results', 'fit.json'));
  const dec = read(join(d, 'results', 'decision-test.json'));
  const frozen = read(join(d, 'rule.frozen.json'));
  const meta = read(join(d, 'items.meta.json')) as { id: string; labels: Record<string, unknown> }[];
  const label = new Map(meta.map(m => [m.id, m.labels[frozen.target]]));
  const { maxError, why: maxWhy } = MAX_ERROR[id];

  // ---- G1–G4
  const core: GateResult[] = [g1SpecValid(raw), g2Privacy(spec.items.filter(i => i.split === 'test')), g3TextDisjoint(spec.items), g4Coverage(test.coverage, spec.gate?.minCoverage)];

  // ---- G5–G7, declared and post-hoc headlines (strata = true label; they partition the headline)
  type Row = { id: string; label: unknown; pred: unknown; baseline: unknown };
  const items = dec.items as Row[];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const disc = (name: string, rows: Row[], other: (r: Row) => unknown) => ({
    name, n: rows.length,
    b: rows.filter(r => same(r.pred, r.label) && !same(other(r), r.label)).length,
    c: rows.filter(r => !same(r.pred, r.label) && same(other(r), r.label)).length,
  });
  const labels = [...new Set(items.map(r => JSON.stringify(r.label)))];
  const claim = (otherName: string, other: (r: Row) => unknown) => claimGate({
    seed: `${id}-test`, role: 'holdout', claimScope: 'all', seenShare: test.disjointness?.seenShare ?? 0,
    coverage: test.coverage, minCoverage: spec.gate?.minCoverage, policy: 'frozen rule (rule.frozen.json), committed before the test run',
    policyDeclaredBeforeSeed: true, headline: disc('all', items, other),
    categories: labels.map(l => disc(`label=${JSON.parse(l)}`, items.filter(r => JSON.stringify(r.label) === l), other)),
    systems: { a: 'jev', b: otherName },
  });
  const nb = read(join(d, 'baseline.strong.json')).predictions as Record<string, unknown>;
  const declared = claim('keywords', r => r.baseline);
  const posthoc = claim('naive_bayes', r => nb[r.id]);

  // ---- G8: bounded gate on the fit readings, applied once to test
  const rows = (res: any) => (res.items as { id: string; answers?: Record<string, any> }[]).filter(r => r.answers);
  const fitRows = rows(fitRes), testRows = rows(test);
  let score: (a: Record<string, any>) => number, event: (r: { id: string; answers?: Record<string, any> }) => boolean, scoreName: string;
  if (frozen.kind === 'binary') {
    const { w, b } = frozen._exact;
    score = a => 1 / (1 + Math.exp(-(b + (frozen.features as string[]).reduce((s, f, j) => { const [q, o] = f.split('='); return s + (o !== undefined ? (a[q].probabilities[o] ?? 0) : a[q].p) * w[j]; }, 0))));
    event = r => label.get(r.id) === true; scoreName = 'frozen logistic score';
  } else {
    score = a => conf(a[frozen.target].probabilities);
    event = r => r.answers![frozen.target].choice === label.get(r.id); scoreName = `confidence on ${frozen.target} (event: Jev correct)`;
  }
  const pf = fitRows.map(r => score(r.answers!)), yf = fitRows.map(event);
  const pt = testRows.map(r => score(r.answers!)), yt = testRows.map(event);
  let g: Gate = fitSelective(pf, yf, maxError);
  if (frozen.kind === 'choice') g = { ...g, lo: null, fit: { ...g.fit, rejectN: 0, rejectErrors: 0, rejectErrUpper: 1, coverage: g.fit.acceptN / g.fit.n } };   // low confidence escalates; it does not predict "wrong"
  const outcome = applyGate(g, pt, yt);
  const floor = { minItemsForBound: minItemsForBound(maxError), fitN: pf.length,
    acceptSideErrorFreeRun: errorFreeRun(pf, yf, 'accept'), ...(frozen.kind === 'binary' ? { rejectSideErrorFreeRun: errorFreeRun(pf, yf, 'reject') } : {}) };
  const stability = bootstrapCuts(pf, yf, maxError);
  const unstable = frozen.kind === 'choice' ? (stability.hiNeverFits > 0.2 || (stability.hi.p05 !== null && stability.hi.p95 !== null && stability.hi.p95 - stability.hi.p05 > 0.2)) : stability.unstable;
  const g8 = g8ThresholdFittedAndHeld({ name: `POST-HOC bounded gate on ${scoreName}`, fittedOn: 'fit-split', gate: g, outcome, unstable });
  if (outcome.coverage === 0) g8.why += ` — no cut met the bound: at ${maxError * 100}% a one-sided cut needs ≥ ${floor.minItemsForBound} error-free fit items (minItemsForBound); the longest error-free run was ${floor.acceptSideErrorFreeRun}${'rejectSideErrorFreeRun' in floor ? ` (accept side) and ${floor.rejectSideErrorFreeRun} (reject side)` : ''} of ${floor.fitN}. Everything escalates: the honest answer at this n, not a failure`;

  // ---- G9: only where the frozen rule used a cost threshold
  const costUsed = frozen.kind === 'binary' && /minimises/.test(frozen.threshold.how);
  const calib = costUsed ? judgeCalibration(pt, yt) : undefined;
  const g9 = g9CalibrationAudited(calib, costUsed);
  if (!costUsed) g9.why = frozen.kind === 'binary' ? 'the frozen cut is a target-precision cut, not a cost threshold on calibrated p; the post-hoc gate is selective' : 'choice confidence gate; no cost threshold relies on calibrated probabilities';

  const results = [...core, ...toGateResults(declared), g8, g9, g10TreeConsistent()];
  const record = suite(results, { role: 'holdout' });
  const posthocClaim = suite(toGateResults(posthoc), { role: 'holdout' });
  return {
    domain: id, generatedFrom: ['spec.json', 'results/fit.json', 'results/test.json', 'results/decision-test.json', 'baseline.strong.json', 'rule.frozen.json'],
    suite: record,
    posthocHeadlineVsNaiveBayes: { what: 'G5–G7 on the post-hoc headline (frozen rule vs naive Bayes on 717–2,000 labelled rows)', suite: posthocClaim, report: posthoc },
    declaredClaim: declared,
    boundedGate: { posthoc: true, what: 'kit/threshold.ts fitSelective on FIT readings; applyGate once on TEST readings; chosen after the test run', score: scoreName, maxError, maxErrorWhy: maxWhy, floor, fitted: g, test: outcome, stability, calibrationTest: judgeCalibration(pt, yt), calibrationFit: judgeCalibration(pf, yf),
      frozenRuleOfRecord: frozen.kind === 'binary' ? { cut: frozen.threshold.t, band: [frozen.band.lo, frozen.band.hi], how: 'retired point-error band (decide.ts at d980b77)' } : { confidenceAtLeast: frozen.gate.confidenceAtLeast, how: 'retired point-error cut (decide.ts at d980b77)' } },
  };
}

if (import.meta.main) {
  for (const id of DOMAINS) {
    const out = join(ROOT, id, 'results', 'gates.json');
    const r = gatesFor(id);
    writeFileSync(out, JSON.stringify(r, null, 2) + '\n');
    console.log(`\n## ${id}\n${renderSuite(r.suite)}\n  post-hoc vs naive Bayes: ${r.posthocHeadlineVsNaiveBayes.suite.verdict}${r.posthocHeadlineVsNaiveBayes.suite.refusing.length ? ` (${r.posthocHeadlineVsNaiveBayes.suite.codes.join(', ')})` : ''}`);
  }
}
