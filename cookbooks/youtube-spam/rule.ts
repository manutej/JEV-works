import type { Rule } from '../_shared/decide.ts';

/** Decision rule for youtube-spam. Every number below is fitted on the fit split by decide.ts; only the costs are chosen. */
export const rule: Rule = {
  kind: 'binary',
  target: 'isSpam',
  // The narrow signals only; isSpam (the broad question) is scored separately by the kit, so the two can be compared.
  features: ['asksToVisit', 'mentionsVideo', 'offersMoney', 'kind=promotion', 'kind=request', 'kind=reaction'],
  threshold: {
    method: 'cost', fpCost: 3, fnCost: 1,
    why: 'Hiding a genuine comment (false positive) silences a real person and costs a moderator appeal; a missed spam comment is one more link in a thread. 3:1 is a moderation-team convention, not a measured cost.',
  },
  escalate: {
    maxAutoError: 0.05,
    why: 'Auto-hide or auto-keep only where the fit split made at most 1 error in 20; everything between goes to the moderation queue.',
  },
};
