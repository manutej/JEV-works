/**
 * The migration to kit/modules/contexts/domain.leads.json changed nothing the pipeline asks:
 * the loader reproduces the frozen pre-migration snapshot exactly, and the context passes the meta-type.
 *
 *   /opt/homebrew/bin/node --test leads/questions.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEAD_QUESTION_SETS } from './questions.ts';
import { errorsOf, lintContext } from '../kit/modules/meta-type.ts';

test('the loaded question sets deep-equal the pre-migration snapshot (text, criteria, notForJev, recombine)', () => {
  const snap = JSON.parse(readFileSync(new URL('./fixtures/question-sets.v1.json', import.meta.url), 'utf8'));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(LEAD_QUESTION_SETS)), snap);
});

test('domain.leads passes the meta-type with no errors', () => {
  const ctx = JSON.parse(readFileSync(new URL('../kit/modules/contexts/domain.leads.json', import.meta.url), 'utf8'));
  assert.deepEqual(errorsOf(lintContext(ctx)), []);
});
