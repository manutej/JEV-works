/**
 * job-postings/prepare.ts — build spec.json from EMSCAD (fraudulent job ads), deterministically.
 *
 *   /opt/homebrew/bin/node cookbooks/job-postings/prepare.ts
 *
 * Source data: EMSCAD, the Employment Scam Aegean Dataset, University of the Aegean, Laboratory of Information &
 *   Communication Systems Security. 17,880 real job ads published 2012–2014, manually annotated: 17,014 legitimate,
 *   866 fraudulent. Original: https://emscad.samos.aegean.gr/ (download behind a login; the page states no licence).
 * Fetched from (one CSV, pinned commit a751f55): Hugging Face mirror victor/real-or-fake-fake-jobposting-prediction (fake_job_postings.csv, 17,880 rows)
 *   https://huggingface.co/datasets/victor/real-or-fake-fake-jobposting-prediction — dataset card: license cc0-1.0.
 *   The same file is Kaggle shivamb/real-or-fake-fake-jobposting-prediction, which the Kaggle API lists as
 *   "CC0: Public Domain". Neither mirror is the original authors; the CC0 is the mirrors' declaration (see NOTES.md).
 * Citation: Vidros, S., Kolias, C., Kambourakis, G., & Akoglu, L. (2017). "Automatic Detection of Online Recruitment
 *   Frauds: Characteristics, Methods, and a Public Dataset." Future Internet 9(1):6. doi:10.3390/fi9010006
 *
 * What we keep (the state): title, location (country + city only), employment_type, and truncated company_profile,
 *   description, requirements, benefits — about 360 words at most, cut in code on word boundaries.
 * What we drop: job_id (kept only in items.meta.json), department, salary_range, industry, function, required_*,
 *   and the structured flags has_company_logo / telecommuting / has_questions (code features, not Jev questions).
 * Privacy: the source already replaced contacts with #EMAIL_<sha>#, #PHONE_<sha>#, #URL_<sha>#; we normalise those to
 *   [email] / [phone number] / [url], then run maskPrivate, then writeSpecs re-runs the kit's privacy scan.
 */
import { dedupe, fetchFile, keywordBaseline, maskPrivate, parseCsv, report, shuffle, stratified, writeSpecs, type Built } from '../_shared/lib.ts';
import { readFileSync } from 'node:fs';
import type { Question } from '../../kit/spec.ts';

const SEED = 20260922;
// Pinned to the mirror's commit so the bytes never change under us.
const URL = 'https://huggingface.co/datasets/victor/real-or-fake-fake-jobposting-prediction/resolve/a751f55136a26da3c36e26aa207a9e187ca24b45/fake_job_postings.csv';

// Word budgets per field, so the whole state stays under ~400 words (title/location/type add ~15).
const BUDGET = { company_profile: 60, description: 150, requirements: 80, benefits: 50 } as const;

export const QUESTIONS: Record<string, Question> = {
  // The decision itself, asked directly: the ONE labelled question, scored by the kit against the keyword baseline.
  // Polarity: true = fraud.
  isFraudulent: {
    type: 'noul',
    instructions: 'Is this job posting fraudulent: a scam or a fake job ad rather than a genuine vacancy at a real employer?',
    criteria: {
      true: 'The ad exists to deceive applicants: there is no real job as described, or the aim is to take money, personal details or unpaid work from people who respond.',
      false: 'The ad describes a genuine vacancy that an employer is trying to fill, even if it is badly written, vague or unattractive.',
    },
  },
  // Narrow, literal signals about this one ad (recombined in code by rule.ts; none is labelled).
  // Polarity: true → more likely fraud.
  asksForPaymentOrDetails: {
    type: 'noul',
    instructions: 'Does the posting ask applicants to pay anything (a fee, training, equipment, a starter kit) or to send bank account, payment card or identity-document details?',
  },
  // Polarity: true → more likely fraud.
  promisesEasyEarnings: {
    type: 'noul',
    instructions: 'Does the posting promise earnings that come quickly, easily, from home, or without experience or qualifications (for example "earn from home", "no experience needed, start earning today", "unlimited income")?',
  },
  // Polarity: true → more likely legitimate.
  describesCompany: {
    type: 'noul',
    instructions: 'Does the posting name the hiring company and say what that company does (its products, services or line of business)?',
  },
  // Polarity: true → more likely fraud. Contact details are masked as [email], [phone number], [url]; the question
  // asks whether the ad directs applicants to such a contact, not what the contact is.
  directContactToApply: {
    type: 'noul',
    instructions: 'Does the posting tell applicants to apply or get in touch by contacting someone directly (an email address, a phone number, a text message or a messaging app) rather than by applying through the posting or a company application process?',
  },
  // Polarity: true → more likely legitimate.
  listsSpecificDuties: {
    type: 'noul',
    instructions: 'Does the posting describe specific tasks or responsibilities that the person hired would carry out in this job?',
  },
};

// ---------------------------------------------------------------- clean

const ENT: Record<string, string> = { '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': "'", '&lsquo;': "'", '&rdquo;': '"', '&ldquo;': '"', '&ndash;': '-', '&mdash;': '-' };

