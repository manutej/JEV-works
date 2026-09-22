/**
 * E3 question variants — one Jev `choice` over the same 9 formula keys, three wordings.
 *
 * v1 is E1/E2's wording, unchanged, as the control. v2 rewrites each option from what E1's consensus
 * revealed: where five strong labellers agreed and were still wrong, the description was describing a
 * different class than the human taxonomy meant (halbert-a-pile 0/6, adjective-good 0/5). v3 adds
 * disambiguation rules for the confusions E1 exposed.
 *
 * Built only from the 80 fit items. Descriptions name mechanism and form; examples quoted in them are
 * fit-set hooks, so the holdout cannot have shaped a single word here.
 */
import { FORMULA_DESCRIPTIONS } from './formulas.ts';

export type Variant = { instructions: string; criteria: Record<string, string> };

const BASE_INSTRUCTIONS = 'Which single mechanism does this marketing hook rely on most?';

// Per-class comments cite E1: consensus-correct / n, and where the consensus sent the misses.
const V2_CRITERIA: Record<string, string> = {
  // 12/21; lost 5 to call-out ("you" questions), 2 to mistakes.
  'deprivation-moment':
    "Evokes a specific, recognisable moment of the reader's current frustration or loss — a late-night desk, a Sunday rewrite, a tab closed in defeat, the fear of being left behind — as a scene, a pointed question, or a short aphorism, without offering a method, a number or proof.",
  // 10/15; lost to how-to-without and deprivation-moment when the figure was not a time saving.
  'number-outcome-time':
    'Carries its payload in figures: a before→after transformation ("6 hr → 90 min", "17 tabs → 1 brief"), a price, a count of seats or files, a duration, or a named deadline or day.',
  // 8/12; lost to deprivation-moment and how-to-without.
  'call-out':
    'Tells a particular kind of reader "this is for you": names the audience ("For solo consultants:"), greets them personally ("[NAME] —"), or positions the reader against what others do or offer ("They demo cats. You need your deck read.").',
  // 4/7; lost 2 to mistakes on "Stop X" lines.
  'how-to-without':
    'Promises the desired result while removing a cost, effort or prerequisite — "how to X without Y", or an imperative swap that drops the old burden for the new outcome ("Stop reading 40-page reports. Get a 1-page brief.", "You don\'t need another course — you need…").',
  // 0/6, 3 unanimous-wrong: the old "pile imagery" wording described a different idea entirely.
  'halbert-a-pile':
    'Reads like a personal email subject line from someone the reader knows: a short, usually lowercase fragment referring to a specific shared item ("re: the deck you sent Thursday", "that clause on page 12"), with no visible pitch, offer or selling language.',
  // 2/5; lost 2 to how-to-without on risk-reversal lines.
  'damaging-admission':
    'Volunteers something unflattering or risky up front: an admission that something failed or was not enough, a disclosed limitation ("AI is in the mix"), a concession that the reader may walk away ("if week one flops, you walk"), or what an unhappy customer said.',
  // 0/5; no labeller recognised the class.
  'adjective-good':
    'Names the offer itself as a characterful thing with an evaluative adjective or image ("A free AI win", "The lazy proposal-reader", "Furnished room, not another empty chat tab"), selling by how the thing is described rather than by numbers, method or proof.',
  // 2/5; lost to deprivation-moment, number-outcome-time, call-out.
  'mistakes':
    'Warns that the reader is doing something wrong or falling behind: named mistakes or bad habits, an error they may have missed, or a warning that others have already moved on without them.',
  // 1/4; lost 2 to deprivation-moment, 1 to number-outcome-time.
  'receipt':
    'Points to proof or credentials instead of making a claim: a receipt, citations, a comparison with an elite or named benchmark (a Fortune 500 standard, a named competitor and its price), or evidence already earned.',
};

// Option keys are the choice's own options, so naming them here tells Jev nothing about any one item.
const V3_INSTRUCTIONS = `${BASE_INSTRUCTIONS}
Judge the dominant device, and resolve these common overlaps as follows:
- A short, lowercase, subject-line fragment about a specific shared item is halbert-a-pile, whatever its topic.
- A question or scene about the reader's current pain is deprivation-moment unless it explicitly names who the audience is (then call-out).
- "Stop X. Do Y." that swaps a burden for a result is how-to-without, not mistakes.
- A price, seat count, deadline or before→after figure as the main payload is number-outcome-time, unless it compares against a named competitor or elite benchmark offered as proof (then receipt).
- A promise that the reader can walk away if it fails is damaging-admission, not how-to-without.`;

export const VARIANTS: Record<'v1' | 'v2' | 'v3', Variant> = {
  v1: { instructions: BASE_INSTRUCTIONS, criteria: FORMULA_DESCRIPTIONS },
  v2: { instructions: BASE_INSTRUCTIONS, criteria: V2_CRITERIA },
  v3: { instructions: V3_INSTRUCTIONS, criteria: V2_CRITERIA },
};

export type VariantName = keyof typeof VARIANTS;
