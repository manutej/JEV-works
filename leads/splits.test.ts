/**
 * Every corpus must be declared, holdouts must name their fit seeds, and the seen/novel partition must
 * catch verbatim reuse — the p6029 failure (0 record overlap, 565/600 messages reused from dev).
 *
 *   /opt/homebrew/bin/node --test leads/splits.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { messagesOf, partitionBySeen, requireSplit, splitFor } from './splits.ts';
import type { Lead } from './types.ts';

test('every corpus file on disk has a declared split', () => {
  const seeds = readdirSync(new URL('./corpus/', import.meta.url))
    .map(f => f.match(/^leads-(.+)\.json$/)?.[1])
    .filter((s): s is string => !!s);
  assert.ok(seeds.length > 0);
  for (const s of seeds) assert.ok(splitFor(s), `corpus seed ${s} has no entry in corpus/splits.json`);
});

test('an undeclared seed is refused, naming the fix', () => {
  assert.throws(() => requireSplit('999999'), /not declared in leads\/corpus\/splits\.json/);
});

test('holdouts name only declared fit seeds, and never themselves', () => {
  for (const s of ['7', '2718', 'p6029', '6011']) {
    const split = requireSplit(s);
    assert.equal(split.role, 'holdout');
    assert.ok(!split.fitSeeds.includes(s));
  }
});

test('seen/novel partition reproduces the p6029 leakage: 565 of 600 messages seen', () => {
  const leads: Lead[] = JSON.parse(readFileSync(new URL('./corpus/leads-p6029.json', import.meta.url), 'utf8'));
  const parts = partitionBySeen(leads, messagesOf(requireSplit('p6029').fitSeeds));
  assert.equal(parts.seen.length, 565);
  assert.equal(parts.novel.length, 35);
});

test('partition normalises case and whitespace, so trivial edits do not count as novel', () => {
  const lead = (id: string, inboundMessage: string) => ({ id, inboundMessage }) as Lead;
  const parts = partitionBySeen([lead('a', '  Hello   THERE '), lead('b', 'something else')], new Set(['hello there']));
  assert.deepEqual(parts, { seen: ['a'], novel: ['b'] });
});
