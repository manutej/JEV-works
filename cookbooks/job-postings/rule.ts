import type { Rule } from '../_shared/decide.ts';

/** Decision rule for job-postings. Every number below is fitted on the fit split by decide.ts; only the targets are chosen. */
export const rule: Rule = {
  kind: 'binary',
  target: 'isFraudulent',
  // The narrow signals only; isFraudulent (the broad question) is scored separately by the kit, so the two can be compared.
  features: ['asksForPaymentOrDetails', 'promisesEasyEarnings', 'describesCompany', 'directContactToApply', 'listsSpecificDuties'],
  threshold: {
    method: 'precision', min: 0.8,
    why: 'A false fraud flag takes down a real employer\'s ad and costs a paying customer a hire; a missed scam still meets the next line of defence (applicant reports, payment checks). So a flag must be right at least 4 times in 5 on the fit split before it acts. With 30 fit positives this is a coarse estimate, and the fit split is 30% fraud, not the ~5% seen live: live precision at the same cut will be lower.',
  },
  escalate: {
    maxAutoError: 0.05,
    why: 'Auto-remove or auto-keep only where the fit split made at most 1 error in 20; everything between goes to a human trust & safety reviewer, who also sees the code features (logo, salary, screening questions).',
  },
};
