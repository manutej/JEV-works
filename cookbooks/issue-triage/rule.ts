import type { Rule } from '../_shared/decide.ts';

/** Decision rule for issue-triage. The confidence cut is fitted on the fit split by decide.ts; only the error budget is chosen. */
export const rule: Rule = {
  kind: 'choice',
  target: 'issueType',
  escalate: {
    maxAutoError: 0.10,
    why: 'A wrong auto-label sends an issue to the wrong queue (a bug lands with the roadmap owner instead of on-call, or a question waits for a fix that never comes), but a triager re-labels it in seconds, and the ground truth here is itself maintainer labels with visible noise. Auto-label only above the confidence where the fit split erred at most 1 in 10; everything below stays in the human triage queue unlabelled.',
  },
};