function clean(s: string | null | undefined): string {
  if (!s) return '';
  const t = s
    .replace(/&[a-z#0-9]+;/gi, m => ENT[m.toLowerCase()] ?? ' ')
    .replace(/#EMAIL_[0-9a-f]+#/gi, ' [email] ')
    .replace(/#PHONE_[0-9a-f]+#/gi, ' [phone number] ')
    .replace(/#URL_[0-9a-f]+#/gi, ' [url] ')
    .replace(/([.!?:])([A-Z])/g, '$1 $2')        // the export glued sentences and list items together: "place.We"
    .replace(/([a-z]{3,})([A-Z][a-z])/g, '$1 $2') // "systemsResearching" → "systems Researching"
    .replace(/\s+/g, ' ')
    .trim();
  return maskPrivate(t);
}

/** First `n` words; marks the cut so neither Jev nor a reader mistakes it for the end of the ad. */
function cut(s: string, n: number): string {
  const w = s.split(' ').filter(Boolean);
  return w.length <= n ? s : w.slice(0, n).join(' ') + ' …[truncated]';
}

/** "US, NY, New York" → "US, New York": country and city only. */
function place(loc: string | null | undefined): string {
  const p = (loc ?? '').split(',').map(x => x.trim()).filter(Boolean);
  if (!p.length) return '(not given)';
  return p.length === 1 ? p[0] : `${p[0]}, ${p[p.length - 1]}`;
}

// ---------------------------------------------------------------- load

type Rec = { jobId: number; state: Record<string, string>; body: string; label: 'fraud' | 'legit'; flags: Record<string, number> };
const rows = parseCsv(readFileSync(await fetchFile(URL, 'emscad-fake_job_postings-a751f55.csv'), 'utf8'));
const orNone = (s: string) => s || '(not given)';
const all: Rec[] = rows.map(r => {
  const description = clean(r.description as string);
  const requirements = clean(r.requirements as string);
  return {
    jobId: Number(r.job_id),
    state: {
      title: orNone(clean(r.title as string)),
      location: place(r.location as string),
      employment_type: orNone(clean(r.employment_type as string)),
      company_profile: orNone(cut(clean(r.company_profile as string), BUDGET.company_profile)),
      description: orNone(cut(description, BUDGET.description)),
      requirements: orNone(cut(requirements, BUDGET.requirements)),
      benefits: orNone(cut(clean(r.benefits as string), BUDGET.benefits)),
    },
    body: `${description} ${requirements}`,
    label: Number(r.fraudulent) === 1 ? 'fraud' : 'legit',
    flags: { has_company_logo: Number(r.has_company_logo), telecommuting: Number(r.telecommuting), has_questions: Number(r.has_questions) },
  };
});
// Dedupe on the full (untruncated) description + requirements: the same ad reposted in another city is one ad.
const pool = dedupe(shuffle(all.filter(r => r.body.split(' ').length >= 5), SEED), r => r.body);
const fraudN = pool.filter(r => r.label === 'fraud').length;
console.log(`source: ${all.length} postings (${all.filter(r => r.label === 'fraud').length} fraudulent), ${pool.length} after dropping near-empty and duplicate bodies (${fraudN} fraudulent)`);

// Fraud is ~5% in the corpus. We oversample it to 30% so the test holds 45 positives (enough for a paired test and a
// precision estimate) without pretending it is 50/50. Same ratio in fit and test. Disjoint by construction.
const fit = stratified(pool, r => r.label, { fraud: 30, legit: 70 });
const rest = pool.filter(r => !fit.includes(r));
const test = stratified(rest, r => r.label, { fraud: 45, legit: 105 });

const jevText = (r: Rec) => Object.values(r.state).join(' \n ');
const base = keywordBaseline(fit.map(r => ({ text: jevText(r), label: r.label })));
console.log('baseline keywords:', JSON.stringify(base.keywords));
const words = (r: Rec) => jevText(r).split(/\s+/).filter(Boolean).length;
console.log(`state words: max ${Math.max(...[...fit, ...test].map(words))}, mean ${Math.round([...fit, ...test].reduce((s, r) => s + words(r), 0) / 250)}`);

const build = (r: Rec, i: number, split: 'fit' | 'test'): Built => ({
  id: `${split === 'fit' ? 'f' : 't'}${String(i + 1).padStart(3, '0')}`,
  state: r.state,
  labels: { isFraudulent: r.label === 'fraud' },
  baseline: split === 'test' ? { isFraudulent: base.predict(jevText(r)) === 'fraud' } : undefined,
  split,
  meta: { sourceJobId: r.jobId, ...r.flags },
});
const items = [...shuffle(fit, SEED + 1).map((r, i) => build(r, i, 'fit')), ...shuffle(test, SEED + 2).map((r, i) => build(r, i, 'test'))];
report(items, 'isFraudulent');
writeSpecs(import.meta.dirname, {
  name: 'job-postings',
  description: 'HR / trust & safety: is a job ad fraudulent? One direct question plus five narrow literal signals recombined in code. EMSCAD (Vidros et al. 2017) via a CC0-declared Hugging Face mirror; fraud oversampled to 30% (natural rate ~5%); long text truncated; contacts masked; structured flags kept out of the state.',
  questions: QUESTIONS, items, baselineName: base.name,
});
