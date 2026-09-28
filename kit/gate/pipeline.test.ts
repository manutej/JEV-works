/**
 * kit/gate/pipeline.ts on the cookbooks' recorded answers (no API calls): the fused workflow end to end.
 *
 *   node --test kit/gate/pipeline.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anchorChecks, choiceConfidence, errorAuroc, pipeline, renderReport, score, type MetaItem, type PipelineConfig, type ResultFile, type Scored } from './pipeline.ts';
import { checkBudgets } from './route.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const BUDGETS = checkBudgets(json('./examples/effect-budgets.example.json')).value!;
const NOW = new Date('2026-09-28T12:00:00Z');
const load = (domain: string) => ({
  fit: json(`../../cookbooks/${domain}/results/fit.json`) as ResultFile,
  test: json(`../../cookbooks/${domain}/results/test.json`) as ResultFile,
  meta: json(`../../cookbooks/${domain}/items.meta.json`) as MetaItem[],
});
const cfg = (name: string, target: string, extra: Partial<PipelineConfig> = {}): PipelineConfig =>
  ({ name, target, effect: { effect: 'reversible', blast: 'low' }, budgets: BUDGETS, envelope: 'validate-first', minCoverage: 0.95, ...extra });

test('choice confidence is TypeSafe\'s documented statistic; noul confidence is distance from the coin flip', () => {
  assert.equal(choiceConfidence({ a: 1, b: 0, c: 0 }), 1);
  assert.ok(Math.abs(choiceConfidence({ a: 1 / 3, b: 1 / 3, c: 1 / 3 })) < 1e-9);
  const m: MetaItem = { id: 'x', split: 'fit', labels: { q: true } };
  assert.deepEqual(score({ id: 'x', answers: { q: { type: 'noul', p: 0.2 } } }, m, 'q'), { id: 'x', label: true, answeredBy: undefined, stratum: undefined, q: 0.8, verdict: false, correct: false });
  assert.equal(score(undefined, m, 'q').q, null);
  assert.throws(() => score({ id: 'x', answers: { q: { type: 'score', score: 1 } } }, m, 'q'), /level is not a probability/);
});

test('error-detection AUROC: perfect ordering is 1, inverted is 0, one class absent is NaN', () => {
  const mk = (q: number, correct: boolean): Scored => ({ id: '', q, verdict: true, correct, label: 'x' });
  assert.equal(errorAuroc([mk(0.9, true), mk(0.8, true), mk(0.4, false), mk(0.3, false)]), 1);
  assert.equal(errorAuroc([mk(0.9, false), mk(0.3, true)]), 0);
  assert.ok(Number.isNaN(errorAuroc([mk(0.9, true), mk(0.3, true)])));
  const a = anchorChecks([mk(0.9, true), mk(0.5, false), mk(0.7, true), mk(0.6, false)], 0.5);
  assert.equal(a.labelAudit.length, 2);
  assert.equal(a.labelAudit[0].q, 0.5);
});

test('intent-routing (choice, 11 options): the whole workflow on 100 fit + 150 test recorded answers', () => {
  const d = load('intent-routing');
  const r = pipeline(cfg('intent-routing', 'domain', { stratumField: 'source', auditShare: 0.1 }), d.fit, d.test, d.meta, NOW);
  assert.equal(r.kind, 'choice');
  assert.equal(r.anchor.n, 100);
  assert.equal(r.anchor.labelAudit.length, 10);
  assert.ok(r.anchor.errorAuroc > 0.5, `AUROC ${r.anchor.errorAuroc}`);
  assert.ok(r.anchor.perStratum && Object.keys(r.anchor.perStratum).length >= 2);
  assert.equal(r.frozen.frozenAt, NOW.toISOString());
  assert.deepEqual(r.frozen.fittedOn.answeredBy, ['jev-1.13.0']);
  assert.equal(r.test.n, 150);
  assert.equal(r.ledger.length, 150);
  assert.equal(Object.values(r.routes).reduce((a, b) => a + b, 0), 150);
  // the selective gate needs no calibration, so G9 is a SKIP that says why
  const g9 = r.gates.results.find(g => g.id === 'G9-calibration-audited')!;
  assert.equal(g9.verdict, 'SKIP');
  // every accepted item carries the frozen cut in its ledger line
  for (const l of r.ledger) { assert.equal(l.gate.fittedOn, 'fit-split'); assert.equal(l.gate.maxError, 0.05); assert.equal(l.answeredBy, 'jev-1.13.0'); }
  // an item routed auto is one Jev answered with q ≥ hi and the gate held; when the bound broke, nothing is auto
  const autos = r.ledger.filter(l => l.routed.route === 'auto');
  if (!r.test.outcome.held) assert.equal(autos.length, 0);
  else for (const l of autos) assert.equal(l.verdict, true);
  assert.ok(renderReport(r).includes('routes:'));
});

test('youtube-spam (noul): verdict is p ≥ 0.5, so false verdicts route block, not auto', () => {
  const d = load('youtube-spam');
  const r = pipeline(cfg('youtube-spam', 'isSpam'), d.fit, d.test, d.meta, NOW);
  assert.equal(r.kind, 'noul');
  assert.equal(r.ledger.length, 150);
  const blocks = r.ledger.filter(l => l.routed.route === 'block');
  for (const l of blocks) assert.equal(l.verdict, false);
  assert.ok(r.ledger.every(l => ['auto', 'review', 'block', 'escalate_human'].includes(l.routed.route)));
});

test('the human classes and the envelope override every fitted number', () => {
  const d = load('intent-routing');
  const irreversible = pipeline({ ...cfg('x', 'domain'), effect: { effect: 'reversible', blast: 'low' }, envelope: 'not-supported' }, d.fit, d.test, d.meta, NOW);
  assert.deepEqual(Object.keys(irreversible.routes), ['escalate_human']);
  const escalate = pipeline({ ...cfg('x', 'domain'), envelope: 'escalate' }, d.fit, d.test, d.meta, NOW);
  assert.deepEqual(Object.keys(escalate.routes), ['review']);
});

test('refusals: no budget for the class, a score target, overlapping splits', () => {
  const d = load('intent-routing');
  assert.throws(() => pipeline({ ...cfg('x', 'domain'), effect: { effect: 'irreversible', blast: 'low' } }, d.fit, d.test, d.meta, NOW), /no error budget/);
  assert.throws(() => pipeline({ ...cfg('x', 'domain'), budgets: [] }, d.fit, d.test, d.meta, NOW), /no error budget/);
  assert.throws(() => pipeline(cfg('x', 'domain'), d.fit, d.fit, d.meta, NOW), /disjoint/);
  const y = load('youtube-spam');
  const withScore: ResultFile = { items: y.fit.items.map(r => ({ ...r, answers: { ...r.answers, lvl: { type: 'score', score: 1 } } })) };
  const metaWithScore = y.meta.map(m => ({ ...m, labels: { ...m.labels, lvl: 1 } }));
  assert.throws(() => pipeline(cfg('x', 'lvl'), withScore, { items: y.test.items.map(r => ({ ...r, answers: { ...r.answers, lvl: { type: 'score', score: 1 } } })) }, metaWithScore, NOW), /level is not a probability/);
});
