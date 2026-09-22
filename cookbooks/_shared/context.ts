/**
 * cookbooks/_shared/context.ts — emit cookbooks/<domain>/context.json in the kit/modules registry format
 * (feat/kit: kit/modules/meta-type.ts; Context → modules[] → Atom). spec.json stays the runnable kit spec.
 *
 *   /opt/homebrew/bin/node cookbooks/_shared/context.ts
 *
 * The questions are copied verbatim from spec.json (the measured wording); only polarity, reads and escapeOption
 * are added. `compose` is a kit/gate Decision and can only use what that format expresses (noul ends, choices), so it
 * composes on what was MEASURED: the direct decision question where Jev was asked one, or the escape option of a
 * choice. The measured recombination (logistic regression + fitted band, rule.frozen.json) is not expressible there;
 * each context's description says so. No loader: this only writes JSON.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMAINS, ROOT, load, type DomainId } from './load.ts';
import { STORIES } from './stories.ts';

type Pol = 'good-when-yes' | 'bad-when-yes' | 'neutral';
type Cfg = { module: string; purpose: string; polarity: Record<string, Pol>; escape?: Record<string, string>; compose: object; composeNote: string };

const directCompose = (q: string, positive: string) => ({
  positive, rules: [{ when: { q, is: 'yes' }, then: true }, { when: { q, is: 'no' }, then: false }], default: 'escalate',
});
const inScopeCompose = (q: string, escape: string, positive: string) => ({
  positive, rules: [{ when: { q, choice: escape }, then: false }], default: true,
});

const DIRECT = `${((load('youtube-spam').direct?.accuracy ?? NaN) * 100).toFixed(1)}%`;

const CFG: Record<DomainId, Cfg> = {
  'youtube-spam': {
    module: 'comment-spam', purpose: 'Is a public comment advertising, channel-farming or a money offer, rather than a genuine reaction?',
    polarity: { isSpam: 'bad-when-yes', asksToVisit: 'bad-when-yes', mentionsVideo: 'good-when-yes', offersMoney: 'bad-when-yes', kind: 'neutral' },
    escape: { kind: 'none' },
    compose: directCompose('isSpam', 'comment is spam'),
    composeNote: `compose acts on the direct question isSpam at its confident ends (measured by the kit at p ≥ 0.5: ${DIRECT} on test). The cookbook\'s own rule is a logistic regression over the narrow questions, frozen in rule.frozen.json.`,
  },
  'intent-routing': {
    module: 'skill-routing', purpose: 'Which of ten assistant skill areas owns this request, or none of them?',
    polarity: { domain: 'neutral', asksAction: 'neutral', mentionsMoney: 'neutral', aboutAssistant: 'neutral' },
    escape: { domain: 'none' },
    compose: inScopeCompose('domain', 'none', 'request is in scope for a skill'),
    composeNote: 'compose returns in-scope unless Jev picked the escape option; the routed area is the choice itself, gated by the confidence cut in rule.frozen.json.',
  },
  'review-triage': {
    module: 'complaint-triage', purpose: 'Should customer care read this product review (the reviewer would not recommend the item)?',
    polarity: { wouldNotRecommend: 'bad-when-yes', returned: 'bad-when-yes', fitProblem: 'bad-when-yes', flawDescribed: 'bad-when-yes', differsFromListing: 'bad-when-yes', likesItem: 'good-when-yes', mainIssue: 'neutral' },
    escape: { mainIssue: 'none' },
    compose: directCompose('wouldNotRecommend', 'review needs customer-care follow-up'),
    composeNote: 'compose acts on the direct question wouldNotRecommend at its confident ends. The cookbook\'s own rule is a logistic regression over the narrow questions, frozen in rule.frozen.json.',
  },
  'contract-clauses': {
    module: 'clause-type', purpose: 'Which review playbook does this contract provision belong to, or none of the eight?',
    polarity: { clauseType: 'neutral', namesJurisdiction: 'neutral', saysAgreementEnds: 'neutral', requiresCoveringLosses: 'neutral', restrictsDisclosure: 'neutral' },
    escape: { clauseType: 'other' },
    compose: inScopeCompose('clauseType', 'other', 'provision is one of the eight reviewed clause types'),
    composeNote: 'compose returns true unless Jev picked `other`; the type is the choice itself, gated by the confidence cut in rule.frozen.json.',
  },
  'job-postings': {
    module: 'job-ad-fraud', purpose: 'Does this job ad show literal signs of recruitment fraud?',
    polarity: { asksForPaymentOrDetails: 'bad-when-yes', promisesEasyEarnings: 'bad-when-yes', describesCompany: 'good-when-yes', directContactToApply: 'bad-when-yes', listsSpecificDuties: 'good-when-yes' },
    compose: { positive: 'job ad is fraudulent', rules: [{ when: { q: 'asksForPaymentOrDetails', is: 'yes' }, then: 'escalate' }], default: 'escalate' },
    composeNote: 'No verdict is composed (the single rule only escalates): the broad question was moved to code after the pilot, and the measured rule (a logistic regression over these signals) caught only 13% of fraud on test; a naive Bayes on 1,843 labelled ads did significantly better. Every item escalates; use these atoms as features, not as a verdict.',
  },
  'issue-triage': {
    module: 'issue-type', purpose: 'Is this GitHub issue a bug report, a feature request or a question, or not an issue at all?',
    polarity: { issueType: 'neutral', hasErrorOutput: 'neutral', hasReproSteps: 'neutral', asksHowTo: 'neutral', proposesNew: 'neutral' },
    escape: { issueType: 'none' },
    compose: inScopeCompose('issueType', 'none', 'item is a real issue'),
    composeNote: 'compose returns true unless Jev picked `none`; the label is the choice itself, gated by the confidence cut in rule.frozen.json. Measured weakness: issues maintainers label "question" (48% on test).',
  },
};

const ARTIFACT: Record<DomainId, string> = {
  'youtube-spam': 'public YouTube comment, with the video it was posted under',
  'intent-routing': 'one user utterance to a virtual assistant',
  'review-triage': 'one product review (title and text, no star rating)',
  'contract-clauses': 'one contract provision (heading stripped, up to 250 words)',
  'job-postings': 'one job advertisement (text fields, truncated)',
  'issue-triage': 'one GitHub issue (title and body, truncated)',
};

for (const id of DOMAINS) {
  const spec = JSON.parse(readFileSync(join(ROOT, id, 'spec.json'), 'utf8'));
  const S = STORIES[id], c = CFG[id];
  const stateFields = [...new Set((spec.items as { state: Record<string, unknown> }[]).flatMap(i => Object.keys(i.state)))];
  const questions = Object.fromEntries(Object.entries(spec.questions as Record<string, Record<string, unknown>>).map(([qid, q]) => {
    const atom: Record<string, unknown> = { ...q, polarity: c.polarity[qid], reads: stateFields };
    if (c.escape?.[qid]) atom.escapeOption = c.escape[qid];
    if (S.roles[qid]) atom.note = S.roles[qid];
    return [qid, atom];
  }));
  const missing = Object.keys(questions).filter(q => !c.polarity[q]);
  if (missing.length) throw new Error(`${id}: no polarity for ${missing.join(', ')}`);
  const ctx = {
    name: `domain:${id}`,
    description: `${S.area}: ${S.oneLine} Questions verbatim from cookbooks/${id}/spec.json (measured wording). ${c.composeNote}`,
    artifact: { type: ARTIFACT[id], stateFields },
    modules: [{ name: c.module, purpose: c.purpose, questions, compose: c.compose, notForJev: S.notForJev.map(([judgement, instead]) => ({ judgement, instead })) }],
  };
  writeFileSync(join(ROOT, id, 'context.json'), JSON.stringify(ctx, null, 2) + '\n');
}
console.log(`wrote ${DOMAINS.length} context.json files`);
