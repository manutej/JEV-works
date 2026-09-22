import type { Rule } from '../_shared/decide.ts';

/** Decision rule for contract-clauses. The confidence cut is fitted on the fit split by decide.ts; only the error budget is chosen. */
export const rule: Rule = {
  kind: 'choice',
  target: 'clauseType',
  escalate: {
    maxAutoError: 0.05,
    why: 'A mis-filed clause in a contract review means the clause is checked against the wrong playbook (or not at all) and costs a lawyer a re-read; auto-file only where the fit split made at most 1 error in 20, and send the rest to the review queue.',
  },
};
