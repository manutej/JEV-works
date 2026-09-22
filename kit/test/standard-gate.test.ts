// Standardized gates: every gate returns the same contract; the suite refuses on any REFUSE. No API calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, g1SpecValid, g2Privacy, g3TextDisjoint, g4Coverage, g8ThresholdFittedAndHeld, g9CalibrationAudited,
  g10TreeConsistent, suite, renderSuite, preflight, CONTRACT_VERSION, type GateResult, type G7Evidence } from '../standard-gate.ts';
import { parseSpec, type Item } from '../spec.ts';
import { fitSelective, applyGate, judgeCalibration } from '../threshold.ts';
import { rng } from '../stats.ts';

const Q = { dept: { type: 'choice', instructions: 'Which team?', criteria: { billing: 'money', technical: 'bugs' } } };

test('catalogue: ten stable ids, each with stage, owner and source', () => {
  assert.equal(Object.keys(CATALOGUE).length, 10);
  for (const [id, c] of Object.entries(CATALOGUE)) {
    assert.match(id, /^G\d+-[a-z-]+$/);
    assert.ok(['preflight', 'run', 'claim'].includes(c.stage) && c.checks && c.source, id);
  }
});

test('every gate returns the contract shape with its catalogue stage', () => {
  const items: Item[] = [{ id: 'a', state: 'x' }];
  const all: GateResult[] = [g1SpecValid({}), g2Privacy(items), g3TextDisjoint(items), g4Coverage(1, 0.9),
    g8ThresholdFittedAndHeld({ name: 't', fittedOn: 'hand-set' }), g9CalibrationAudited(undefined, false), g10TreeConsistent()];
  for (const g of all) {
    for (const k of ['evidence', 'id', 'stage', 'verdict', 'why']) assert.ok(k in g, `${g.id} lacks ${k}`);
    assert.ok(Object.keys(g).every(k => ['evidence', 'id', 'stage', 'verdict', 'why', 'code'].includes(k)), `${g.id} has an extra field`);
    assert.equal(g.stage, CATALOGUE[g.id].stage);
    assert.ok(['PASS', 'REFUSE', 'WARN', 'SKIP'].includes(g.verdict));
  }
});

test('preflight: invalid spec stops at G1; a valid one runs G1 → G2 → G3 in order', () => {
  assert.deepEqual(preflight({ name: 'Bad' }, null).map(g => `${g.id}:${g.verdict}`), ['G1-spec-valid:REFUSE']);
  const raw = { name: 'ok', questions: Q, items: [{ id: 'f', state: 'refund', split: 'fit' }, { id: 't', state: 'sync broken', split: 'test' }] };
  assert.deepEqual(preflight(raw, parseSpec(raw)).map(g => `${g.id}:${g.verdict}`), ['G1-spec-valid:PASS', 'G2-privacy:PASS', 'G3-text-disjoint:PASS']);
});

test('G2 refuses a planted secret; disabling the scan is a WARN, never a silent PASS', () => {
  assert.equal(g2Privacy([{ id: 'a', state: 'mail me: a.b@example.com' }]).verdict, 'REFUSE');
  assert.equal(g2Privacy([{ id: 'a', state: 'mail me: a.b@example.com' }], false).verdict, 'WARN');
});

test('G3: text overlap refuses; accepted-before-run overlap warns; no split is a SKIP with a reason', () => {
  const items: Item[] = [{ id: 'f', state: 'Refund me', split: 'fit' }, { id: 't', state: 'refund  ME', split: 'test' }];
  assert.equal(g3TextDisjoint(items).verdict, 'REFUSE');
  assert.equal(g3TextDisjoint(items, { accepted: true }).verdict, 'WARN');
  const skip = g3TextDisjoint([{ id: 'a', state: 'x' }]);
  assert.equal(skip.verdict, 'SKIP'); assert.ok(skip.why.length > 10);
});

test('G4: below the declared minimum refuses; an undeclared minimum warns', () => {
  assert.equal(g4Coverage(0.78, 0.95).verdict, 'REFUSE');
  assert.equal(g4Coverage(0.97, 0.95).verdict, 'PASS');
  assert.equal(g4Coverage(0.97, undefined).verdict, 'WARN');
});

test('G8: a hand-set threshold always refuses; a fitted one passes only if its bound held on held-out data', () => {
  assert.equal(g8ThresholdFittedAndHeld({ name: 'escalate<0.85', fittedOn: 'hand-set' }).verdict, 'REFUSE');
  const r = rng(3), mk = (n: number) => { const p: number[] = [], y: boolean[] = []; for (let i = 0; i < n; i++) { const t = r(); p.push(+t.toFixed(2)); y.push(r() < t); } return { p, y }; };
  const fit = mk(3000), held = mk(3000), gate = fitSelective(fit.p, fit.y, 0.05);
  const ok = g8ThresholdFittedAndHeld({ name: 'gate', fittedOn: 'fit-split', gate, outcome: applyGate(gate, held.p, held.y) });
  assert.equal(ok.verdict, 'PASS', ok.why);
  const broken = g8ThresholdFittedAndHeld({ name: 'gate', fittedOn: 'fit-split', gate, outcome: { ...applyGate(gate, held.p, held.y), held: false, errorRate: 0.2 } });
  assert.equal(broken.verdict, 'REFUSE');
});

