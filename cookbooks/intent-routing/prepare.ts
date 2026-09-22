/**
 * intent-routing/prepare.ts — build spec.json from CLINC150 (OOS+ variant), deterministically.
 *
 *   /opt/homebrew/bin/node cookbooks/intent-routing/prepare.ts
 *
 * Source: https://github.com/clinc/oos-eval (CC BY 3.0 Unported, LICENSE file in the repo; the HF mirror
 *   clinc/clinc_oos, config `plus`, declares cc-by-3.0 and is the same data).
 *   Data:    https://raw.githubusercontent.com/clinc/oos-eval/master/data/data_oos_plus.json
 *   Domains: https://raw.githubusercontent.com/clinc/oos-eval/master/data/domains.json (150 intents → 10 domains)
 *   Larson, Mahendran, Peper, Clarke, Lee, Hill, Kummerfeld, Leach, Laurenzano, Tang & Mars (2019),
 *   "An Evaluation Dataset for Intent Classification and Out-of-Scope Prediction", EMNLP-IJCNLP. aclanthology D19-1131.
 * Crowdsourced English utterances to a task assistant; 150 in-scope intents plus an out-of-scope (oos) class of
 * queries that match none of them. No personal data by construction; maskPrivate runs anyway.
 * What we keep: the utterance text only. The label is its intent's domain, or `none` for oos.
 */
import { dedupe, fetchText, keywordBaseline, maskPrivate, report, shuffle, stratified, writeSpecs, type Built, writeStrongBaseline } from '../_shared/lib.ts';
import type { Question } from '../../kit/spec.ts';

const SEED = 20260922;
const DATA_URL = 'https://raw.githubusercontent.com/clinc/oos-eval/master/data/data_oos_plus.json';
const DOMAINS_URL = 'https://raw.githubusercontent.com/clinc/oos-eval/master/data/domains.json';

const domains = JSON.parse(await fetchText(DOMAINS_URL)) as Record<string, string[]>;
const data = JSON.parse(await fetchText(DATA_URL)) as Record<'train' | 'oos_train' | 'test' | 'oos_test', [string, string][]>;
const intentDomain = new Map(Object.entries(domains).flatMap(([d, xs]) => xs.map(x => [x, d] as const)));

// One-line scope per domain (hand-written); the supported requests are the dataset's own intent names, not hand-typed.
const SCOPE: Record<string, string> = {
  banking: 'Bank accounts, bills and payments',
  credit_cards: 'Credit cards, card rewards and credit scores',
  kitchen_and_dining: 'Cooking, food and restaurants',
  home: 'Household organising: lists, reminders, calendar, music, shopping orders and smart-home devices',
  auto_and_commute: 'The car and getting around by road',
  travel: 'Trips abroad, flights, hotels and travel documents',
  utility: 'Everyday phone utilities: time, weather, alarms, timers, calls, texts, quick lookups and conversions',
  work: 'The user\'s job: pay, time off, benefits, taxes and meetings',
  small_talk: 'Chit-chat with the assistant about itself or social pleasantries',
  meta: 'Controlling the conversation or the assistant\'s own settings, and bare replies such as yes, no or maybe',
};
const human = (i: string) => i.replace(/_/g, ' ');
const domainCriteria: Record<string, string> = Object.fromEntries(
  Object.entries(domains).map(([d, xs]) => [d, `${SCOPE[d]}. The request is one of these supported tasks: ${xs.map(human).join('; ')}.`]));
domainCriteria.none = 'The request is not one of the supported tasks listed in any option above, even if it is about a similar topic (for example a banking or car question that is not one of the listed banking or car tasks), or it is a general-knowledge, news, maths or other request the assistant does not support.';

export const QUESTIONS: Record<string, Question> = {
  // The decision itself (labelled). 11 options: the dataset's 10 domains + `none` (out of scope), the escape option.
  domain: {
    type: 'choice',
    instructions: 'A user said this to a task assistant that supports only the tasks listed below. Which area does the request belong to? If it is not one of the listed supported tasks, answer none.',
    criteria: domainCriteria,
  },
  // Narrow, literal, unlabelled signals.
  // Polarity: true = the user asks the assistant to DO something (act, set, change, book, send), false = asks a question for information or makes small talk.
  asksAction: {
    type: 'noul',
    instructions: 'Does the user ask the assistant to perform an action or change something (for example set, book, send, play, add, cancel, change, turn on), rather than ask for information?',
  },
  // Polarity: true = money or a financial account is mentioned (routes towards banking / credit_cards / work pay).
  mentionsMoney: {
    type: 'noul',
    instructions: 'Does the utterance mention money, a payment, a bill, a price, a bank account, a credit card or pay?',
  },
  // Polarity: true = the utterance is about the assistant itself (its identity, name, voice, language, settings), which separates small_talk/meta from task domains.
  aboutAssistant: {
    type: 'noul',
    instructions: 'Is the utterance about the assistant itself: who or what it is, its name, its voice, its language, its speed or volume, or its settings?',
  },
};

