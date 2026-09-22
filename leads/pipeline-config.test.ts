/**
 * The pipeline's stage rules are data. Config v1 must reproduce every recorded decision exactly;
 * v3's band lookup must agree with the answer key's own band -> segment table.
 *
 *   /opt/homebrew/bin/node --test leads/pipeline-config.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPipelineConfig } from './pipeline-config.ts';
import { decide } from '../kit/gate/decide.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const O1 = { true: 'admit', false: 'reject', escalate: 'escalate' } as const;
const O2 = { true: 'qualified', false: 'not_qualified', escalate: 'escalate' } as const;

for (const seed of ['42', 'p6029', '6011', 'bb6203']) {
  test(`config v1 reproduces every recorded stage-1/2 outcome on seed ${seed}`, () => {
    const c = loadPipelineConfig('pipeline.v1.json');
    const bad: string[] = [];
    for (const r of json(`./results/pipeline-${seed}.json`).results) {
      if (r.stage1 && O1[String(decide(r.stage1.answers, c.stage1).verdict) as 'true'] !== r.stage1.outcome) bad.push(`${r.leadId} s1`);
      if (r.stage2 && O2[String(decide(r.stage2.answers, c.stage2).verdict) as 'true'] !== r.stage2.outcome) bad.push(`${r.leadId} s2`);
    }
    assert.deepEqual(bad, []);
  });
}

test('every config validates; provenance pins each file by hash', () => {
  for (const f of ['pipeline.v1.json', 'pipeline.v3.json']) {
    const c = loadPipelineConfig(f);
    assert.match(c.provenance.stage2, /@[0-9a-f]{16}$/);
  }
  assert.equal(loadPipelineConfig('pipeline.v3.json').segment, 'band-lookup');
});

test("v3's band -> segment table matches the corpus generator's (the answer key)", () => {
  const src = readFileSync(new URL('./pipeline.ts', import.meta.url), 'utf8');
  const table = JSON.parse(src.match(/BAND_SEGMENT: Record<string, Segment> = (\{[^}]*\})/)![1].replace(/'/g, '"'));
  const truth = json('./corpus/truth-42.json'), leads = json('./corpus/leads-42.json');
  let checked = 0;
  for (const l of leads) {
    const t = truth[l.id];
    if (t.category === 'clean_in_icp') { assert.equal(table[l.employeeBand], t.trueSegment, `${l.id} ${l.employeeBand}`); checked++; }
  }
  assert.ok(checked > 150);
});
