/**
 * cookbooks/_shared/present.ts — the gate suite and bounded gate in words, shared by the READMEs and the pages so the two
 * can never disagree. Everything is read from results/gates.json via load.ts.
 */
import type { Loaded } from './load.ts';

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(1)}%`);

export type SuiteSummary = { verdict: string; refusing: string[]; codes: string[]; warnings: string[]; posthocVerdict: string; posthocCodes: string[]; posthocWhy: string };

export function suiteSummary(L: Loaded): SuiteSummary {
  const s = L.gates.suite, p = L.gates.posthocHeadlineVsNaiveBayes.suite;
  const refusing = (p.results as any[]).filter(r => r.verdict === 'REFUSE').map(r => `${r.id}: ${r.why}`).join('; ');
  return { verdict: s.verdict, refusing: s.refusing, codes: s.codes, warnings: s.warnings, posthocVerdict: p.verdict, posthocCodes: p.codes, posthocWhy: refusing };
}

export function gateRows(L: Loaded): { id: string; verdict: string; why: string; code?: string }[] {
  return (L.gates.suite.results as any[]).map(r => ({ id: r.id, verdict: r.verdict, why: r.why, code: r.code }));
}

export function bounded(L: Loaded) {
  const b = L.gates.boundedGate;
  const cuts = [b.fitted.hi !== null ? `accept ≥ ${b.fitted.hi.toFixed(3)}` : null, b.fitted.lo !== null ? `reject ≤ ${b.fitted.lo.toFixed(3)}` : null].filter(Boolean).join(', ') || 'no cut met the bound';
  const record = L.kind === 'binary'
    ? `frozen band [${L.frozen.band.lo}, ${L.frozen.band.hi}) acted on ${pct(L.decision.gated.coverage)} at ${pct(L.decision.gated.autoAccuracy)}`
    : `frozen gate (confidence ≥ ${L.frozen.gate.confidenceAtLeast}) acted on ${pct(L.decision.gated.coverage)} at ${pct(L.decision.gated.autoAccuracy)}`;
  return {
    score: b.score, maxError: b.maxError, maxErrorWhy: b.maxErrorWhy, cuts,
    fitCoverage: b.fitted.fit.coverage, testCoverage: b.test.coverage, testError: b.test.errorRate, testErrorUpper: b.test.errorUpper95,
    held: b.test.coverage ? b.test.held : null, unstable: L.gates.suite.results.find((r: any) => r.id === 'G8-threshold-fitted-and-held')?.code === 'G8.unstable',
    record, calibratedTest: b.calibrationTest.calibrated, calibrationReason: b.calibrationTest.reasons[0] as string | undefined,
    text: b.test.coverage
      ? `A 95% bound on error ≤ ${pct(b.maxError)} (${b.maxErrorWhy}) gave ${cuts} on the fit readings. On test it auto-decided ${pct(b.test.coverage)} with ${pct(b.test.errorRate)} error (95% upper bound ${pct(b.test.errorUpper95)}): the promise ${b.test.held ? 'held' : 'broke'}.`
      : `A 95% bound on error ≤ ${pct(b.maxError)} (${b.maxErrorWhy}) found no cut on the ${b.fitted.fit.n} fit readings: proving an error rate that low needs a long error-free run on one side. So the bounded gate auto-decides nothing and every item goes to a person. That is the honest answer at this sample size: the frozen gate's coverage came with no promise about its error.`,
  };
}

export function calibrationNote(L: Loaded): string {
  const b = L.gates.boundedGate, g9 = L.gates.suite.results.find((r: any) => r.id === 'G9-calibration-audited');
  const test = b.calibrationTest.calibrated ? 'no evidence against calibration on the test readings (weak evidence at n = 150, not proof)' : `calibration rejected on the test readings (${b.calibrationTest.reasons[0]})`;
  return `${b.score}: ${test}. G9 ${g9.verdict}: ${g9.why}`;
}
