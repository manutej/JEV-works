import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREREG, cells, latest } from './report.ts';

const base = (o: Record<string, unknown>) => ({ schema_version: '0.1.0', ts: '2026-09-20T00:00:00Z', source: 'authoring', threadId: null, from_class: null, subject_hash: null, action: null, labels: [], model: 'jev-1.13.0', confidence: null, answers: null, routing_version: '0.2.0', row_id: 'r8', pack: 'works.kit.authoring-html-page', q_key: 'wallOfText', aggregate: false, primitive: 'noul', human_verdict: null, label_value: null, proxy: null, label_source: 'none', labeled_at: null, labeled_by: null, note: null, split: null, ...o });
const none = (id: string, p: number, ts = '2026-09-20T00:00:00Z') => base({ id, model_answer: p, model_p: p, ts });
const hand = (id: string, p: number, verdict: string, ts = '2026-09-20T00:00:00Z') => base({ id, model_answer: p, model_p: p, ts, label_source: 'hand', human_verdict: verdict, labeled_at: '2026-09-27T10:00:00Z', labeled_by: 'owner', label_value: verdict === 'agree' ? p >= 0.5 : verdict === 'disagree' ? !(p >= 0.5) : null });
const implied = (id: string, p: number, value: boolean) => base({ id, model_answer: p, model_p: p, label_source: 'implied', label_value: value, proxy: { name: 'broken_up_after', rule: 'x' }, labeled_at: '2026-09-27T10:00:00Z', labeled_by: 'proxy:broken_up_after' });

test('under 8 labels: INSUFFICIENT-DATA; mostly mid band with no labels: NO-INFORMATION', () => {
  const c1 = cells([none('a', 0.9), none('b', 0.1), hand('a', 0.9, 'agree')]);
  assert.equal(c1[0].verdict, 'INSUFFICIENT-DATA'); assert.equal(c1[0].n.hand_usable, 1); assert.equal(c1[0].agreement.hand_vs_model, 1);
  const c2 = cells(Array.from({ length: 9 }, (_, i) => none('m' + i, 0.5)));
  assert.equal(c2[0].verdict, 'NO-INFORMATION'); assert.equal(c2[0].bands.mid_share, 1);
});
test('agreement by source, never pooled; cannot_tell is not usable; excluded ids enter no number', () => {
  const rows = [] as any[];
  for (let i = 0; i < 10; i++) { const p = i < 5 ? 0.9 : 0.1; rows.push(none('h' + i, p)); rows.push(hand('h' + i, p, i === 9 ? 'disagree' : 'agree')); }
  rows.push(hand('h0', 0.9, 'cannot_tell')); // a second hand row by the same labeler on h0 with a later labeled_at would replace; here labeled_at equal → latest keeps last seen
  rows.push(none('fx', 0.5)); rows.push(hand('fx', 0.5, 'disagree'));
  rows.push(implied('h0', 0.9, false)); rows.push(implied('h1', 0.9, true));
  const [c] = cells(rows, new Set(['fx']));
  assert.equal(c.n.none, 10); assert.equal(c.n.hand, 10); assert.equal(c.n.hand_usable, 9, 'cannot_tell replaced h0 and is not usable');
  assert.equal(c.agreement.hand_vs_model, 8 / 9); assert.equal(c.n.implied_usable, 2); assert.equal(c.agreement.implied_vs_model, 0.5);
  assert.equal(c.n.both, 1, 'h0 hand is cannot_tell, so only h1 carries both a hand and an implied label'); assert.equal(c.agreement.hand_vs_implied, 1);
  assert.equal(c.verdict, 'JEV-SAFE'); assert.ok(c.calibration && c.calibration.source === 'hand' && c.calibration.n === 9);
  assert.ok(c.calibration!.gate, 'nine labels before the fit cut: a gate is fitted'); assert.equal(c.calibration!.gate!.fit_n, 9); assert.equal(c.calibration!.test, null);
});
test('time split: labels after the fit cut are test, never fit', () => {
  const rows = [] as any[];
  for (let i = 0; i < 12; i++) { const p = i % 2 ? 0.92 : 0.08; const ts = i < 9 ? '2026-09-20T00:00:00Z' : '2026-09-28T00:00:00Z'; rows.push(none('t' + i, p, ts)); rows.push(hand('t' + i, p, 'agree', ts)); }
  const [c] = cells(rows);
  assert.ok(c.calibration!.gate, 'gate fitted on the 9 fit rows'); assert.equal(c.calibration!.gate!.fit_n, 9); assert.equal(c.calibration!.gate!.fitted, true);
  assert.equal(c.calibration!.test!.n, 3); assert.equal(PREREG.fit_cut, '2026-09-27T00:00:00Z');
});
test('latest per identity keeps the later labeled_at', () => {
  const a = hand('x', 0.9, 'agree'); const b = { ...hand('x', 0.9, 'disagree'), labeled_at: '2026-09-27T11:00:00Z' };
  const l = latest([a, b]); assert.equal(l.length, 1); assert.equal(l[0].human_verdict, 'disagree');
});
