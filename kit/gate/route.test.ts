/**
 * kit/gate/route.ts: the Ormus routes ride only on gates the kit can back.
 *
 *   node --test kit/gate/route.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alignedPairProbability, checkBudgets, faceValue, ledgerEntry, route, type Budget, type GateProvenance } from './route.ts';
import { decide, type Answer, type Decision } from './decide.ts';
import { applyGate, fitSelective, type Gate, type GateOutcome } from '../threshold.ts';
import { rng } from '../stats.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const BUDGETS = checkBudgets(json('./examples/effect-budgets.example.json')).value!;
const REV_LOW = { effect: 'reversible', blast: 'low' } as const;
const ADVISORY = { effect: 'advisory', blast: 'low' } as const;

/** Synthetic calibrated data, as in threshold.test.ts: p IS the true probability. */
function draw(n: number, seed: number) {
  const r = rng(seed), p: number[] = [], y: boolean[] = [];
  for (let i = 0; i < n; i++) { const t = r(); p.push(+t.toFixed(2)); y.push(r() < t); }
  return { p, y };
}
const fit = draw(3000, 5), held = draw(3000, 6);
const goodGate: Gate = fitSelective(fit.p, fit.y, 0.05);
const goodOutcome: GateOutcome = applyGate(goodGate, held.p, held.y);
assert.ok(goodOutcome.held, 'fixture: the 5% gate must hold on held-out data');
const HELD: GateProvenance = { fittedOn: 'fit-split', gate: goodGate, outcome: goodOutcome };
const HAND: GateProvenance = { fittedOn: 'hand-set', note: '0.85 / 0.15, NETER P4' };

test('face value: true → auto, false → block, escalate → review', () => {
  assert.equal(faceValue(true), 'auto');
  assert.equal(faceValue(false), 'block');
  assert.equal(faceValue('escalate'), 'review');
});

test('irreversible or high-blast actions never automate, however good the gate', () => {
  for (const cls of [{ effect: 'irreversible', blast: 'low' }, { effect: 'reversible', blast: 'high' }, { effect: 'irreversible', blast: 'high' }] as const) {
    assert.equal(route(true, cls, HELD, BUDGETS).route, 'escalate_human');
    assert.equal(route('escalate', cls, HELD, BUDGETS).route, 'escalate_human');
    assert.equal(route(false, cls, HELD, BUDGETS).route, 'block');
  }
  assert.equal(route(true, { effect: 'irreversible', blast: 'low' }, HELD, BUDGETS).code, 'route.irreversible');
  assert.equal(route(true, { effect: 'reversible', blast: 'high' }, HELD, BUDGETS).code, 'route.high-blast');
});

test('false and escalate claim no error rate, so they need no gate', () => {
  assert.deepEqual(route(false, REV_LOW, HAND, []).route, 'block');
  assert.deepEqual(route('escalate', REV_LOW, HAND, []).route, 'review');
  assert.equal(route(false, REV_LOW, HAND, []).code, undefined);
});

test('reversible + low: auto only on a fitted, held cut within a declared budget', () => {
  const ok = route(true, REV_LOW, HELD, BUDGETS);
  assert.equal(ok.route, 'auto');
  assert.deepEqual(ok.warnings, []);
  assert.equal(route(true, REV_LOW, HELD, []).code, 'route.budget-undeclared');
  assert.equal(route(true, REV_LOW, HAND, BUDGETS).code, 'route.hand-set');
  assert.equal(route(true, REV_LOW, { fittedOn: 'fit-split', gate: goodGate }, BUDGETS).code, 'route.not-applied');
  const broken: GateOutcome = { ...goodOutcome, held: false, errorRate: 0.09 };
  assert.equal(route(true, REV_LOW, { fittedOn: 'fit-split', gate: goodGate, outcome: broken }, BUDGETS).code, 'route.bound-broken');
  for (const demoted of [route(true, REV_LOW, HELD, []), route(true, REV_LOW, HAND, BUDGETS)]) {
    assert.equal(demoted.route, 'review');
    assert.equal(demoted.faceValue, 'auto');
  }
});

test('a gate fitted to a looser error than the class budget does not buy auto', () => {
  const loose: Gate = fitSelective(fit.p, fit.y, 0.10);
  const out = applyGate(loose, held.p, held.y);
  assert.ok(out.held);
  const tight: Budget[] = [{ effect: 'reversible', blast: 'low', maxError: 0.05, why: 'test' }];
  const res = route(true, REV_LOW, { fittedOn: 'fit-split', gate: loose, outcome: out }, tight);
  assert.equal(res.route, 'review');
  assert.equal(res.code, 'route.budget-exceeded');
  const matching: Budget[] = [{ effect: 'reversible', blast: 'low', maxError: 0.10, why: 'test' }];
  assert.equal(route(true, REV_LOW, { fittedOn: 'fit-split', gate: loose, outcome: out }, matching).route, 'auto');
});

test('an unstable cut still routes auto, but the warning travels with it (as G8 warns)', () => {
  const res = route(true, REV_LOW, { ...HELD, unstable: true } as GateProvenance, BUDGETS);
  assert.equal(res.route, 'auto');
  assert.deepEqual(res.warnings, ['route.unstable']);
});

test('advisory effect: hand-set or unheld cuts are allowed and marked, never silent (envelope use)', () => {
  assert.equal(route(true, ADVISORY, HAND, BUDGETS, 'use').route, 'auto');
  assert.deepEqual(route(true, ADVISORY, HAND, BUDGETS, 'use').warnings, ['route.hand-set']);
  assert.deepEqual(route(true, ADVISORY, { fittedOn: 'fit-split', gate: goodGate }, BUDGETS, 'use').warnings, ['route.not-applied']);
  assert.deepEqual(route(true, ADVISORY, HELD, BUDGETS, 'use').warnings, []);
});

