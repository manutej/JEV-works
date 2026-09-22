/**
 * kit/gate: the decider and scoring policy, tested on synthetic cases and by REPLAY: leads' real
 * stage-1 and stage-2 rules, written as JSON, must reproduce every recorded pipeline outcome.
 *
 *   /opt/homebrew/bin/node --test kit/gate/gate.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide, holds, normalizedEntropy, type Answer, type Decision } from './decide.ts';
import { scoreVerdict as isCorrect } from './policy.ts';
import { checkAnswers, checkDecision, checkGateConfig, checkGateInput, checkPolicy, loadDecision, loadPolicy } from './load.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const yes: Answer = { type: 'boolean', probability: 0.95 };
const no: Answer = { type: 'boolean', probability: 0.05 };
const mid: Answer = { type: 'boolean', probability: 0.5 };

test('noul acts only at its confident ends', () => {
  assert.equal(holds({ q: 'a', is: 'yes' }, { a: yes }), true);
  assert.equal(holds({ q: 'a', is: 'yes' }, { a: mid }), false);
  assert.equal(holds({ q: 'a', is: 'unsure' }, { a: mid }), true);
  assert.equal(holds({ q: 'a', is: 'no' }, { a: { type: 'boolean', probability: 0.15 } }), true); // boundary is inclusive
});

test('a missing answer never fires a rule (it is unknown, not false)', () => {
  const d: Decision = { positive: 'x', rules: [{ when: { not: { q: 'gone', is: 'yes' } }, then: true }], default: 'escalate' };
  assert.deepEqual(decide({}, d), { verdict: 'escalate', rule: 'default' });
  assert.equal(holds({ any: [{ q: 'gone', is: 'yes' }, { q: 'a', is: 'yes' }] }, { a: yes }), true);
  assert.equal(holds({ all: [{ q: 'gone', is: 'yes' }, { q: 'a', is: 'yes' }] }, { a: yes }), undefined);
});

test('a question of the wrong type is unknown, not a silent match', () => {
  assert.equal(holds({ q: 'a', choice: 'x' }, { a: yes }), undefined);
  assert.equal(holds({ q: 'a', scoreAtLeast: 1 }, { a: yes }), undefined);
});

test('entropy: uniform is 1, certain is 0', () => {
  assert.ok(Math.abs(normalizedEntropy({ a: 0.5, b: 0.5 }) - 1) < 1e-12);
  assert.equal(normalizedEntropy({ a: 1, b: 0, c: 0 }), 0);
});

test('first matching rule wins, in order', () => {
  const d: Decision = { positive: 'x', rules: [{ when: { q: 'a', is: 'yes' }, then: false }, { when: { q: 'a', is: 'yes' }, then: true }], default: 'escalate' };
  assert.deepEqual(decide({ a: yes }, d), { verdict: false, rule: 0 });
});

test('policy v1: escalation is never correct; v2: only on adversarial rows (policies loaded from JSON)', () => {
  const LEADS_V1 = loadPolicy(new URL('./examples/leads-policy-v1.json', import.meta.url).pathname);
  const LEADS_V2 = loadPolicy(new URL('./examples/leads-policy-v2.json', import.meta.url).pathname);
  assert.equal(isCorrect('escalate', false, { category: 'adversarial' }, LEADS_V1), false);
  assert.equal(isCorrect('escalate', false, { category: 'adversarial' }, LEADS_V2), true);
  assert.equal(isCorrect('escalate', true, { category: 'clean_in_icp' }, LEADS_V2), false);
  assert.equal(isCorrect(true, true, {}, LEADS_V1), true);
  assert.equal(isCorrect(false, true, {}, LEADS_V2), false);
});

// Replay: the JSON rules must reproduce the pipeline's recorded outcomes on every seed run with the
// current stage rules (p6029, 6011, and 42's dev run, where the new stage-2 rule changes nothing).
// p3001 was run BEFORE the buyingSignal rule, so it is tested separately below.
const outcome = { true: 'admit', false: 'reject', escalate: 'escalate' } as const;
const outcome2 = { true: 'qualified', false: 'not_qualified', escalate: 'escalate' } as const;
for (const seed of ['p6029', '6011', '42']) {
  test(`replay seed ${seed}: JSON stage rules reproduce every recorded stage-1 and stage-2 outcome`, () => {
    const s1: Decision = json('./examples/leads-stage1.decision.json');
    const s2: Decision = json('./examples/leads-stage2.decision.json');
    const run = json(`../../leads/results/pipeline-${seed}.json`).results as any[];
    let n1 = 0, n2 = 0;
    const bad: string[] = [];
    for (const r of run) {
      if (r.stage1) {
        n1++;
        const got = outcome[String(decide(r.stage1.answers, s1).verdict) as 'true'];
        if (got !== r.stage1.outcome) bad.push(`${r.leadId} stage1: rule ${got}, recorded ${r.stage1.outcome}`);
      }
      if (r.stage2) {
        n2++;
        const got = outcome2[String(decide(r.stage2.answers, s2).verdict) as 'true'];
        if (got !== r.stage2.outcome) bad.push(`${r.leadId} stage2: rule ${got}, recorded ${r.stage2.outcome}`);
      }
    }
    assert.ok(n1 > 400 && n2 > 200, `replayed ${n1} stage-1 and ${n2} stage-2 decisions`);
    assert.deepEqual(bad.slice(0, 5), [], `${bad.length} mismatches`);
  });
}

test('replay p3001 (run under the old stage-2 rule): differs on exactly the 50 leads the new rule rejects', () => {
  const s2: Decision = json('./examples/leads-stage2.decision.json');
  const run = json('../../leads/results/pipeline-p3001.json').results as any[];
  const truth = json('../../leads/corpus/truth-p3001.json');
  const diff = run.filter(r => r.stage2 && outcome2[String(decide(r.stage2.answers, s2).verdict) as 'true'] !== r.stage2.outcome);
  assert.equal(diff.length, 50);
  assert.ok(diff.every(r => r.stage2.outcome === 'qualified' && r.stage2.answers.buyingSignal.probability <= 0.15));
  assert.ok(diff.every(r => truth[r.leadId].trueQualified === false), 'every lead the new rule flips is truly not qualified');
});

test('boundary: every example JSON validates, with the questions it names', () => {
  const stage1 = new Set(['isRealBusiness', 'hasNamedCompany', 'senderWroteASentence', 'onTopicParseable', 'isEmptyOrMarkup']);
  assert.ok(loadDecision(new URL('./examples/leads-stage1.decision.json', import.meta.url).pathname, stage1));
  assert.ok(loadDecision(new URL('./examples/leads-stage2.decision.json', import.meta.url).pathname));
});

test('boundary: a bad decision reports every problem at once', () => {
  const { errors } = checkDecision({
    rules: [{ when: { q: 'nope', is: 'maybe' }, then: 'yes' }, { when: { q: 'a', is: 'yes', choice: 'x' }, then: true }],
    thresholds: { yes: 0.2, no: 0.8 },
  }, 'd', new Set(['a']));
  const text = errors.join(' | ');
  for (const want of ['d.positive', 'd.thresholds', 'd.rules[0].when.q: "nope"', 'd.rules[0].when.is', 'd.rules[0].then', 'd.rules[1].when: exactly one', 'd.default'])
    assert.ok(text.includes(want), `missing error for ${want}: ${text}`);
});

test('boundary: policy, gate config and answers are checked, unknown settings are rejected', () => {
  assert.ok(checkPolicy({ version: 'v3' }, 'p').errors.some(e => e.includes('declaredBeforeData')));
  assert.ok(checkGateConfig({ alpha: 0.05, minStrata: 8 }, 'g').errors.some(e => e.includes('g.minStrata: unknown setting')));
  assert.equal(checkAnswers({ a: { type: 'boolean', probability: 1.5 }, b: { type: 'yesno', p: 0.5 } }, 'x').errors.length, 2);
  assert.deepEqual(checkAnswers({ a: { type: 'choice', choice: 'x' } }, 'x').errors, []);
});

test('boundary: kit/run.ts results ({type:"noul", p}) and SDK answers normalise to one shape', () => {
  const run = JSON.parse(readFileSync(new URL('../results/support-routing-2026-09-22.json', import.meta.url), 'utf8'));
  const item = (run.items ?? run.results ?? run)[0];
  const { value, errors } = checkAnswers(item.answers, 'item0');
  assert.deepEqual(errors, []);
  for (const a of Object.values(value!)) assert.ok(['boolean', 'choice', 'score'].includes(a.type));
  assert.deepEqual(checkAnswers({ a: { type: 'noul', p: 0.9 } }).value, { a: { type: 'boolean', probability: 0.9 } });
});

// Adversarial boundary review (MoE, boundary lens) regressions: each failed on the pre-fix load.ts.
test('review P1: deeply nested conditions are an error, not an uncaught RangeError', () => {
  let c: any = { q: 'a', is: 'yes' };
  for (let i = 0; i < 50_000; i++) c = { not: c };
  const r = checkDecision({ positive: 'x', rules: [{ when: c, then: true }], default: false });
  assert.ok(r.errors.some(e => e.includes('nested deeper than')), r.errors.join(' | '));
});

test('review P1: a question id named __proto__ is rejected, not silently dropped', () => {
  const raw = JSON.parse('{"__proto__": {"type": "noul", "p": 0.9}, "a": {"type": "noul", "p": 0.1}}');
  assert.ok(checkAnswers(raw).errors.some(e => e.includes('reserved name')));
});

test('review P2: a NaN score is rejected at the boundary (it would read as a confident false)', () => {
  assert.ok(checkAnswers({ s: { type: 'score', score: NaN } }).errors.some(e => e.includes('finite number')));
  assert.ok(checkDecision({ positive: 'x', rules: [{ when: { q: 's', scoreAtLeast: NaN }, then: true }], default: false }).errors.length > 0);
});

test('review P3: malformed probability maps are rejected', () => {
  assert.ok(checkAnswers({ c: { type: 'choice', choice: 'x', probabilities: { x: 'high' } } }).errors.length === 1);
  assert.ok(checkAnswers({ c: { type: 'choice', choice: 'x', probabilities: [0.5, 0.5] } }).errors.length === 1);
});

test('review P1: the claim gate input is validated (bad reports cannot flip ACCEPT/REFUSE)', () => {
  const ok = { seed: 's', role: 'holdout', seenShare: 0.05, coverage: 0.97, minCoverage: 0.95, policy: 'v2', policyDeclaredBeforeSeed: true,
    headline: { name: 'all', n: 10, b: 3, c: 1 }, categories: [] };
  assert.deepEqual(checkGateInput(ok).errors, []);
  const e = checkGateInput({ ...ok, role: 'Holdout', coverage: 1.5, headline: { name: 'all', n: 3, b: 3, c: 1 }, policyDeclaredBeforeSeed: 'yes' }).errors.join(' | ');
  for (const want of ['role', 'coverage', 'headline', 'policyDeclaredBeforeSeed']) assert.ok(e.includes(want), `${want}: ${e}`);
});
