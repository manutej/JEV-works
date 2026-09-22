import type { Rule } from '../_shared/decide.ts';

/** Decision rule for intent-routing. The confidence cut is fitted on the fit split by decide.ts; only the error budget is chosen. */
export const rule: Rule = {
  kind: 'choice',
  target: 'domain',
  escalate: {
    maxAutoError: 0.05,
    why: 'A wrong auto-route costs a bounce: the user lands in the wrong skill (or an in-scope request is refused as none) and has to rephrase or be handed back. Auto-route only above the lowest confidence where the fit split made at most 1 error in 20; everything below goes to a clarifying question or a human.',
  },
};
