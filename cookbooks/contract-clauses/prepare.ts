/**
 * contract-clauses/prepare.ts — build spec.json from LEDGAR (via LexGLUE), deterministically.
 *
 *   /opt/homebrew/bin/node cookbooks/contract-clauses/prepare.ts
 *
 * Source: https://huggingface.co/datasets/coastalcph/lex_glue (config `ledgar`; splits train 60k / validation 10k / test 10k)
 *   Licence: the dataset card lists LexGLUE as CC BY 4.0 (`license: cc-by-4.0`); LEDGAR's source text is SEC EDGAR
 *   filings (public SEC records), and the card's "Licensing Information" section says
 *   "[More Information Needed]" per sub-dataset, so CC BY 4.0 (card-level) is what we record.
 *   Tuggener, Säuberli, Oppliger & Tanner (2020), "LEDGAR: A Large-Scale Multi-label Corpus for Text Classification of
 *   Legal Provisions in Contracts", LREC 2020. Chalkidis et al. (2022), "LexGLUE: A Benchmark Dataset for Legal
 *   Language Understanding in English", ACL 2022.
 *   Provisions from material contracts filed on EDGAR; each labelled with one of 100 provision types (the label is the
 *   provision's original heading, normalised).
 *
 * What we keep: the provision text only. In LexGLUE the heading is already removed from nearly every provision; we still
 * strip a leading short "Title Case Heading." if one survives (same text for Jev and the baseline), truncate to 250
 * words, and mask emails/phone numbers (maskPrivate) plus street addresses and "Attention:" names that notice clauses
 * carry, before the kit's privacy scan.
 *
 * Fit comes from the first 5,000 rows of `validation`, test from the first 5,000 rows of `test` (5k each keeps the
 * HF rows API to 100 cached requests; the smallest chosen class still has 75+ rows per split).
 */
import { dedupe, hfAll, hfLabelNames, keywordBaseline, maskPrivate, report, shuffle, stratified, writeSpecs, type Built } from '../_shared/lib.ts';
import type { Question } from '../../kit/spec.ts';

const SEED = 20260922;
const DATASET = 'coastalcph/lex_glue', CONFIG = 'ledgar', ROWS = 5000, MAX_WORDS = 250;

/** The eight clause types we route, keyed by the LEDGAR label they come from. */
const TYPES: Record<string, string> = {
  'Governing Laws': 'governingLaw',
  'Notices': 'notices',
  'Entire Agreements': 'entireAgreement',
  'Amendments': 'amendment',
  'Terminations': 'termination',
  'Assignments': 'assignment',
  'Confidentiality': 'confidentiality',
  'Indemnifications': 'indemnification',
};
/**
 * Excluded from `other`: LEDGAR labels that are near-synonyms of a chosen type (their provisions do the same thing,
 * so an `other` label on them would score a correct answer as wrong), and the grab-bag headings whose provisions
 * mix several clause types.
 */
const EXCLUDED_FROM_OTHER = new Set(['Applicable Laws', 'Indemnity', 'Modifications', 'Integration', 'Assigns', 'Successors', 'Binding Effects', 'General', 'Miscellaneous']);

export const QUESTIONS: Record<string, Question> = {
  // The decision itself, labelled: which kind of clause is this? Options say what the clause DOES, not its heading.
  // Polarity: one option per LEDGAR type; `other` is the escape for any provision that does none of these.
  clauseType: {
    type: 'choice',
    instructions: 'This is one provision from a commercial contract. What does this provision mainly do?',
    criteria: {
      governingLaw: 'Chooses which jurisdiction\'s law will be used to interpret and enforce the agreement',
      notices: 'Sets out how formal communications between the parties must be delivered: in writing, by which method, to which address, and when they count as received',
      entireAgreement: 'Declares that the written agreement is the complete deal between the parties and replaces any earlier agreements, promises or understandings on the same subject',
      amendment: 'Sets out how the agreement (or part of it) can be changed, altered or modified, such as only by a signed writing or by a particular party',
      termination: 'Ends the agreement or a relationship, or sets out when and how it ends or may be ended and what happens at that point',
      assignment: 'Controls whether a party may transfer its rights or obligations under the agreement to someone else, and on what conditions',
      confidentiality: 'Requires a party to keep certain information secret or restricts how that information may be used or disclosed',
      indemnification: 'Requires one party to compensate, reimburse, hold harmless or defend another party for losses, claims, liabilities or expenses',
      other: 'Does something else: any other kind of provision (for example payment, representations, severability, counterparts, taxes, dispute venue), or none of the above is its main purpose',
    },
  },
  // Narrow, literal signals a legal-ops reviewer would tick; none is labelled.
  // Polarity: true → evidence for governingLaw (also true for venue/jurisdiction clauses and some notice addresses).
  namesJurisdiction: {
    type: 'noul',
    instructions: 'Does the provision name a specific U.S. state, country or other jurisdiction (for example "the State of Delaware", "New York", "England and Wales")?',
  },
  // Polarity: true → evidence for termination.
  saysAgreementEnds: {
    type: 'noul',
    instructions: 'Does the provision say that the agreement, or a party\'s rights or obligations under it, ends, terminates or may be terminated?',
  },
  // Polarity: true → evidence for indemnification.
  requiresCoveringLosses: {
    type: 'noul',
    instructions: 'Does the provision require one party to pay for, reimburse, hold harmless or defend another party against losses, claims, damages or expenses?',
  },
  // Polarity: true → evidence for confidentiality.
  restrictsDisclosure: {
    type: 'noul',
    instructions: 'Does the provision forbid or limit a party from disclosing or using certain information?',
  },
};