type Rec = { text: string; intent: string; label: string; src: string; row: number };
const recs = (split: keyof typeof data): Rec[] => data[split].map(([t, intent], row) => ({
  text: maskPrivate(t.trim()), intent,
  label: intent === 'oos' ? 'none' : (intentDomain.get(intent) ?? (() => { throw new Error(`intent ${intent} has no domain`); })()),
  src: split, row,
}));
const fitSrc = [...recs('train'), ...recs('oos_train')];
const testSrc = [...recs('test'), ...recs('oos_test')];
console.log(`source: fit pool (train + oos_train) ${fitSrc.length}, test pool (test + oos_test) ${testSrc.length}`);

// Dedupe by normalised text across BOTH splits (fit side first), so no test utterance repeats any train utterance.
const clean = dedupe([...shuffle(fitSrc, SEED), ...shuffle(testSrc, SEED + 3)].filter(r => r.text.length > 0), r => r.text);
const fitPool = clean.filter(r => r.src.endsWith('train'));
const testPool = clean.filter(r => r.src.endsWith('test'));
console.log(`after dedupe: fit pool ${fitPool.length}, test pool ${testPool.length} (${fitSrc.length + testSrc.length - clean.length} duplicate texts dropped)`);

// Breadth: within each domain take at most one utterance per intent (pool order), so 8 / 12 distinct intents per domain.
const onePerIntent = (pool: Rec[]) => [...dedupe(pool.filter(r => r.label !== 'none'), r => r.intent), ...pool.filter(r => r.label === 'none')];
const quota = (perDomain: number, oos: number) => ({ ...Object.fromEntries(Object.keys(domains).map(d => [d, perDomain])), none: oos });
// fit 100 = 10 × 8 + 20 none (20%); test 150 = 10 × 12 + 30 none (20%). Out-of-scope is over-represented relative to the
// corpus (~6%) on purpose: the escape option is the point, and Jev does not abstain without one (NETER P5).
const fit = stratified(onePerIntent(fitPool), r => r.label, quota(8, 20));
const test = stratified(onePerIntent(testPool), r => r.label, quota(12, 30));

const base = keywordBaseline(fit.map(r => ({ text: r.text, label: r.label })));
console.log('baseline keywords:', JSON.stringify(base.keywords));
const build = (r: Rec, i: number, split: 'fit' | 'test'): Built => ({
  id: `${split === 'fit' ? 'f' : 't'}${String(i + 1).padStart(3, '0')}`,
  state: { utterance: r.text },
  labels: { domain: r.label },
  baseline: split === 'test' ? { domain: base.predict(r.text) } : undefined,
  split,
  meta: { source: r.src, sourceRow: r.row, intent: r.intent },
});
const items = [...shuffle(fit, SEED + 1).map((r, i) => build(r, i, 'fit')), ...shuffle(test, SEED + 2).map((r, i) => build(r, i, 'test'))];
report(items, 'domain');
writeSpecs(import.meta.dirname, {
  name: 'intent-routing',
  description: 'Assistant intent routing with real out-of-scope inputs: route an utterance to one of CLINC150\'s 10 domains or none. One labelled choice plus three narrow literal signals. CLINC150 OOS+ (CC BY 3.0).',
  questions: QUESTIONS, items, baselineName: base.name,
});

// Post-hoc (added after the labelled test run; no Jev calls; never changes a declared verdict): STRONG_BASELINE=1 also
// writes baseline.strong.json, a naive Bayes trained on up to 2,000 labelled source rows that are neither fit nor test.
if (process.env.STRONG_BASELINE) writeStrongBaseline(import.meta.dirname, {
  train: fitPool.filter(r => !fit.includes(r)),
  test: shuffle(test, SEED + 2).map((rec, i) => ({ id: `t${String(i + 1).padStart(3, '0')}`, rec })),
  textOf: r => r.text, labelOf: r => r.label, toValue: v => v, source: 'CLINC150 train + oos_train, rows not in fit', seed: SEED + 9,
});
