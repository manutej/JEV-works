/**
 * One scenario per past failure: each must be REFUSED on the edge where it happened (EVAL-TREE.md).
 *
 *   /opt/homebrew/bin/node --test leads/claim-gate.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gate, mcnemarExact, type GateInput } from './claim-gate.ts';

// A clean, pre-declared, adequately covered holdout where Jev wins everywhere it is measured.
const clean: GateInput = {
  seed: 'x', role: 'holdout', claimScope: 'all', leakageAccepted: false,
  seenShare: 0.05, seenShareLimit: 0.2, coverage: 0.97, minCoverage: 0.95,
  policy: 'v2', policyDeclaredBeforeSeed: true,
  headline: { name: 'all', n: 600, b: 60, c: 20 },
  seen: { name: 'seen', n: 30, b: 3, c: 1 },
  novel: { name: 'novel', n: 570, b: 57, c: 19 },
  categories: [{ name: 'non_buyer', n: 120, b: 40, c: 0 }, { name: 'clean_in_icp', n: 180, b: 2, c: 3 }],
};
const edges = (i: GateInput) => gate(i).failingEdges.map(f => f.edge);

test('McNemar matches textbook values', () => {
  assert.equal(mcnemarExact(0, 5).toFixed(4), '0.0625');
  assert.equal(mcnemarExact(5, 5), 1);
  assert.equal(mcnemarExact(2, 10).toFixed(4), '0.0386');
});

test('a clean holdout is accepted, with the carrying strata named and the caveat attached', () => {
  const r = gate(clean);
  assert.equal(r.verdict, 'ACCEPT');
  assert.equal(r.claim, 'jev_better');
  assert.match(r.findings.join(' '), /significant within: .*novel.*non_buyer/);
  assert.match(r.caveat, /not correctness/);
});

test('p6029: record-disjoint but 94% of messages seen, leakage not accepted -> REFUSE on E1', () => {
  assert.deepEqual(edges({ ...clean, seenShare: 0.942 }), ['E1-text-disjoint']);
});

test('leakage accepted before the run narrows the claim to new records instead of refusing', () => {
  const r = gate({ ...clean, seenShare: 0.942, leakageAccepted: true });
  assert.equal(r.verdict, 'ACCEPT');
  assert.equal(r.claimScope, 'new_records');
});

test('a claim about new wording needs a large, agreeing novel stratum (p6029: n=35, no difference)', () => {
  const r = gate({ ...clean, claimScope: 'novel_wording', seenShare: 0.942, leakageAccepted: true, novel: { name: 'novel', n: 35, b: 0, c: 1 } });
  assert.deepEqual(r.failingEdges.map(f => f.edge), ['E5-strata-consistent']);
  assert.match(r.failingEdges[0].why, /new wording; the novel stratum says no_difference/);
});

test('seed-42 pre-gate: great accuracy at 14.3% coverage -> REFUSE on E2', () => {
  assert.deepEqual(edges({ ...clean, coverage: 0.143 }), ['E2-coverage']);
  assert.deepEqual(edges({ ...clean, minCoverage: undefined }), ['E2-coverage']);
});

test('policy chosen after the results were seen -> REFUSE on E3', () => {
  assert.deepEqual(edges({ ...clean, policyDeclaredBeforeSeed: false }), ['E3-policy-predeclared']);
});

test('a significant stratum contradicting the headline -> REFUSE on E5', () => {
  const r = gate({ ...clean, categories: [{ name: 'ambiguous', n: 90, b: 0, c: 30 }] });
  assert.deepEqual(r.failingEdges.map(f => f.edge), ['E5-strata-consistent']);
});

test('a null headline hiding a significant stratum is reported, not refused', () => {
  const r = gate({ ...clean, headline: { name: 'all', n: 600, b: 30, c: 33 }, categories: [{ name: 'adversarial', n: 30, b: 0, c: 12 }] });
  assert.equal(r.claim, 'no_difference');
  assert.equal(r.verdict, 'ACCEPT');
  assert.match(r.findings.join(' '), /pooled null hides it/);
});

test('an undeclared claim scope cannot pass E5; a dev seed is never a holdout result', () => {
  assert.ok(edges({ ...clean, claimScope: undefined }).includes('E5-strata-consistent'));
  assert.equal(gate({ ...clean, role: 'dev' }).verdict, 'NOT-A-HOLDOUT');
});