// ---------------------------------------------------------------- text cleaning (same text for Jev and the baseline)

/**
 * A leading "Governing Law." / "Use of Proceeds ." style heading: 1–6 capitalised words (plus small joiners) and a
 * period. Not stripped when it is really a sentence start or an abbreviation ("This Amendment No. 1", "Mr. Smith",
 * "B. Riley", "State of New York."): a first word in NOT_FIRST, a last word in NOT_LAST, or a one-letter word.
 */
const HEADING = /^\s*((?:[A-Z][A-Za-z'’&/-]*)(?:\s+(?:[A-Z][A-Za-z'’&/-]*|of|and|or|to|the|in|with|on|for|a|an))*)\s*\.\s+(?=\S)/;
const NOT_FIRST = new Set(['This', 'The', 'If', 'As', 'State', 'Each', 'Any', 'All', 'In', 'Upon', 'AND']);
const NOT_LAST = new Set(['No', 'Mr', 'Mrs', 'Ms', 'Dr', 'Inc', 'Co', 'Corp', 'Ltd', 'St', 'Jr', 'Sr', 'Section', 'Article']);
function stripHeading(s: string): { text: string; stripped: boolean } {
  const m = s.match(HEADING);
  const w = m ? m[1].split(/\s+/) : [];
  if (!m || w.length > 6 || NOT_FIRST.has(w[0]) || NOT_LAST.has(w[w.length - 1]) || w.some(x => x.length === 1)) return { text: s, stripped: false };
  return { text: s.slice(m[0].length), stripped: true };
}

function truncate(s: string): string {
  const w = s.split(/\s+/);
  return w.length <= MAX_WORDS ? s : w.slice(0, MAX_WORDS).join(' ') + ' …';
}

