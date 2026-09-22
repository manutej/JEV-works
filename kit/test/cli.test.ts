// End-to-end CLI tests, fully offline: kit/run.ts runs as a child process with the fake TypeSafe server preloaded.
// Every exit path is exercised: usage 64, invalid spec 65, privacy 3, overlap 4, coverage gate 2, success 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'kit-cli-'));
const env = { ...process.env, TYPESAFE_API_KEY: 'test-key-not-real', JEV_BACKEND: 'direct', FAKE_TYPESAFE_FAIL: '', FAKE_TYPESAFE_TIE: '' };

function run(args: string[], extraEnv: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, ['--import', './kit/test/fake-typesafe.ts', 'kit/run.ts', ...args],
    { cwd: ROOT, env: { ...env, ...extraEnv }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}
let n = 0;
function spec(obj: unknown): string { const p = join(tmp, `spec-${n++}.json`); writeFileSync(p, JSON.stringify(obj)); return p; }

const Q = { dept: { type: 'choice', instructions: 'Which team?', criteria: { billing: 'refund charge invoice', technical: 'error broken sync', none: 'not a request' } } };
const good = (items: unknown[], extra = {}) => spec({ name: 'cli-test', questions: Q, items, ...extra });

test('no spec argument → usage, exit 64', () => {
  const r = run([]);
  assert.equal(r.code, 64);
  assert.match(r.out, /usage:/);
});

test('invalid spec → every problem listed, no stack trace, exit 65', () => {
  const r = run([spec({ name: 'Bad', questions: { x: { type: 'yesno' } }, items: [] })]);
  assert.equal(r.code, 65);
  assert.match(r.out, /name: required/);
  assert.match(r.out, /x\.type/);
  assert.doesNotMatch(r.out, /at parseSpec/);
});

test('privacy hit → refused before any call, match never printed, exit 3', () => {
  const log = join(tmp, 'priv.log');
  const r = run([good([{ id: 'a', state: 'contact me: jane.doe@example.com' }])], { FAKE_TYPESAFE_LOG: log });
  assert.equal(r.code, 3);
  assert.match(r.out, /a:email/);
  assert.doesNotMatch(r.out, /jane\.doe/);
  assert.equal(existsSync(log), false, 'no request may reach the API');
});

test('privacyScan:false lets it through (explicit opt-out only)', () => {
  const r = run([good([{ id: 'a', state: 'contact me: jane.doe@example.com' }], { privacyScan: false }), '--dry-run']);
  assert.equal(r.code, 0);
});

test('test/fit text overlap with a fresh id → refused (L40), exit 4; --accept-overlap proceeds', () => {
  const items = [
    { id: 'f1', split: 'fit', state: 'Please refund me' },
    { id: 't1', split: 'test', state: 'please  REFUND me' },
  ];
  const r = run([good(items), '--dry-run']);
  assert.equal(r.code, 4);
  assert.match(r.out, /text overlap 1/);
  assert.equal(run([good(items), '--dry-run', '--accept-overlap']).code, 0);
});

test('--dry-run makes zero API calls and prints the plan', () => {
  const log = join(tmp, 'dry.log');
  const r = run([good([{ id: 'a', state: 'refund please' }, { id: 'b', state: 'sync broken' }]), '--dry-run'], { FAKE_TYPESAFE_LOG: log });
  assert.equal(r.code, 0);
  assert.match(r.out, /plan: 2 Jev calls/);
  assert.equal(existsSync(log), false);
});

test('full offline run: scores, McNemar, result file with raw answers; key only in the auth header', () => {
  const log = join(tmp, 'full.log'), out = join(tmp, 'full-result.json');
  const items = [
    { id: 't1', state: 'please refund the double charge', labels: { dept: 'billing' }, baseline: { dept: 'billing' } },
    { id: 't2', state: 'the sync is broken with an error', labels: { dept: 'technical' }, baseline: { dept: 'billing' } },
    { id: 't3', state: 'asdf qwer', labels: { dept: 'none' }, baseline: { dept: 'technical' } },
  ];
  const r = run([good(items, { baselineName: 'kw' }), '--out', out], { FAKE_TYPESAFE_LOG: log });
  assert.equal(r.code, 0, r.out);
  const res = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(res.calls, 3);
  assert.equal(res.coverage, 1);
  assert.deepEqual(res.answeredBy, ['jev-1.13.0']);
  const card = res.scorecards.find((c: { question: string }) => c.question === 'dept');
  assert.equal(card.accuracy, 1);                 // fake answers billing / technical / none
  assert.equal(card.baseline.vsJev.b, 2);         // only Jev right on t2, t3
  assert.equal(card.baseline.vsJev.c, 0);
  assert.equal(res.items[0].answers.dept.type, 'choice');
  assert.equal(res.items[0].correct.dept, true);
  const reqs = readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.equal(reqs.length, 3);
  assert.ok(reqs.every(q => q.auth && !q.bodyHasKey), 'key must travel only in the Authorization header');
  assert.ok(reqs.every(q => q.model === 'jev-1.13.0'), 'default model must be the pinned version');
});

test('SDK boolean in the spec reaches the wire as TypeSafe noul', () => {
  const log = join(tmp, 'noul.log');
  const r = run([spec({ name: 'noul-wire', questions: { u: { type: 'boolean', instructions: 'Is it urgent today?' } }, items: [{ id: 'a', state: 'urgent today' }] }), '--out', join(tmp, 'noul.json')], { FAKE_TYPESAFE_LOG: log });
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(readFileSync(log, 'utf8').trim()).types.u, 'noul');
});

test('API failures lower coverage and trip the coverage gate → exit 2; failures are recorded, not dropped', () => {
  const out = join(tmp, 'gate.json');
  const items = [{ id: 'a', state: 'refund me' }, { id: 'b', state: 'BOOM sync error' }];
  const r = run([good(items, { gate: { minCoverage: 0.95 } }), '--out', out], { FAKE_TYPESAFE_FAIL: 'BOOM' });
  assert.equal(r.code, 2, r.out);
  const res = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(res.coverage, 0.5);
  assert.equal(res.gate.verdict, 'REFUSE');
  assert.match(res.items.find((i: { id: string }) => i.id === 'b').error, /500/);
});

test('rounding tie from the API is repaired to the argmax, not a crash', () => {
  const r = run([good([{ id: 'a', state: 'refund me' }]), '--out', join(tmp, 'tie.json')], { FAKE_TYPESAFE_TIE: '1' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1\/1 answered/);
});

test('result files are never overwritten', () => {
  const out = join(tmp, 'once.json');
  const s = good([{ id: 'a', state: 'refund me' }]);
  assert.equal(run([s, '--out', out]).code, 0);
  const r = run([s, '--out', out]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /never overwritten/);
});

test('every run writes the standard gate report into its result file', () => {
  const out = join(tmp, 'gates.json');
  const r = run([good([{ id: 'a', state: 'refund me' }], { gate: { minCoverage: 0.9 } }), '--out', out]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /gates: ACCEPT/);
  const res = JSON.parse(readFileSync(out, 'utf8'));
  assert.deepEqual(res.gates.results.map((g: { id: string }) => g.id), ['G1-spec-valid', 'G2-privacy', 'G3-text-disjoint', 'G4-coverage']);
  assert.equal(res.gates.verdict, 'ACCEPT');
});
