import type { Rule } from '../_shared/decide.ts';

/** Decision rule for review-triage. Every number below is fitted on the fit split by decide.ts; only the costs are chosen. */
export const rule: Rule = {
  kind: 'binary',
  target: 'wouldNotRecommend',
  // The narrow signals only; wouldNotRecommend (the broad question) is scored separately by the kit, so the two can be compared.
  features: ['returned', 'fitProblem', 'flawDescribed', 'differsFromListing', 'likesItem', 'mainIssue=none'],
  threshold: {
    method: 'cost', fpCost: 1, fnCost: 3,
    why: 'A missed unhappy customer (false negative) is a lost repeat buyer and an unanswered public complaint; a false flag costs a CX agent about a minute to read a satisfied review and close it. 3:1 favours recall without flooding the queue. Chosen, not measured; note the fit split is 50/50 while live traffic is ~18% not-recommended, so live precision will be lower than on fit.',
  },
  escalate: {
    maxAutoError: 0.1,
    why: 'Auto-flag or auto-skip only where the fit split made at most 1 error in 10: a wrong call here costs a minute or a delayed reply, not a safety or money decision, so a looser band than moderation (0.05) is acceptable; everything between goes to a human skim.',
  },
};