test('G9: only binds when a cost threshold assumes calibration; small n is not a pass', () => {
  assert.equal(g9CalibrationAudited(undefined, false).verdict, 'SKIP');
  assert.equal(g9CalibrationAudited(undefined, true).verdict, 'REFUSE');
  const r = rng(4), p = Array.from({ length: 40 }, () => +r().toFixed(2)), y = p.map(t => r() < t);
  assert.equal(g9CalibrationAudited(judgeCalibration(p, y), true).verdict, 'REFUSE', 'n=40 is too few to call calibrated');
});

test('G10 maps an op-consist report: ACCEPT passes, REFUSE refuses, UNFACTORABLE is never a pass', () => {
  assert.equal(g10TreeConsistent({ verdict: 'ACCEPT', oc_signal: 0.93 }).verdict, 'PASS');
  assert.equal(g10TreeConsistent({ verdict: 'REFUSE', failing_edges: ['L1-M1'] }).verdict, 'REFUSE');
  assert.equal(g10TreeConsistent({ verdict: 'UNFACTORABLE', oc_signal: null }).verdict, 'SKIP');
});

test('suite: any REFUSE refuses; warnings are listed; unknown ids and reasonless SKIPs are rejected', () => {
  const s = suite([g4Coverage(0.97, 0.95), g4Coverage(0.5, 0.95), g2Privacy([{ id: 'a', state: 'x' }], false)]);
  assert.equal(s.verdict, 'REFUSE'); assert.deepEqual(s.refusing, ['G4-coverage']); assert.deepEqual(s.warnings, ['G2-privacy']);
  assert.match(renderSuite(s), /refused by G4-coverage/);
  assert.throws(() => suite([{ id: 'G99-made-up' as never, stage: 'run', verdict: 'PASS', why: 'x', evidence: {} }]), /unknown gate id/);
  assert.throws(() => suite([{ id: 'G4-coverage', stage: 'run', verdict: 'SKIP', why: '', evidence: {} }]), /must say why/);
  assert.equal(suite([g4Coverage(1, 0.9)]).verdict, 'ACCEPT');
});

test('contract v1: reason codes are registered and belong to their gate; refusals carry a code', () => {
  assert.equal(CONTRACT_VERSION, 1);
  assert.equal(g4Coverage(0.5, 0.95).code, 'G4.below-minimum');
  assert.equal(g8ThresholdFittedAndHeld({ name: 't', fittedOn: 'hand-set' }).code, 'G8.hand-set');
  const g = { id: 'G7-strata-consistent' as const, stage: 'claim' as const, verdict: 'REFUSE' as const, why: 'categories do not sum to the headline', evidence: {} };
  assert.deepEqual(suite([{ ...g, code: 'G7.partition' }]).codes, ['G7.partition']);
  assert.throws(() => suite([{ ...g, code: 'G7.made-up' }]), /unknown reason code/);
  assert.throws(() => suite([{ ...g, code: 'G4.below-minimum' }]), /belongs to another gate/);
});

test('suite records its settings, and a dev run is NOT-A-HOLDOUT even when every gate passes', () => {
  const s = suite([g4Coverage(1, 0.9)], { settings: { minDiscordant: 20 } });
  assert.deepEqual(s.settings, { alpha: 0.05, minStratum: 8, minDiscordant: 20, seenShareLimit: 0.2 });
  assert.equal(s.contract, 1);
  assert.equal(suite([g4Coverage(1, 0.9)], { role: 'dev' }).verdict, 'NOT-A-HOLDOUT');
  assert.equal(suite([g4Coverage(0.1, 0.9)], { role: 'dev' }).verdict, 'NOT-A-HOLDOUT', 'dev is never evidence, pass or fail');
});

test('G7 evidence shape (StratumRow rows + correction) is a typed contract the claim gate fills', () => {
  const ev: G7Evidence = { systems: ['jev', 'regex'], correction: 'holm',
    headline: { name: 'all', n: 600, b: 101, c: 91, p: 0.516, direction: 'no_difference' },
    strata: [{ name: 'non_buyer', n: 120, b: 74, c: 0, p: 1e-22, direction: 'a_better' }], legacyEdge: 'E5' };
  const res = suite([{ id: 'G7-strata-consistent', stage: 'claim', verdict: 'REFUSE', why: 'pooled null hides non_buyer', code: 'G7.contradiction', evidence: ev }]);
  assert.equal(res.verdict, 'REFUSE');
  assert.equal((res.results[0].evidence as G7Evidence).strata[0].name, 'non_buyer');
});

