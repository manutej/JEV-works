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

// Review findings: raw substring containment merged these. Colleagues share a fingerprint
// (firmographics and blurb are company-level), so the message is all that keeps them apart.
test('a short message does not swallow a colleague whose message contains it', () => {
  const long = 'Can you send pricing? We have 400 seats and need SSO before the Q3 rollout.';
  assert.deepEqual(mergedIds([lead('L001', { inboundMessage: 'pricing' }), lead('L002', { inboundMessage: long })]), []);
});

test('containment is by whole words: "hi" is not inside "this"', () => {
  const a = lead('L001', { inboundMessage: 'hi' });
  const b = lead('L002', { inboundMessage: 'this is our third vendor evaluation this quarter for single sign-on' });
  assert.deepEqual(mergedIds([a, b]), []);
});

test('three colleagues sharing one company record, one with a generic message: stays three', () => {
  const leads = [
    lead('L001', { inboundMessage: 'test' }),
    lead('L002', { inboundMessage: 'We want the latest pricing for 400 seats and an SSO add-on quote.' }),
    lead('L003', { inboundMessage: 'Our auditors need your SOC 2 attestation reports before we can sign.' }),
  ];
  assert.deepEqual(mergedIds(leads), []);
});

test('a forward chain of long messages is one inquiry', () => {
  const m = 'We need SSO for 400 seats before Q3 and a security review.';
  const leads = [
    lead('L001', { inboundMessage: m }),
    lead('L002', { inboundMessage: `Following up — ${m}` }),
    lead('L003', { inboundMessage: `Forwarding again: Following up — ${m} Any update?` }),
  ];
  assert.deepEqual(mergedIds(leads), [['L001', 'L002', 'L003']]);
});

for (const seed of [42, 7]) {
  test(`seed-${seed} corpus: merges match planted duplicates within 5%, each to its true source`, () => {
    const leads: Lead[] = JSON.parse(readFileSync(new URL(`./corpus/leads-${seed}.json`, import.meta.url), 'utf8'));
    const truth: TruthMap = JSON.parse(readFileSync(new URL(`./corpus/truth-${seed}.json`, import.meta.url), 'utf8'));
    const planted = Object.entries(truth).filter(([, t]) => t.category === 'near_duplicate').map(([id]) => id);

    const { duplicatesOf } = representativesAndDuplicates(detectNearDuplicates(leads));
    assert.ok(Math.abs(duplicatesOf.size - planted.length) <= planted.length * 0.05, `merged ${duplicatesOf.size}, planted ${planted.length}`);

    // Every short-circuited lead must share a planted origin with its representative.
    const origin = (id: string) => truth[id].duplicateOf ?? id;
    for (const [dup, rep] of duplicatesOf) assert.equal(origin(dup), origin(rep), `${dup} merged into unrelated ${rep}`);
  });
}