test('budgets: every row typed and explained; no budget can buy auto for the human classes', () => {
  assert.equal(checkBudgets(json('./examples/effect-budgets.example.json')).errors.length, 0);
  const bad = checkBudgets([
    { effect: 'reversible', blast: 'low', maxError: 0.05 },
    { effect: 'irreversible', blast: 'low', maxError: 0.01, why: 'x' },
    { effect: 'reversible', blast: 'low', maxError: 1.5, why: 'x' },
    'nope',
  ]);
  assert.equal(bad.value, undefined);
  assert.ok(bad.errors.some(e => e.includes('[0].why')));
  assert.ok(bad.errors.some(e => e.includes('[1]') && e.includes('parks for a human')));
  assert.ok(bad.errors.some(e => e.includes('[2].maxError')));
  assert.ok(bad.errors.some(e => e.includes('[2]') && e.includes('second budget')));
  assert.ok(bad.errors.some(e => e.includes('[3]')));
});

test('end to end: decide.ts verdict → route, on the leads stage-2 rules', () => {
  const d: Decision = json('./examples/leads-stage2.decision.json');
  const answers: Record<string, Answer> = {
    segment: { type: 'choice', choice: 'smb', probabilities: { enterprise: 0.05, mid_market: 0.05, smb: 0.9 } },
    buyingSignal: { type: 'boolean', probability: 0.92 },
    icpFit: { type: 'score', score: 2 },
  };
  const { verdict } = decide(answers, d);
  assert.equal(verdict, true);
  // The leads thresholds (0.85 / 0.15) are hand-set: a qualified lead is a reversible, low-blast tag → review, not auto.
  assert.equal(route(verdict, REV_LOW, HAND, BUDGETS).route, 'review');
  // "Send the lead an email" is irreversible → a human, whatever the verdict.
  assert.equal(route(verdict, { effect: 'irreversible', blast: 'low' }, HELD, BUDGETS).route, 'escalate_human');
});

test('ledger: a line carries the model, the snapshot, the gate and the route; it refuses to be unqualifiable', () => {
  const routed = route(true, REV_LOW, HELD, BUDGETS);
  const e = ledgerEntry({ stateId: 's-1', answeredBy: 'jev-1.13.0', questions: ['buyingSignal', 'icpFit'], verdict: true, routed, effectClass: REV_LOW, budget: BUDGETS[1], prov: HELD, at: new Date('2026-09-28T00:00:00Z') });
  assert.equal(e.at, '2026-09-28T00:00:00.000Z');
  assert.equal(e.gate.fittedOn, 'fit-split');
  assert.equal(e.gate.held, true);
  assert.equal(e.gate.maxError, 0.05);
  assert.ok(!('prov' in e));
  assert.throws(() => ledgerEntry({ stateId: 's-1', answeredBy: '', questions: ['q'], verdict: true, routed, effectClass: REV_LOW, prov: HAND }), /answeredBy/);
  assert.throws(() => ledgerEntry({ stateId: '', answeredBy: 'jev-1.13.0', questions: ['q'], verdict: true, routed, effectClass: REV_LOW, prov: HAND }), /stateId/);
  assert.equal(ledgerEntry({ stateId: 's', answeredBy: 'jev-1.13.0', questions: ['q'], verdict: false, routed: route(false, REV_LOW, HAND), effectClass: REV_LOW, prov: HAND }).gate.fittedOn, 'hand-set');
});

test('envelope: not-supported parks for a person and escalate hands to a stronger judge, whatever the verdict or gate', () => {
  for (const v of [true, false, 'escalate'] as const) {
    const ns = route(v, REV_LOW, HELD, BUDGETS, 'not-supported');
    assert.equal(ns.route, 'escalate_human');
    assert.equal(ns.code, 'route.envelope-unsupported');
    const es = route(v, REV_LOW, HELD, BUDGETS, 'escalate');
    assert.equal(es.route, 'review');
    assert.equal(es.code, 'route.envelope-escalate');
  }
  // the human classes still come first
  assert.equal(route(true, { effect: 'irreversible', blast: 'low' }, HELD, BUDGETS, 'escalate').code, 'route.irreversible');
});

test('envelope: validate-first (the default) only marks advisory autos; a fitted, held cut is the local validation', () => {
  assert.deepEqual(route(true, ADVISORY, HAND, BUDGETS).warnings, ['route.hand-set', 'route.envelope-unvalidated']);
  assert.deepEqual(route(true, ADVISORY, HAND, BUDGETS, 'use').warnings, ['route.hand-set']);
  assert.deepEqual(route(true, ADVISORY, HELD, BUDGETS).warnings, []);
  assert.equal(route(true, REV_LOW, HELD, BUDGETS).route, 'auto');
  assert.equal(route(true, REV_LOW, HELD, BUDGETS, 'use').route, 'auto');
});

test('pairwise: both orders averaged; consistent orders keep the number, contradictory orders land on 0.5; invalid defers', () => {
  assert.ok(Math.abs(alignedPairProbability(0.9, 0.1)! - 0.9) < 1e-12);
  assert.ok(Math.abs(alignedPairProbability(0.9, 0.9)! - 0.5) < 1e-12);
  assert.ok(Math.abs(alignedPairProbability(0.8, 0.4)! - 0.7) < 1e-12);
  assert.equal(alignedPairProbability(undefined, 0.3), undefined);
  assert.equal(alignedPairProbability(0.3, undefined), undefined);
  assert.throws(() => alignedPairProbability(1.2, 0.1), /\[0, 1\]/);
});
