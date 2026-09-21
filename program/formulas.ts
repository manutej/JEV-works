/**
 * Shared formula descriptions for E1 and E2 (PROGRAM.md).
 *
 * Every description names the MECHANISM the class denotes — never the label
 * itself. Same text goes to all 5 E1 labellers and to Jev in E2, so a
 * difference in results cannot be attributed to differently-worded options.
 *
 * `formula` values are the real, human-authored labels in
 * ceti-silver-hooks.json. They are read here only to build the *option set*
 * (the 9 keys) — never smuggled into a prompt as a per-item answer.
 */

export const FORMULA_DESCRIPTIONS: Record<string, string> = {
  'deprivation-moment':
    'Withholds one specific, desirable detail the reader wants resolved, creating a felt gap rather than stating the outcome.',
  'number-outcome-time':
    'Pairs a concrete quantified result with a bounded time frame, so the outcome and its speed are both made specific.',
  'call-out':
    'Directly addresses a named audience segment so a reader in that segment recognises themselves as the intended recipient.',
  'how-to-without':
    'Promises a method for reaching a desired result while explicitly removing a common cost, effort, or prerequisite normally assumed necessary.',
  'halbert-a-pile':
    'Uses vivid, concrete stacking or quantity imagery (piles, stacks, mountains) to make an abstract volume feel physically large.',
  'damaging-admission':
    'Opens with a self-directed confession of a failure or fault, trading a moment of credibility-risk for unexpected candour.',
  'adjective-good':
    'Strings together evaluative adjectives to characterise the offer or outcome as unambiguously positive, with little concrete, checkable detail.',
  'mistakes':
    'Centers on errors, misconceptions, or wrong approaches the reader may currently be taking, framed as a warning to correct course.',
  'receipt':
    'Presents a verifiable, dated, sourced, or literally-quoted piece of evidence (a screenshot, a quote, an exact figure) offered as proof rather than as a claim.',
};

export const FORMULA_KEYS = Object.keys(FORMULA_DESCRIPTIONS) as [string, ...string[]];

export type Hook = {
  id: string;
  text: string;
  channel: string;
  formula: string;
  source: string;
  swapTestPass: boolean;
  status: string;
};

export const CORPUS_PATH = '/Users/manu/CETI/PISCES-MARKETING/assets/ceti-silver-hooks.json';
