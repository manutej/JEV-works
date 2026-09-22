/** Word pools shared by generate-corpus.ts and tests. Order matters: the seeded PRNG indexes into them. */
export const ICP_INDUSTRIES = ['B2B SaaS', 'Fintech', 'DevTools', 'Cybersecurity', 'Cloud Infrastructure', 'HR Tech'] as const;
export const CURRENT_SOLUTIONS = ['a spreadsheet', 'an in-house script', 'Zapier', 'a legacy on-prem tool', 'nothing formal yet'] as const;
