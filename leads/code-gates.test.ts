/**
 * Dedup must catch resubmissions and must NOT merge different people at the same company.
 *
 *   /opt/homebrew/bin/node --test leads/code-gates.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectNearDuplicates, representativesAndDuplicates } from './code-gates.ts';
import type { Lead, TruthMap } from './types.ts';

const base: Lead = {
  id: 'L000',
  source: 'webform',
  companyName: 'Acme Corp',
  industry: 'B2B SaaS',
  employeeBand: '201-1000',
  country: 'US',
  contactTitle: 'VP of Engineering',
  inboundMessage: 'We need SSO for 400 seats before Q3.',
  websiteBlurb: 'Acme Corp builds b2b saas products for growing teams.',
  tags: [],
  capturedAt: '2026-09-01T00:00:00.000Z',
};
const lead = (id: string, over: Partial<Lead> = {}): Lead => ({ ...base, id, ...over });
const mergedIds = (leads: Lead[]) => detectNearDuplicates(leads).map(g => [...g.leadIds].sort());

test('three contacts at one company, no domain, different messages: stays three leads', () => {
  const leads = [
    lead('L001'),
    lead('L002', { contactTitle: 'Chief Revenue Officer', inboundMessage: 'Looking at pricing for the sales team.' }),
    lead('L003', { contactTitle: 'Software Engineer', inboundMessage: 'Does your API support webhooks?' }),
  ];
  assert.deepEqual(mergedIds(leads), []);
});

test('verbatim resubmission with cosmetic name drift merges', () => {
  assert.deepEqual(mergedIds([lead('L001'), lead('L002', { companyName: 'ACME CORP', contactTitle: 'Founder & CEO' })]), [['L001', 'L002']]);
  assert.deepEqual(mergedIds([lead('L001'), lead('L002', { companyName: 'Acme Corp, Inc.' })]), [['L001', 'L002']]);
});

test('a "following up" forward of the same message merges', () => {
  const fwd = lead('L002', { inboundMessage: `Following up on behalf of my colleague — ${base.inboundMessage}` });
  assert.deepEqual(mergedIds([lead('L001'), fwd]), [['L001', 'L002']]);
});

test('same message but a different firmographic record does not merge', () => {
  assert.deepEqual(mergedIds([lead('L001'), lead('L002', { country: 'DE' })]), []);
  assert.deepEqual(mergedIds([lead('L001'), lead('L002', { companyName: 'Other Corp' })]), []);
});

test('empty messages and empty names never merge', () => {
  assert.deepEqual(mergedIds([lead('L001', { inboundMessage: '' }), lead('L002', { inboundMessage: '' })]), []);
  assert.deepEqual(mergedIds([lead('L001', { companyName: '' }), lead('L002', { companyName: '' })]), []);
});

test('seed-42 corpus: merges match planted duplicates within ±5%, and point at the right source', () => {
  const leads: Lead[] = JSON.parse(readFileSync(new URL('./corpus/leads-42.json', import.meta.url), 'utf8'));
  const truth: TruthMap = JSON.parse(readFileSync(new URL('./corpus/truth-42.json', import.meta.url), 'utf8'));
  const planted = Object.values(truth).filter(t => t.category === 'near_duplicate').length;

  const { duplicatesOf } = representativesAndDuplicates(detectNearDuplicates(leads));
  assert.ok(Math.abs(duplicatesOf.size - planted) <= planted * 0.05, `merged ${duplicatesOf.size}, planted ${planted}`);

  // Every short-circuited lead must share a planted origin with its representative.
  const origin = (id: string) => truth[id].duplicateOf ?? id;
  for (const [dup, rep] of duplicatesOf) assert.equal(origin(dup), origin(rep), `${dup} merged into unrelated ${rep}`);
});
