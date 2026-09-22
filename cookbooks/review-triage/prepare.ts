/**
 * review-triage/prepare.ts — build spec.json from the Women's E-Commerce Clothing Reviews, deterministically.
 *
 *   /opt/homebrew/bin/node cookbooks/review-triage/prepare.ts
 *
 * Source: Kaggle "Women's E-Commerce Clothing Reviews" by nicapotato (2018), CC0: Public Domain
 *   https://www.kaggle.com/datasets/nicapotato/womens-ecommerce-clothing-reviews  (licence read from Kaggle's
 *   dataset API: licenseNameNullable = "CC0: Public Domain"). 23,486 real, anonymised reviews from one retailer;
 *   the company name is already replaced by "retailer" upstream.
 * Fetched as the unmodified upstream CSV from a Hugging Face mirror, pinned to a revision and checked by SHA-1
 *   (URL-fetchable without a Kaggle login; the mirror declares no licence of its own, the content is the CC0 file):
 *   https://huggingface.co/datasets/abayuu/Womens_Clothing_E-Commerce_Reviews/resolve/347c89d65bba300ee98cd105c523ccadc8c8a813/Womens%20Clothing%20E-Commerce%20Reviews.csv
 *   (byte-identical copy, same git blob, at Censius-AI/ECommerce-Women-Clothing-Reviews; a CC0 parquet repack with a
 *   CITATION.cff is at chibifire/kaggle-womens-ecom-clothing-reviews, not used because the rows API rate-limits.)
 * Citation: nicapotato (2018), "Women's E-Commerce Clothing Reviews", Kaggle, CC0.
 *
 * Label: Recommended IND (1 = the reviewer recommends the product). Our target is its negation, wouldNotRecommend.
 * What we keep: title, review text, and the product class ("Dresses", "Knits" ...). DROPPED: age (personal data),
 * clothing_id, positive_feedback_count, row_id, and the star RATING — rating is near-deterministic of the label
 * (it would leak it), so Jev never sees it. Emails and phone numbers are masked (maskPrivate).
 * Reviews are truncated in code to 400 words (the upstream cap is ~500 characters, so this almost never bites).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dedupe, fetchFile, keywordBaseline, maskPrivate, parseCsv, report, shuffle, stratified, writeSpecs, type Built } from '../_shared/lib.ts';
import type { Question } from '../../kit/spec.ts';

const SEED = 20260922;
const URL = 'https://huggingface.co/datasets/abayuu/Womens_Clothing_E-Commerce_Reviews/resolve/347c89d65bba300ee98cd105c523ccadc8c8a813/Womens%20Clothing%20E-Commerce%20Reviews.csv';
const SHA1 = '0593955f59a86a4adbb56ac2630ee3e11f05754d';
const MAX_WORDS = 400;

export const QUESTIONS: Record<string, Question> = {
  // THE DECISION (labelled). Polarity: true = positive class = a complaint the CX team should see.
  wouldNotRecommend: {
    type: 'noul',
    instructions: 'Based on this product review, would the reviewer NOT recommend this item to other shoppers?',
    criteria: {
      true: 'The reviewer is disappointed with the item overall and would not suggest others buy it.',
      false: 'The reviewer is satisfied overall and would suggest others buy it, even if they mention a minor flaw.',
    },
  },
  // Narrow, literal signals (recombined in code by rule.ts; none is labelled).
  // Polarity: + (a return is the clearest literal sign of an unhappy purchase).
  returned: {
    type: 'noul',
    instructions: 'Does the reviewer say they returned the item, are returning it, or will send it back?',
  },
  // Polarity: + (the most common complaint in clothing reviews).
  fitProblem: {
    type: 'noul',
    instructions: 'Does the reviewer say the item did not fit them: too big, too small, too long, too short, too tight, too loose, or the wrong shape for their body?',
  },
  // Polarity: + (defect / damage / construction is what a CX or quality team acts on).
  flawDescribed: {
    type: 'noul',
    instructions: 'Does the reviewer describe a flaw in the item itself: arrived damaged, a hole, a tear, loose threads, pilling, fading, shrinking, see-through fabric, a broken zipper, or fabric or stitching that feels cheap?',
  },
  // Polarity: + (mismatch with the listing: a catalogue/photo issue, not a sizing one).
  differsFromListing: {
    type: 'noul',
    instructions: 'Does the reviewer say the item looked different in person than in the online photo or description (a different colour, pattern, fabric or cut)?',
  },
  // Polarity: − (explicit praise; the counterweight that stops a review with a small gripe being flagged).
  likesItem: {
    type: 'noul',
    instructions: 'Does the reviewer say they love, like, or are happy with the item?',
  },
  // Unlabelled context for the CX queue (routing, not the flag). Polarity: `none` is −, every other option is +.
  mainIssue: {
    type: 'choice',
    instructions: 'What problem with the item does the reviewer give as the reason they are unhappy? If they give several, pick the one they mention first.',
    criteria: {
      fit: 'Size or fit: the item was too big, too small, too long, too short, or cut wrong for their body',
      quality: 'A defect or damage: holes, tears, pilling, broken parts, poor stitching, fabric that feels cheap or wears out',
      appearance: 'How it looks, while it fits and is not defective: the colour, pattern or style is different from the photo, or unflattering on them',
      other: 'A problem that is none of the above: price, delivery, comfort, smell, care instructions, or something else',
      none: 'No problem: the reviewer is not unhappy with the item, or mentions no problem at all',
    },
  },
};

const csvPath = await fetchFile(URL, 'womens-clothing-ecommerce-reviews.csv');
const csv = readFileSync(csvPath);
const sha = createHash('sha1').update(csv).digest('hex');
if (sha !== SHA1) throw new Error(`source CSV changed: sha1 ${sha}, expected ${SHA1}`);
const rows = parseCsv(csv.toString('utf8'));
type Rec = { title: string; review: string; category: string; label: 'notRec' | 'rec'; row: number };
const truncate = (s: string) => { const w = s.split(/\s+/); return w.length > MAX_WORDS ? w.slice(0, MAX_WORDS).join(' ') + ' …' : s; };
const all: Rec[] = rows
  .filter(r => r['Review Text'].trim().length > 0 && (r['Recommended IND'] === '0' || r['Recommended IND'] === '1'))
  .map(r => ({
    title: maskPrivate(r.Title.trim()),
    review: maskPrivate(truncate(r['Review Text'].trim())),
    category: r['Class Name'].trim() || 'Unknown',
    label: r['Recommended IND'] === '0' ? 'notRec' : 'rec',
    row: Number(r['']),
  }));
const pool = dedupe(shuffle(all, SEED), r => `${r.title} ${r.review}`);
const nNot = pool.filter(r => r.label === 'notRec').length;
console.log(`source: ${rows.length} rows read, ${all.length} with review text, ${pool.length} after dedupe (${nNot} not recommended, ${(100 * nNot / pool.length).toFixed(1)}%)`);

// Balanced 50/50 (natural not-recommended rate ~18%): at 18% a 150-item test set would hold only ~27 positives, too
// few to compare Jev with the baseline. Balance is a sampling choice, stated in NOTES; costs in rule.ts are set
// knowing the fit prior is 50%, not 18%. Fit 100, test 150, disjoint by construction.
const fit = stratified(pool, r => r.label, { notRec: 50, rec: 50 });
const rest = pool.filter(r => !fit.includes(r));
const test = stratified(rest, r => r.label, { notRec: 75, rec: 75 });

const text = (r: Rec) => `${r.title} ${r.review}`;
const base = keywordBaseline(fit.map(r => ({ text: text(r), label: r.label })));
console.log('baseline keywords:', JSON.stringify(base.keywords));
const build = (r: Rec, i: number, split: 'fit' | 'test'): Built => ({
  id: `${split === 'fit' ? 'f' : 't'}${String(i + 1).padStart(3, '0')}`,
  state: r.title ? { category: r.category, title: r.title, review: r.review } : { category: r.category, review: r.review },
  labels: { wouldNotRecommend: r.label === 'notRec' },
  baseline: split === 'test' ? { wouldNotRecommend: base.predict(text(r)) === 'notRec' } : undefined,
  split,
  meta: { source: 'Womens Clothing E-Commerce Reviews.csv', sourceRow: r.row },
});
const items = [...shuffle(fit, SEED + 1).map((r, i) => build(r, i, 'fit')), ...shuffle(test, SEED + 2).map((r, i) => build(r, i, 'test'))];
report(items, 'wouldNotRecommend');
writeSpecs(import.meta.dirname, {
  name: 'review-triage',
  description: "E-commerce CX triage: would the reviewer NOT recommend this clothing item (a complaint the CX team should see)? One direct question plus narrow literal signals recombined in code. Women's E-Commerce Clothing Reviews (Kaggle, CC0); star rating withheld (leaks the label), age and ids dropped.",
  questions: QUESTIONS, items, baselineName: base.name,
});
