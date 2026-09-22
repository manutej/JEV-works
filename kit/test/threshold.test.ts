// kit/threshold.ts: thresholds chosen by method, not taste. No API calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binomCdf, clopperPearsonUpper, calibration, isotonic, costThreshold, fitSelective, applyGate, bootstrapCuts, auditCalibrationEvaluator } from '../threshold.ts';
import { rng } from '../stats.ts';

/** Synthetic data where p IS the true probability (calibrated), or a distorted version of it. */
function draw(n: number, seed: number, distort = (p: number) => p) {
  const r = rng(seed), p: number[] = [], y: boolean[] = [];
  for (let i = 0; i < n; i++) { const t = r(); p.push(+distort(t).toFixed(2)); y.push(r() < t); }
  return { p, y };
}

test('exact binomial: cdf sums to 1; Clopper-Pearson matches the closed form for 0 events', () => {
  assert.ok(Math.abs(binomCdf(10, 10, 0.3) - 1) < 1e-12);
  assert.ok(Math.abs(clopperPearsonUpper(0, 10) - (1 - 0.05 ** (1 / 10))) < 1e-6);   // 0.2589
  assert.ok(clopperPearsonUpper(2, 100) > 0.02 && clopperPearsonUpper(2, 100) < 0.07);
  assert.equal(clopperPearsonUpper(0, 0), 1);          // no data → no promise
});

test('calibration: calibrated data has low ECE; systematically overconfident data does not', () => {
  const good = draw(4000, 1), bad = draw(4000, 2, t => Math.min(0.99, t < 0.5 ? t / 3 : 1 - (1 - t) / 3));
  assert.ok(calibration(good.p, good.y).ece < 0.03, `ece ${calibration(good.p, good.y).ece}`);
  assert.ok(calibration(bad.p, bad.y).ece > 0.08, `ece ${calibration(bad.p, bad.y).ece}`);
});

test('isotonic recalibration: monotone, and fitted on one split it repairs miscalibration on another', () => {
  const distort = (t: number) => Math.min(0.99, t < 0.5 ? t / 3 : 1 - (1 - t) / 3);
  const fit = draw(4000, 3, distort), test_ = draw(4000, 4, distort);
  const f = isotonic(fit.p, fit.y);
  for (let x = 0; x < 1; x += 0.05) assert.ok(f(x) <= f(x + 0.05) + 1e-12, 'must be monotone');
  const before = calibration(test_.p, test_.y).ece, after = calibration(test_.p.map(f), test_.y).ece;
  assert.ok(after < before / 2, `ECE ${before.toFixed(3)} → ${after.toFixed(3)}`);
});

test('cost threshold: false positives 4× as costly as misses → say yes only above 0.8', () => {
  assert.equal(costThreshold(4, 1), 0.8);
  assert.equal(costThreshold(1, 1), 0.5);
  assert.throws(() => costThreshold(0, 1));
});

test('selective gate on calibrated data: the promised error bound holds on held-out data', () => {
  const fit = draw(3000, 5), held = draw(3000, 6);
  const g = fitSelective(fit.p, fit.y, 0.05);
  assert.ok(g.hi !== null && g.lo !== null && g.hi > g.lo);
  assert.ok(g.fit.acceptErrUpper <= 0.05 && g.fit.rejectErrUpper <= 0.05);
  const o = applyGate(g, held.p, held.y);
  assert.ok(o.held, `held-out error ${o.errorRate.toFixed(3)} vs promised 0.05`);
  assert.ok(o.coverage > 0.05 && o.coverage < 0.9, 'a strict error target must cost coverage');
});

test('a tighter error target buys less coverage (the trade-off is explicit)', () => {
  const fit = draw(3000, 7);
  assert.ok(fitSelective(fit.p, fit.y, 0.02).fit.coverage < fitSelective(fit.p, fit.y, 0.10).fit.coverage);
});

test('an uninformative signal refuses to auto-decide instead of inventing a cut', () => {
  const r = rng(8), p = Array.from({ length: 500 }, () => +r().toFixed(2)), y = p.map(() => r() < 0.5);
  const g = fitSelective(p, y, 0.05);
  assert.equal(g.hi, null);
  assert.equal(g.lo, null);
  assert.equal(applyGate(g, p, y).coverage, 0);
});

test('stability: tiny fit sets are flagged unstable; large calibrated ones are not', () => {
  const small = draw(40, 9), big = draw(3000, 10);
  assert.equal(bootstrapCuts(small.p, small.y, 0.05, 100).unstable, true);
  assert.equal(bootstrapCuts(big.p, big.y, 0.10, 100).unstable, false);
});

test('the calibration evaluator passes its own audit at small n (it false-alarmed 80% at n=40 before CI-based checks)', () => {
  const a = auditCalibrationEvaluator(100, 200);
  assert.ok(a.falseAlarmRate <= 0.075, `false alarms ${a.falseAlarmRate} on calibrated-by-construction data`);
  assert.ok(a.power >= 0.8, `power ${a.power} on a known distortion`);
});

