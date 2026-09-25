import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PROXIES, impliedRows as traceRows, hash16 as h1 } from './trace-implied.ts';
import { impliedRows as gmailRows, fromClass, CORA_TO_LANE } from './gmail-implied.ts';
import { inferAction, traceFromGit, unitsOf } from './git-trace.ts';

const fx = (f: string) => path.join(import.meta.dirname, 'fixtures', f);
const jsonl = (f: string) => readFileSync(fx(f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const proxiesOf = (rows: Record<string, unknown>[]) => rows.map((r) => `${r.q_key}=${r.label_value}:${(r.proxy as { name: string }).name}`).sort();

test('trace-implied: the deck sample yields the declared proxies and nothing else', () => {
  const rows = traceRows(jsonl('trace.deck.sample.jsonl'));
  assert.deepEqual(proxiesOf(rows), ['*=revise:sent_back', '*=ship:shipped_as_is', 'readableAtAGlance=false:shortened_after', 'readableAtAGlance=false:shortened_after', 'readableAtAGlance=true:shipped_short', 'readableAtAGlance=true:shipped_short']);
  for (const r of rows) { assert.equal(r.label_source, 'implied'); assert.equal(r.source, 'authoring'); assert.equal(r.aggregate, r.q_key === '*'); assert.match(String(r.labeled_by), /^proxy:/); }
});
test('trace-implied: course and page samples', () => {
  // section-1 was revised (added_example) right before shipping, so it is not 'shipped as is'
  assert.deepEqual(proxiesOf(traceRows(jsonl('trace.course.sample.jsonl'))), ['hasConcreteExample=false:added_example_after', 'teachesOneThing=false:split_after']);
  assert.deepEqual(proxiesOf(traceRows(jsonl('trace.page.sample.jsonl'))), ['hasExercise=false:added_exercise_after', 'hasExercise=true:shipped_with_exercise', 'wallOfText=true:broken_up_after']);
});
test('trace-implied: the label id is the hash ask.mjs uses for the same event', () => {
  const [e] = jsonl('trace.deck.sample.jsonl');
  const rows = traceRows([e, { ...e, seq: 1, action: 'shortened', ts: '2026-09-21T00:00:00Z' }]);
  assert.equal(rows[0].id, h1(`authoring:${e.trace_id}#${e.unit}@${e.seq}`));
});
test('trace-implied: proxy names and packs match trace-schema.json when the sibling checkout is present', () => {
  const schema = path.resolve(import.meta.dirname, '../../jev-elder/hub/wiring/trace-schema.json');
  if (!existsSync(schema)) return;
  const declared = JSON.parse(readFileSync(schema, 'utf8')).actions_to_labels as Record<string, { pack: string; q_key: string; label_value: unknown }>;
  for (const [name, p] of Object.entries(PROXIES)) { assert.ok(declared[name], `${name} is not declared in trace-schema.json`); assert.equal(declared[name].pack, p.pack, name); assert.equal(declared[name].q_key, p.q_key, name); }
});

test('git-trace: units, metrics and inferred actions from a two-commit repo', () => {
  const dir = mkdtempSync(path.join(process.env.SCRATCHPAD || tmpdir(), 'jev-git-'));
  try {
    const git = (...a: string[]) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    git('init', '-q'); const f = path.join(dir, 'page.html');
    writeFileSync(f, '<main><section id="a"><h2>Overview</h2><p>' + 'word '.repeat(100) + '</p></section><section id="b"><h2>Setup</h2><ul><li>one</li></ul><pre>x</pre></section></main>');
    git('add', '.'); git('commit', '-q', '-m', 'first');
    writeFileSync(f, '<main><section id="a"><h2>Overview</h2><p>' + 'word '.repeat(40) + '</p><p>Try it now.</p></section></main>');
    git('add', '.'); git('commit', '-q', '-m', 'second');
    const { commits, events } = traceFromGit(dir, 'page.html', { kind: 'page', traceId: 'page:test', purpose: 'p' });
    assert.equal(commits, 2);
    assert.deepEqual(events.map((e) => `${e.unit}:${e.action}`), ['a:created', 'b:created', 'a:shortened', 'b:cut']);
    const a0 = events[0] as { metrics: Record<string, number>; state: Record<string, unknown> }; assert.equal(a0.metrics.words, 101); assert.equal(a0.metrics.headings, 0);
    const b0 = events[1] as { metrics: Record<string, number>; state: Record<string, unknown> }; assert.equal(b0.metrics.bullets, 1); assert.equal(b0.state.has_code_sample, true);
    const a1 = events[2] as { metrics: Record<string, number> }; assert.equal(a1.metrics.exercises, 1);
    assert.ok(events.every((e) => e.actor === 'unknown'), 'authors are never read');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('git-trace: markdown units and action thresholds', () => {
  const u = unitsOf('# T\n\n## First\n\ntext here\n\n- a\n- b\n\n## Second\n\n```js\nx\n```\n', 'doc.md');
  assert.deepEqual(u.map((x) => x.unit), ['first', 'second']); assert.equal(u[0].metrics.bullets, 2); assert.equal(u[1].has_code_sample, true);
  assert.equal(inferAction(undefined, 5), 'created'); assert.equal(inferAction(100, 79), 'shortened'); assert.equal(inferAction(100, 121), 'expanded'); assert.equal(inferAction(100, 110), 'edited');
});

test('gmail-implied: sample export → rows per proxy, hashed ids, no subject or sender copied', () => {
  const exp = JSON.parse(readFileSync(fx('gmail-export.sample.json'), 'utf8'));
  const { rows, inputs, coverage } = gmailRows(exp, { asOf: '2026-09-25T12:00:00Z' });
  const by = (id: string) => rows.filter((r) => r.threadId === h1(id)).map((r) => `${r.q_key}=${r.label_value}:${(r.proxy as { name: string }).name}`).sort();
  assert.deepEqual(by('t1'), ['act=draft_reply:owner_replied', 'lane=collect:cora_to_lane', 'money_risk=true:payments_label', 'needs_reply=true:replied_3d']);
  assert.deepEqual(by('t2'), ['act=draft_reply:owner_replied', 'lane=deliver:cora_to_lane', 'needs_reply=true:replied_3d']);
  assert.deepEqual(by('t3'), ['act=ignore:bulk_ignored', 'lane=noise:cora_to_lane', 'money_risk=false:bulk_no_money', 'needs_reply=false:bulk_label']);
  assert.deepEqual(by('t5'), ['act=label:labeled_untouched', 'lane=remember:cora_to_lane', 'needs_reply=false:silent_14d']);
  assert.deepEqual(by('t6'), ['needs_reply=false:silent_14d'], 'Cora/Action maps to no lane; in INBOX so no act');
  assert.deepEqual(by('t7'), ['money_risk=true:money_subject'], 'owner started it: no reply proxy');
  assert.deepEqual(by('t8'), ['lane=collect:cora_to_lane', 'money_risk=true:payments_label'], 'capped preview: no reply proxy');
  const text = JSON.stringify(rows);
  assert.ok(!/@|invoice 2291|weekly digest|12 days overdue|vendor\.example/i.test(text), 'no address, subject or snippet in any row');
  assert.equal(inputs.length, exp.threads.length); assert.equal(inputs[0].from_class, 'vendor');
  assert.match(coverage, /threads seen: 8/); assert.match(coverage, /paper_missing \(hand label only\)/);
  assert.equal(fromClass('NoReply@shop.example', new Set(), new Set()), 'vendor'); assert.equal(CORA_TO_LANE['Cora/Action'], null);
});