/** Street addresses and named recipients in notice clauses. Company addresses on EDGAR are public, but they are not needed. */
function maskContract(s: string): string {
  return maskPrivate(s)
    .replace(/\b(Attention|Attn\.?)\s*:?\s*[^,;\n()]{2,60}/g, '$1: [name]')
    .replace(/\b\d{1,6}\s+(?:[A-Z0-9][A-Za-z0-9.'-]*\s+){1,5}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Place|Plaza|Parkway|Pkwy\.?|Court|Ct\.?|Circle|Highway|Square|Center|Centre)\b\.?/g, '[street address]')
    .replace(/\b(?:Suite|Ste\.?|Floor|P\.?\s?O\.? Box)\s+[A-Z0-9-]+\b/g, '[address]')
    .replace(/\b\d{5}-\d{4}\b|(?<=\b[A-Z]{2},? )\d{5}\b/g, '[zip]');
}

// ---------------------------------------------------------------- load

const names = await hfLabelNames(DATASET, CONFIG, 'train', 'label');
for (const t of Object.keys(TYPES)) if (!names.includes(t)) throw new Error(`LEDGAR has no label ${t}`);
for (const t of EXCLUDED_FROM_OTHER) if (!names.includes(t)) throw new Error(`LEDGAR has no label ${t}`);

type Rec = { text: string; ledgar: string; label: string; split: 'validation' | 'test'; row: number; headingStripped: boolean };
async function load(split: 'validation' | 'test'): Promise<Rec[]> {
  const rows = await hfAll(DATASET, CONFIG, split, ROWS);
  return rows.map((r, row) => {
    const ledgar = names[r.label as number];
    const h = stripHeading(String(r.text).trim());
    return { text: maskContract(truncate(h.text.trim())), ledgar, label: TYPES[ledgar] ?? 'other', split, row, headingStripped: h.stripped };
  }).filter(r => r.text.length > 0 && !EXCLUDED_FROM_OTHER.has(r.ledgar));
}
const val = await load('validation'), tst = await load('test');
// Dedupe across BOTH splits at once (validation first), so no test text repeats a fit text.
const pool = dedupe([...shuffle(val, SEED), ...shuffle(tst, SEED + 3)], r => r.text);
const valPool = pool.filter(r => r.split === 'validation'), testPool = pool.filter(r => r.split === 'test');
console.log(`source: ${val.length} validation + ${tst.length} test provisions kept (of ${ROWS} each), ${pool.length} after dedupe; headings stripped: ${pool.filter(r => r.headingStripped).length}; contact details masked in ${pool.filter(r => /\[(?:email|phone number|street address|address|zip|name)\]/.test(r.text)).length}`);

/**
 * `other`: spread across as many LEDGAR labels as possible (round-robin by each label's shuffled order), so it is a
 * stratified sample of the long tail rather than 40% Counterparts and Severability.
 */
function spreadOther(recs: Rec[], n: number): Rec[] {
  const rank = new Map<Rec, number>(), seen: Record<string, number> = {};
  for (const r of recs) { seen[r.ledgar] = (seen[r.ledgar] ?? 0) + 1; rank.set(r, seen[r.ledgar]); }
  return recs.map((r, i) => ({ r, i })).sort((a, b) => rank.get(a.r)! - rank.get(b.r)! || a.i - b.i).slice(0, n).map(x => x.r);
}

// Quotas. Fit 100 = 8 types × 9 + 28 other (28%); test 150 = 8 × 14 + 38 other (25%).
// Equal per-type counts so per-class accuracy is comparable; `other` near a quarter so the escape class is really
// exercised (in the corpus the 92 non-chosen labels are ~80% of provisions; a real mix would drown the eight types).
const quota = (k: number) => Object.fromEntries(Object.values(TYPES).map(t => [t, k]));
const fit = [...stratified(valPool.filter(r => r.label !== 'other'), r => r.label, quota(9)), ...spreadOther(valPool.filter(r => r.label === 'other'), 28)];
const test = [...stratified(testPool.filter(r => r.label !== 'other'), r => r.label, quota(14)), ...spreadOther(testPool.filter(r => r.label === 'other'), 38)];
if (fit.filter(r => r.label === 'other').length !== 28 || test.filter(r => r.label === 'other').length !== 38) throw new Error('other quota short');

const base = keywordBaseline(fit.map(r => ({ text: r.text, label: r.label })));
console.log('baseline keywords:', JSON.stringify(base.keywords));
const build = (r: Rec, i: number, split: 'fit' | 'test'): Built => ({
  id: `${split === 'fit' ? 'f' : 't'}${String(i + 1).padStart(3, '0')}`,
  state: { provision: r.text },
  labels: { clauseType: r.label },
  baseline: split === 'test' ? { clauseType: base.predict(r.text) } : undefined,
  split,
  meta: { source: `lex_glue/ledgar/${r.split}`, sourceRow: r.row, ledgarLabel: r.ledgar, headingStripped: r.headingStripped },
});
const items = [...shuffle(fit, SEED + 1).map((r, i) => build(r, i, 'fit')), ...shuffle(test, SEED + 2).map((r, i) => build(r, i, 'test'))];
report(items, 'clauseType');
const otherLabels = (xs: Rec[]) => new Set(xs.filter(r => r.label === 'other').map(r => r.ledgar)).size;
console.log(`other spans ${otherLabels(fit)} LEDGAR labels in fit, ${otherLabels(test)} in test`);
writeSpecs(import.meta.dirname, {
  name: 'contract-clauses',
  description: 'Legal ops: route one contract provision to its clause type (8 types + other), with narrow literal signals beside it. LEDGAR via LexGLUE (CC BY 4.0), SEC EDGAR contracts; leading headings stripped, 250-word cap, contact details masked.',
  questions: QUESTIONS, items, baselineName: base.name,
});
