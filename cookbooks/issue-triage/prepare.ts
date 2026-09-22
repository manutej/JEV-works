/**
 * issue-triage/prepare.ts — build spec.json from the NLBSE'23 issue-report classification data, deterministically.
 *
 *   /opt/homebrew/bin/node cookbooks/issue-triage/prepare.ts
 *
 * Source: NLBSE'23 Tool Competition on Issue Report Classification
 *   repo    https://github.com/nlbse2023/issue-report-classification  (licence: AGPL-3.0, the repo's LICENSE;
 *           CITATION.cff declares the repo a dataset). The CSVs are linked from that README and hosted by the authors:
 *   data    https://tickettagger.blob.core.windows.net/datasets/nlbse23-issue-classification-test.csv.tar.gz
 *   cite    Kallis, Izadi, Pascarella, Chaparro & Rani (2023), "The NLBSE'23 Tool Competition", NLBSE'23 (ICSE workshop);
 *           Kallis, Di Sorbo, Canfora & Panichella (2021), "Predicting issue types on GitHub", Sci. Comput. Program. 205.
 *   Public English GitHub issues; the label is the repository's own GitHub label (bug / enhancement→feature / question /
 *   documentation), mapped from synonyms by the dataset authors (Izadi et al. 2022). Maintainer labels: NOISY.
 * We read only the first 16 MB of the 183 MB test CSV (≈11.6k issues; the file is not ordered by label), because the
 * whole file does not fit the shared CSV parser's memory. The prefix is fixed, so the sample is still deterministic.
 *
 * What we keep: title and body. The issue id and author_association are dropped; `documentation` issues are dropped
 * (not one of our options); issues migrated from bugs.python.org are dropped (their body is a dump of nosy-list names).
 * Body cleaning, in order: HTML comments (issue-template boilerplate) removed; fenced code blocks longer than 20 lines
 * replaced by "[code block: N lines]"; image links → "[image]", other URLs → "[link]" (URLs carry usernames);
 * @mentions → "@someone"; home-directory paths → "/home/[user]"; credential-like strings → "[secret]"; emails and
 * phone-like numbers masked (maskPrivate); then truncated to 250 words. Anything the kit's privacy scan still flags is
 * dropped before sampling.
 */
import { execFileSync } from 'node:child_process';
import { dedupe, fetchFile, keywordBaseline, maskPrivate, parseCsv, report, shuffle, stratified, writeSpecs, type Built, writeStrongBaseline } from '../_shared/lib.ts';
import { privacyScan } from '../../kit/checks.ts';
import type { Question } from '../../kit/spec.ts';

const SEED = 20260922;
const URL = 'https://tickettagger.blob.core.windows.net/datasets/nlbse23-issue-classification-test.csv.tar.gz';
const PREFIX_BYTES = 16_000_000;
const MAX_CODE_LINES = 20;
const MAX_WORDS = 250;

export const QUESTIONS: Record<string, Question> = {
  // The decision itself (labelled; the kit scores it against the keyword baseline and the fit majority).
  // Maintainer label is the ground truth; `none` has no labelled items in the source (every issue carries one of the
  // three labels), so it can only ever be scored wrong — it exists so Jev is never forced to pick a class for junk.
  issueType: {
    type: 'choice',
    instructions: 'What kind of GitHub issue is this?',
    criteria: {
      bug: 'A defect report: the software does something wrong, gives an error, or crashes, compared with what it should do.',
      feature: 'A request for new behaviour, a new option, or a change to existing behaviour that currently works as designed.',
      question: 'The author asks how to do something, or asks for help or clarification, without reporting a defect or requesting a change.',
      none: 'None of these: not an issue about the software (spam, an empty or placeholder text, a test post), or unreadable.',
    },
  },
  // Narrow, literal, unlabelled signals. Polarity = which class a TRUE answer points towards.
  // polarity: true → bug
  hasErrorOutput: {
    type: 'noul',
    instructions: 'Does the issue include an error message, exception, stack trace or log output produced by the software?',
    criteria: {
      true: 'Some error text, exception, traceback or log lines from the software are quoted or pasted in the issue.',
      false: 'No error text or log output from the software appears in the issue.',
    },
  },
  // polarity: true → bug
  hasReproSteps: {
    type: 'noul',
    instructions: 'Does the issue say what the author did (steps, commands or code they ran) to make the described behaviour happen?',
  },
  // polarity: true → question
  asksHowTo: {
    type: 'noul',
    instructions: 'Does the author ask how to do something, or ask whether something is possible?',
  },
  // polarity: true → feature
  proposesNew: {
    type: 'noul',
    instructions: 'Does the author ask for a new option, new behaviour, or a change to how the software currently works?',
  },
};

// ---------------------------------------------------------------- load (fixed 16 MB prefix of the test CSV)

