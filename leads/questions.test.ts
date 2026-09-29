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

// Questions added after the migration, each deliberately (a change in the context, reviewed in its commit).
const ADDED_SINCE_V1: Record<string, string[]> = { STAGE2_QUALIFICATION: ['asksToBuy', 'offersToUs'] };

test('every pre-migration question is unchanged; the only additions are the declared ones', () => {
  const snap = JSON.parse(readFileSync(new URL('./fixtures/question-sets.v1.json', import.meta.url), 'utf8'));
  const now = JSON.parse(JSON.stringify(LEAD_QUESTION_SETS));
  for (const [k, set] of Object.entries<any>(snap)) {
    const { questions: snapQ, ...rest } = set;
    const { questions: nowQ, ...nowRest } = now[k];
    assert.deepStrictEqual(nowRest, rest, `${k} metadata changed`);
    for (const [id, q] of Object.entries(snapQ)) assert.deepStrictEqual(nowQ[id], q, `${k}.${id} changed`);
    assert.deepEqual(Object.keys(nowQ).filter(id => !(id in snapQ)).sort(), (ADDED_SINCE_V1[k] ?? []).slice().sort(), `${k}: undeclared additions`);
  }
});

test('domain.leads passes the meta-type with no errors', () => {
  const ctx = JSON.parse(readFileSync(new URL('../kit/modules/contexts/domain.leads.json', import.meta.url), 'utf8'));
  assert.deepEqual(errorsOf(lintContext(ctx)), []);
});
