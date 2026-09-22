/**
 * kit/modules: the meta-type catches the question failures this lab measured, and every hydrated
 * output is accepted by the core's own validator.
 *
 *   /opt/homebrew/bin/node --test kit/modules/modules.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { problems } from '../spec.ts';
import { checkDecision } from '../gate/load.ts';
import { decide } from '../gate/decide.ts';
import { errorsOf, lintAtom, lintContext, type Atom, type Context } from './meta-type.ts';
import { atomsAsItems, toKitSpec, toMetaPrompt } from './hydrate.ts';

const ctx = (f: string): Context => JSON.parse(readFileSync(new URL(`./contexts/${f}`, import.meta.url), 'utf8'));
const CONTEXTS = ['craft.robustness-at-boundaries.json', 'meta.question-quality.json'];
const good: Atom = { type: 'noul', polarity: 'bad-when-yes', reads: ['code'], instructions: 'Does the code catch an error and ignore it?', criteria: { true: 'yes', false: 'no' } };
const rules = (a: Atom) => lintAtom('q', a, ['code'], 'q').map(f => `${f.severity}:${f.rule}`);

for (const f of CONTEXTS) {
  test(`${f}: passes the meta-type with no errors`, () => {
    const findings = lintContext(ctx(f));
    assert.deepEqual(errorsOf(findings), []);
  });
}

test('M2: comparison, counting and cross-record questions are rejected (P18/P21)', () => {
  for (const instructions of ['How many errors does this function raise?', 'Is this handler better than the other handlers?', 'Is this more careful than the usual code in the repo?'])
    assert.ok(rules({ ...good, instructions }).includes('error:M2-literal'), instructions);
});

test('M3: two questions, or none, are rejected; "and/or" warns', () => {
  assert.ok(rules({ ...good, instructions: 'Does it validate? Does it log?' }).includes('error:M3-one-question'));
  assert.ok(rules({ ...good, instructions: 'It validates input.' }).includes('error:M3-one-question'));
  assert.ok(rules({ ...good, instructions: 'Does it validate and/or log input?' }).includes('warn:M3-one-question'));
});

test('M1 uses the core validator; M4 polarity must fit the type; M5 reads must exist', () => {
  assert.ok(rules({ ...good, type: 'score', criteria: ['only one level'] as any, polarity: 'higher-is-better' }).includes('error:M1-typed'));
  assert.ok(rules({ ...good, polarity: 'higher-is-better' }).includes('error:M4-polarity'));
  assert.ok(rules({ ...good, reads: ['commitMessage'] }).includes('error:M5-reads'));
  assert.ok(rules({ ...good, reads: [] }).includes('error:M5-reads'));
});

test('M6 warns on undefined noul ends; M7 wants an escape option that exists', () => {
  assert.ok(rules({ ...good, criteria: undefined }).includes('warn:M6-decisive-ends'));
  const choice: Atom = { type: 'choice', polarity: 'neutral', reads: ['code'], instructions: 'Which host kind is written here?', criteria: { prod: 'p', local: 'l' } };
  assert.ok(rules(choice).includes('warn:M7-escape'));
  assert.ok(rules({ ...choice, escapeOption: 'none' }).includes('error:M7-escape'));
  assert.deepEqual(rules({ ...choice, criteria: { prod: 'p', none: 'n' }, escapeOption: 'none' }), []);
});

test('context: duplicate ids across modules and compose rules naming unknown questions are errors', () => {
  const c = ctx('craft.robustness-at-boundaries.json');
  c.modules[1].questions.readsExternalInput = c.modules[0].questions.readsExternalInput;
  c.modules[2].compose.rules[0].when = { q: 'noSuchQuestion', is: 'yes' };
  const rs = errorsOf(lintContext(c)).map(f => f.rule);
  assert.ok(rs.includes('C-unique') && rs.includes('C-compose'), rs.join(','));
});

test('hydrate: every module becomes a spec the core accepts, with meta annotations stripped', () => {
  const c = ctx('craft.robustness-at-boundaries.json');
  const items = [{ id: 'h1', state: { code: 'try { f() } catch {}', language: 'ts', filePath: 'a.ts' } }];
  for (const m of c.modules) {
    const spec = toKitSpec(c, m.name, items);
    assert.deepEqual(problems(spec), [], m.name);
    for (const q of Object.values(spec.questions)) assert.ok(!('polarity' in q) && !('reads' in q));
    assert.deepEqual(checkDecision(spec.decision, 'd', new Set(Object.keys(spec.questions))).errors, []);
  }
  assert.throws(() => toKitSpec(c, 'secrets', [{ id: 'x', state: { code: '', secretNotes: 'leak' } }]), /does not declare: secretNotes/);
  assert.throws(() => toKitSpec(c, 'nope', items), /no module "nope"/);
});

test('hydrate: the reviewer meta-prompt carries every question, rule and code hand-off, and no answers', () => {
  const c = ctx('craft.robustness-at-boundaries.json');
  const p = toMetaPrompt(c);
  for (const m of c.modules) for (const id of Object.keys(m.questions)) assert.ok(p.includes(`id="${id}"`), id);
  assert.match(p, /for_code judgement="Does a string match a known key format/);
  assert.match(p, /\{\{artifact\}\}/);
});

test('self-application: a context\'s questions become items the meta-type context can vet, as a valid spec', () => {
  const target = ctx('craft.robustness-at-boundaries.json');
  const meta = ctx('meta.question-quality.json');
  const items = atomsAsItems(target);
  assert.equal(items.length, 8);
  assert.deepEqual(problems(toKitSpec(meta, 'answerability', items)), []);
});

test('compose rules decide as written (input-validation, no model)', () => {
  const m = ctx('craft.robustness-at-boundaries.json').modules[0];
  const p = (x: number) => ({ type: 'boolean' as const, probability: x });
  assert.equal(decide({ readsExternalInput: p(0.05) }, m.compose).verdict, true);
  assert.equal(decide({ readsExternalInput: p(0.95), validatesBeforeUse: p(0.05), castWithoutCheck: p(0.05) }, m.compose).verdict, false);
  assert.equal(decide({ readsExternalInput: p(0.95), castWithoutCheck: p(0.95), validatesBeforeUse: p(0.95) }, m.compose).verdict, false);
  assert.equal(decide({ readsExternalInput: p(0.5) }, m.compose).verdict, 'escalate');
});

test('lintExceptions waive a named rule with a reason (reported as a warning); M1 and empty reasons never waive', () => {
  const cmp: Atom = { ...good, instructions: 'Does the message explicitly compare this product to a named competitor?' };
  assert.ok(rules(cmp).includes('error:M2-literal'));
  const waived = lintAtom('q', { ...cmp, lintExceptions: { 'M2-literal': 'asks whether THIS message compares us; one record answers it' } }, ['code'], 'q');
  assert.ok(waived.some(f => f.rule === 'M2-literal' && f.severity === 'warn' && f.message.startsWith('waived (')));
  assert.ok(rules({ ...cmp, lintExceptions: { 'M2-literal': '  ' } }).includes('error:M2-literal'));
  assert.ok(rules({ ...good, type: 'score', criteria: ['one'] as any, polarity: 'higher-is-better', lintExceptions: { 'M1-typed': 'no' } }).includes('error:M1-typed'));
});