const tgz = await fetchFile(URL, 'nlbse23-issue-classification-test.csv.tar.gz');
const csv = execFileSync('sh', ['-c', `tar -xzOf "$1" 2>/dev/null | head -c ${PREFIX_BYTES}`, 'sh', tgz], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const rows = parseCsv(csv).slice(0, -1);   // the last record is cut by the byte prefix

// ---------------------------------------------------------------- clean

function stripLongCode(s: string): string {
  return s.replace(/(^|\n)[ \t]*(```|~~~)[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g, (m, lead: string, _f: string, inner: string) => {
    const n = inner.split('\n').length;
    return n > MAX_CODE_LINES ? `${lead}[code block: ${n} lines]` : m;
  });
}

export function clean(s: string): string {
  let t = s.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  t = stripLongCode(t);
  t = t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]')
    .replace(/<img\b[^>]*>/gi, '[image]')
    .replace(/https?:\/\/[^\s)>\]"'`]+/g, '[link]')
    .replace(/\bwww\.[^\s)>\]"'`]+/g, '[link]')
    .replace(/(^|[^\w`/.-])@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\b/g, '$1@someone')
    .replace(/(\/(?:Users|home)\/)[^/\s'"`]+/g, '$1[user]')
    .replace(/([A-Za-z]:\\+Users\\+)[^\\\s'"`]+/gi, '$1[user]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[secret]')
    .replace(/\b(?:sk|pk|rk|vck|ghp|gho|ghs|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{10,}/g, '[secret]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[secret]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [secret]')
    .replace(/\b((?:api[_-]?key|token|secret|password|passwd|pwd)["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, '$1[secret]');
  t = maskPrivate(t).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const words = t.split(/(?<=\s)/);   // keep whitespace (and newlines) attached, so structure survives truncation
  const kept = words.filter(w => w.trim()).length;
  if (kept > MAX_WORDS) {
    let n = 0, out = '';
    for (const w of words) { if (w.trim() && ++n > MAX_WORDS) break; out += w; }
    t = out.trimEnd() + ' […]';
  }
  return t;
}

type Label = 'bug' | 'feature' | 'question';
type Rec = { title: string; body: string; label: Label; row: number };
const LABELS = new Set(['bug', 'feature', 'question']);
const all: Rec[] = [];
const dropped: Record<string, number> = { documentation: 0, bpoMigrated: 0, privacy: 0, emptyTitle: 0 };
rows.forEach((r, row) => {
  if (!LABELS.has(r.labels)) { dropped.documentation++; return; }
  if (/bugs\.python\.org fields/.test(r.body) || r.author_association === 'MANNEQUIN') { dropped.bpoMigrated++; return; }
  const title = clean(r.title).replace(/\s+/g, ' ');
  if (!title) { dropped.emptyTitle++; return; }
  const rec: Rec = { title, body: clean(r.body), label: r.labels as Label, row };
  if (privacyScan([{ id: 'x', state: { title: rec.title, body: rec.body } }]).length) { dropped.privacy++; return; }
  all.push(rec);
});
const textOf = (r: Rec) => `${r.title}\n\n${r.body}`;
const pool = dedupe(shuffle(all, SEED), textOf);
console.log(`source prefix: ${rows.length} issues; kept ${all.length}, ${pool.length} after dedupe; dropped ${JSON.stringify(dropped)}`);

// Balanced 34/33/33 fit and 50/50/50 test. The source prefix is bug-heavy (≈6.0k bug / 4.3k feature / 0.8k question);
// balancing keeps "question" from being a rounding error and makes per-class accuracy readable with n=50 per class.
const fit = stratified(pool, r => r.label, { bug: 34, feature: 33, question: 33 });
const rest = pool.filter(r => !fit.includes(r));
const test = stratified(rest, r => r.label, { bug: 50, feature: 50, question: 50 });

const base = keywordBaseline(fit.map(r => ({ text: textOf(r), label: r.label })));
console.log('baseline keywords:', JSON.stringify(base.keywords));
const build = (r: Rec, i: number, split: 'fit' | 'test'): Built => ({
  id: `${split === 'fit' ? 'f' : 't'}${String(i + 1).padStart(3, '0')}`,
  state: { title: r.title, body: r.body },
  labels: { issueType: r.label },
  baseline: split === 'test' ? { issueType: base.predict(textOf(r)) } : undefined,
  split,
  meta: { source: 'nlbse23-issue-classification-test.csv (first 16 MB)', sourceRow: r.row, maintainerLabel: r.label },
});
const items = [...shuffle(fit, SEED + 1).map((r, i) => build(r, i, 'fit')), ...shuffle(test, SEED + 2).map((r, i) => build(r, i, 'test'))];
report(items, 'issueType');
writeSpecs(import.meta.dirname, {
  name: 'issue-triage',
  description: 'Developer tools: is a GitHub issue a bug report, a feature request or a question? One labelled choice plus narrow literal signals. NLBSE\'23 issue-report classification data (AGPL-3.0); maintainer labels (noisy); ids, authors, URLs and @mentions dropped; long code blocks replaced by a line count; body truncated to 250 words.',
  questions: QUESTIONS, items, baselineName: base.name,
});

// Post-hoc (added after the labelled test run; no Jev calls; never changes a declared verdict): STRONG_BASELINE=1 also
// writes baseline.strong.json, a naive Bayes trained on up to 2,000 labelled source rows that are neither fit nor test.
if (process.env.STRONG_BASELINE) writeStrongBaseline(import.meta.dirname, {
  train: pool.filter(r => !fit.includes(r) && !test.includes(r)),
  test: shuffle(test, SEED + 2).map((rec, i) => ({ id: `t${String(i + 1).padStart(3, '0')}`, rec })),
  textOf: textOf, labelOf: r => r.label, toValue: v => v, source: 'NLBSE23 prefix rows not in fit or test', seed: SEED + 9,
});
