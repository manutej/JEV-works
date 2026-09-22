// question-bank/confidence.ts: the verdict rules every question-quality report depends on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verdictFor, summariseQuestion, THRESHOLDS, conf, defects } from './confidence.ts';

test('NaN or missing data is INSUFFICIENT-DATA, never the best verdict (the incident this guard exists for)', () => {
  assert.equal(verdictFor(NaN, 0.5, 100), 'INSUFFICIENT-DATA');
  assert.equal(verdictFor(0.9, NaN, 100), 'INSUFFICIENT-DATA');
  assert.equal(verdictFor(0.9, 0.5, THRESHOLDS.minObservations - 1), 'INSUFFICIENT-DATA');
  assert.equal(summariseQuestion('q', 'boolean', []).verdict, 'INSUFFICIENT-DATA');
});

test('order: confident-but-constant is NO-INFORMATION before any decisiveness check', () => {
  assert.equal(verdictFor(1, THRESHOLDS.noInformationSpread - 0.01, 50), 'NO-INFORMATION');
});

test('boundaries: MOVE-TO-CODE < 0.25 ≤ MARGINAL < 0.5 ≤ JEV-SAFE', () => {
  assert.equal(verdictFor(0.24, 0.5, 50), 'MOVE-TO-CODE');
  assert.equal(verdictFor(0.25, 0.5, 50), 'MARGINAL');
  assert.equal(verdictFor(0.49, 0.5, 50), 'MARGINAL');
  assert.equal(verdictFor(0.5, 0.5, 50), 'JEV-SAFE');
});

test('boolean summary: decisive answers at both ends are JEV-SAFE; mid-band answers are MOVE-TO-CODE', () => {
  const ends = Array.from({ length: 10 }, (_, i) => ({ p: i % 2 ? 0.95 : 0.03 }));
  assert.equal(summariseQuestion('q', 'boolean', ends).verdict, 'JEV-SAFE');
  // Spread out (so not NO-INFORMATION) but never near 0 or 1: the question never decides.
  const mid = Array.from({ length: 10 }, (_, i) => ({ p: 0.2 + i * 0.066 }));
  assert.equal(summariseQuestion('q', 'boolean', mid).verdict, 'MOVE-TO-CODE');
  assert.deepEqual(defects([summariseQuestion('m', 'boolean', mid)]).moveToCode.map(r => r.question), ['m']);
});

test('boolean summary: always-yes is NO-INFORMATION even though every answer is confident', () => {
  const same = Array.from({ length: 10 }, () => ({ p: 0.97 }));
  assert.equal(summariseQuestion('q', 'boolean', same).verdict, 'NO-INFORMATION');
});

test('conf() is distance from 0.5, scaled to [0, 1]', () => {
  assert.equal(conf(0.5), 0); assert.equal(conf(1), 1); assert.equal(conf(0), 1);
});
