// kit core tests: no API calls. Run: node --test kit/kit.test.ts
// Written from an adversary's inputs (leads retro rule 4): malformed specs, overlapping splits, planted secrets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problems, parseSpec, toSdkQuestions, type Item } from './spec.ts';
import { mcnemarExact, paired, normEntropy } from './stats.ts';
import { disjointness, privacyScan, seenShare, stateText } from './checks.ts';
import { isCorrect, majorityOf } from './score.ts';

const q = { dept: { type: 'choice', instructions: 'Which team?', criteria: { billing: 'money', technical: 'bugs' } } };

test('spec: a valid minimal spec parses; SDK "boolean" is normalised to TypeSafe "noul"', () => {
  const s = parseSpec({ name: 'demo', questions: { ...q, urgent: { type: 'boolean', instructions: 'Urgent?' } }, items: [{ id: 'a', state: 'hi' }] });
  assert.equal(s.questions.urgent.type, 'noul');
  assert.equal((toSdkQuestions(s.questions) as Record<string, { type: string }>).urgent.type, 'boolean');
});

test('spec: every problem is reported at once, not just the first', () => {
  const errs = problems({ name: 'Bad Name', questions: { x: { type: 'yesno' }, y: { type: 'choice', instructions: 'i', criteria: { only: 'one' } }, z: { type: 'score', instructions: 'i', criteria: ['one'] } } });
  assert.ok(errs.some(e => e.startsWith('name')));
  assert.ok(errs.some(e => e.includes('x.type')));
  assert.ok(errs.some(e => e.includes('x.instructions')));
  assert.ok(errs.some(e => e.includes('y.criteria')));
  assert.ok(errs.some(e => e.includes('z.criteria')));
  assert.ok(errs.some(e => e.startsWith('items')));
});

test('spec: labels must fit their question type (a choice label must be an option)', () => {
  assert.throws(() => parseSpec({ name: 'demo', questions: q, items: [{ id: 'a', state: 's', labels: { dept: 'sales' } }] }), /not an option/);
  assert.throws(() => parseSpec({ name: 'demo', questions: q, items: [{ id: 'a', state: 's' }, { id: 'a', state: 't' }] }), /duplicate/);
});

test('stats: exact McNemar reproduces the lab\'s committed results', () => {
  assert.ok(Math.abs(mcnemarExact(25, 6) - 0.000878) < 2e-5);        // E5 HotpotQA (P33)
  assert.ok(Math.abs(mcnemarExact(30, 45) - 0.105) < 0.002);          // leads seed 2718
  assert.ok(mcnemarExact(6, 152) < 1e-36);                            // leads seed 7 (~1.1e-37)
  assert.equal(mcnemarExact(0, 0), 1);
  assert.equal(mcnemarExact(3, 3), 1);
});

test('stats: paired() counts discordant pairs and its CI is reproducible (seeded)', () => {
  const a = [true, true, false, true, false], b = [true, false, false, false, true];
  const p1 = paired(a, b), p2 = paired(a, b);
  assert.equal(p1.b, 2); assert.equal(p1.c, 1);
  assert.deepEqual(p1.deltaCI95, p2.deltaCI95);
  assert.throws(() => paired([true], [true, false]));
});

test('stats: entropy is 0 for a certain answer and 1 for a uniform one', () => {
  assert.equal(normEntropy({ a: 1, b: 0 }), 0);
  assert.ok(Math.abs(normEntropy({ a: 0.25, b: 0.25, c: 0.25, d: 0.25 }) - 1) < 1e-12);
});

test('checks: disjointness catches TEXT overlap even with fresh ids (L40)', () => {
  const items: Item[] = [
    { id: 'f1', state: 'Please refund me', split: 'fit' },
    { id: 't1', state: '  please   REFUND me ', split: 'test' },   // same text, new id, different spacing
    { id: 't2', state: 'Sync is broken', split: 'test' },
  ];
  const d = disjointness(items)!;
  assert.equal(d.idOverlap, 0);
  assert.equal(d.textOverlap, 1);
  assert.equal(d.seenShare, 0.5);
  const s = seenShare(items.filter(i => i.split === 'test'), items.filter(i => i.split === 'fit'), i => stateText(i.state));
  assert.deepEqual(s.seen.map(i => i.id), ['t1']);
});

test('checks: privacy scan flags planted secrets and never echoes them', () => {
  const hits = privacyScan([
    { id: 'e', state: { msg: 'reach me at jane.doe@example.com' } },
    { id: 'k', state: 'key sk-proj_ABCDEFGHIJKLMNOPQRSTUV' },
    { id: 'p', state: 'call (415) 555-0100 today' },
    { id: 'ok', state: 'Charged twice for September.' },
  ]);
  assert.deepEqual(hits.map(h => `${h.itemId}:${h.kind}`).sort(), ['e:email', 'k:api-key', 'p:phone']);
  assert.ok(!JSON.stringify(hits).includes('jane.doe'));
});

test('score: noul at 0.5, choice by key, score by nearest level; a non-answer is wrong', () => {
  const noul = { type: 'noul' as const, instructions: 'x' };
  assert.equal(isCorrect(noul, { type: 'noul', p: 0.5 }, true), true);
  assert.equal(isCorrect(noul, { type: 'noul', p: 0.49 }, true), false);
  assert.equal(isCorrect(noul, undefined, false), false);
  const sc = { type: 'score' as const, instructions: 'x', criteria: ['a', 'b', 'c'] };
  assert.equal(isCorrect(sc, { type: 'score', score: 1.4 }, 1), true);
  assert.equal(isCorrect(sc, { type: 'score', score: 1.6 }, 1), false);
  assert.equal(majorityOf(['a', 'b', 'b']), 'b');
});
