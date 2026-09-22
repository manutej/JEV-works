/**
 * Q4 — does the cheap baseline win on our tasks? (NETER open window 6)
 *
 * Computes the baselines that were MISSING for labelled tasks, from committed files only.
 * Zero model calls: every Jev answer below is read from a result file that already exists.
 *
 *   1. leads, seed 7 — segment accuracy over ALL 600 leads (escalation = not correct).
 *      evaluate.ts prints segment accuracy on own verdicts only; the qualified task already has
 *      an over-all number (67.8% vs 92.2%). Also adds a majority-class bar for `qualified`.
 *   2. P6 clean items — Jev's classification accuracy (85.6%, 89/104) was reported with no
 *      baseline. Labels are by provenance (`expected` in program/p6-corpus.json). Two baselines,
 *      both fitted on the fit half and scored on the test half, declared before they were run:
 *        a. majority class per question
 *        b. multinomial naive Bayes over word + punctuation tokens, Laplace smoothing (α = 1)
 *      Not tuned after seeing the test score, whatever it is.
 *
 * Verdict rule for accuracy: exact McNemar on per-item correctness, same items for both systems.
 * b = Jev right & baseline wrong, c = baseline right & Jev wrong; different iff p < 0.05. P4's 0.11
 * is one answer's probability jitter across identical calls, not a bound on an accuracy gap, so it
 * is NOT used as a tie band here. For AUC (P6 garbage) the paired test is a bootstrap over items.
 *
 *   3. E3 (VOID, in-sample) — McNemar on the per-item rows kept on branch feat/e3-blind-test.
 *
 *   /opt/homebrew/bin/node program/q4-baselines.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { auc } from './stats.ts';

const OUT_PATH = new URL('./results/q4-baselines.json', import.meta.url).pathname;
const ALPHA = 0.05;
const BOOT = 2000;
const r4 = (x: number) => +x.toFixed(4);
const readJson = async (rel: string) => JSON.parse(await readFile(new URL(rel, import.meta.url), 'utf8'));

// Deterministic PRNG so the CI is byte-identical on rerun.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paired bootstrap of mean(a) − mean(b) over items, a/b are 0/1 correctness per item. */
function pairedDeltaCI(a: readonly number[], b: readonly number[], seed = 4): [number, number] {
  const rand = mulberry32(seed);
  const n = a.length;
  const ds: number[] = [];
  for (let k = 0; k < BOOT; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) { const j = Math.floor(rand() * n); s += a[j] - b[j]; }
    ds.push(s / n);
  }
  ds.sort((x, y) => x - y);
  return [r4(ds[Math.floor(0.025 * BOOT)]), r4(ds[Math.floor(0.975 * BOOT)])];
}

/**
 * Exact McNemar, two-sided, mirrors leads/evaluate.ts on feat/leads-literal-questions.
 * Under "no difference" b ~ Binomial(b + c, 0.5).
 */
function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const logFact = (k: number) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  const logChoose = (k: number) => logFact(n) - logFact(k) - logFact(n - k);
  let tail = 0;
  for (let k = 0; k <= Math.min(b, c); k++) tail += Math.exp(logChoose(k) - n * Math.LN2);
  return Math.min(1, 2 * tail);
}

/** jev/base are 0/1 correctness on the same items, same order. */
function paired(jev: readonly number[], base: readonly number[]) {
  let b = 0, c = 0;
  for (let i = 0; i < jev.length; i++) { if (jev[i] && !base[i]) b++; if (!jev[i] && base[i]) c++; }
  const p = mcnemarExact(b, c);
  return {
    jevOnlyRight: b,
    baselineOnlyRight: c,
    mcnemarP: +p.toPrecision(3),
    winner: p >= ALPHA ? 'no significant difference' : b > c ? 'Jev' : 'baseline',
  };
}

// ═══════════════════════════════════════════════════════ 1. leads, seed 7

const truth: Record<string, { trueSegment: string; trueQualified: boolean; category: string }> =
  await readJson('../leads/corpus/truth-7.json');
const pipeline = await readJson('../leads/results/pipeline-7.json');
const regex = await readJson('../leads/results/baseline-7.json');
const ids = Object.keys(truth);

const jevFinal = new Map<string, { qualified: boolean | null; segment: string | null }>(
  pipeline.results.map((r: any) => [r.leadId, { qualified: r.final?.qualified ?? null, segment: r.final?.segment ?? null }]),
);
const regexFinal = new Map<string, { qualified: boolean; segment: string }>(
  regex.predictions.map((p: any) => [p.leadId, { qualified: p.qualified, segment: p.segment }]),
);

function majorityOf<T extends string>(xs: readonly T[]): T {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0][0];
}

function leadsTask(field: 'segment' | 'qualified') {
  const t = (id: string) => (field === 'segment' ? truth[id].trueSegment : truth[id].trueQualified);
  const majority = majorityOf(ids.map(id => String(t(id))));
  const jev = ids.map(id => (jevFinal.get(id)?.[field] ?? null) !== null && jevFinal.get(id)![field] === t(id) ? 1 : 0);
  const rx = ids.map(id => (regexFinal.get(id)![field] === t(id) ? 1 : 0));
  const maj = ids.map(id => (String(t(id)) === majority ? 1 : 0));
  const answered = ids.filter(id => (jevFinal.get(id)?.[field] ?? null) !== null);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const jevAll = sum(jev) / ids.length;
  const rxAll = sum(rx) / ids.length;
  return {
    n: ids.length,
    split: 'seed 7, generated after the gate criteria were committed (6159e75); out-of-sample for Jev gate and regex',
    majorityClass: { guess: majority, accuracy: r4(sum(maj) / ids.length) },
    regex: { accuracyAll: r4(rxAll), coverage: 1 },
    jev: {
      accuracyAll: r4(jevAll),
      coverage: r4(answered.length / ids.length),
      accuracyOwnVerdicts: r4(sum(answered.map(id => (jevFinal.get(id)![field] === t(id) ? 1 : 0))) / answered.length),
    },
    deltaJevMinusRegex: r4(jevAll - rxAll),
    deltaCI95: pairedDeltaCI(jev, rx),
    vsRegex: paired(jev, rx),
    deltaJevMinusMajority: r4(jevAll - sum(maj) / ids.length),
    vsMajority: paired(jev, maj),
  };
}

const leads = { segment: leadsTask('segment'), qualified: leadsTask('qualified') };

// ═══════════════════════════════════════════════════════ 2. P6 clean-item classification

type P6Item = { id: string; question: 'toolKind' | 'docGenre'; label: 'clean' | 'garbage'; expected: string; text: string; split: 'fit' | 'test' };
const corpus: { items: P6Item[] } = await readJson('./p6-corpus.json');
const p6 = await readJson('./results/p6-entropy.json');
const jevChoice = new Map<string, string | null>(p6.readings.map((r: any) => [r.id, r.choice]));

const tokens = (s: string) => s.toLowerCase().match(/[a-z0-9_]+|[^\sa-z0-9_]/g) ?? [];

function trainNB(items: readonly P6Item[]) {
  const classes = [...new Set(items.map(i => i.expected))].sort();
  const docs = new Map(classes.map(c => [c, 0]));
  const counts = new Map(classes.map(c => [c, new Map<string, number>()]));
  const totals = new Map(classes.map(c => [c, 0]));
  const vocab = new Set<string>();
  for (const it of items) {
    docs.set(it.expected, docs.get(it.expected)! + 1);
    const m = counts.get(it.expected)!;
    for (const w of tokens(it.text)) {
      vocab.add(w);
      m.set(w, (m.get(w) ?? 0) + 1);
      totals.set(it.expected, totals.get(it.expected)! + 1);
    }
  }
  return (text: string) => {
    let best = classes[0];
    let bestLp = -Infinity;
    for (const c of classes) {
      let lp = Math.log(docs.get(c)! / items.length);
      const m = counts.get(c)!;
      const denom = totals.get(c)! + vocab.size;
      for (const w of tokens(text)) lp += Math.log(((m.get(w) ?? 0) + 1) / denom);
      if (lp > bestLp) { bestLp = lp; best = c; }
    }
    return best;
  };
}

function p6Task(question: P6Item['question'] | 'both') {
  const clean = corpus.items.filter(i => i.label === 'clean' && (question === 'both' || i.question === question));
  const fit = clean.filter(i => i.split === 'fit');
  const test = clean.filter(i => i.split === 'test');
  // "both" pools the two questions but trains/scores each question's baseline on its own options.
  const qs = question === 'both' ? (['toolKind', 'docGenre'] as const) : [question];
  const nbFor = Object.fromEntries(qs.map(q => [q, trainNB(fit.filter(i => i.question === q))]));
  const majFor = Object.fromEntries(qs.map(q => [q, majorityOf(fit.filter(i => i.question === q).map(i => i.expected))]));
  const jev = test.map(i => (jevChoice.get(i.id) === i.expected ? 1 : 0));
  const nb = test.map(i => (nbFor[i.question](i.text) === i.expected ? 1 : 0));
  const maj = test.map(i => (majFor[i.question] === i.expected ? 1 : 0));
  const acc = (xs: number[]) => r4(xs.reduce((a, b) => a + b, 0) / xs.length);
  const jevAllClean = clean.map(i => (jevChoice.get(i.id) === i.expected ? 1 : 0));
  return {
    n: { fit: fit.length, test: test.length },
    majorityClass: { guess: majFor, testAccuracy: acc(maj) },
    naiveBayes: { testAccuracy: acc(nb) },
    jev: { testAccuracy: acc(jev), allCleanAccuracy: acc(jevAllClean), allCleanN: clean.length, coverage: 1 },
    deltaJevMinusNB: r4(acc(jev) - acc(nb)),
    deltaCI95: pairedDeltaCI(jev, nb),
    vsNB: paired(jev, nb),
    deltaJevMinusMajority: r4(acc(jev) - acc(maj)),
    vsMajority: paired(jev, maj),
  };
}

const p6Classification = {
  note: 'Clean items only; labels by provenance. Baselines fitted on fit half, scored on test half. Jev never saw a fit half (no Jev fitting on this corpus), so its all-104 number is also out-of-sample; the head-to-head uses the test half for parity.',
  both: p6Task('both'),
  toolKind: p6Task('toolKind'),
  docGenre: p6Task('docGenre'),
};

// ═══════════════════════════════════════════════════════ 2b. P6 garbage detection, paired AUC

// Same test half as p6-entropy.ts: positive = garbage; length score = −(non-whitespace chars).
const p6Test = corpus.items.filter(i => i.split === 'test');
const entropyOf = new Map<string, number>(p6.readings.map((r: any) => [r.id, r.entropy]));
const lengthScore = (t: string) => -t.replace(/\s/g, '').length;

function p6GarbageAuc() {
  const pos = p6Test.map(i => i.label === 'garbage');
  const ent = p6Test.map(i => entropyOf.get(i.id)!);
  const len = p6Test.map(i => lengthScore(i.text));
  const rand = mulberry32(6);
  const ds: number[] = [];
  let atOrBelowZero = 0;
  for (let k = 0; k < BOOT; k++) {
    const idx = p6Test.map(() => Math.floor(rand() * p6Test.length));
    const d = auc(idx.map(j => ent[j]), idx.map(j => pos[j])) - auc(idx.map(j => len[j]), idx.map(j => pos[j]));
    if (Number.isNaN(d)) continue;
    ds.push(d);
    if (d <= 0) atOrBelowZero++;
  }
  ds.sort((x, y) => x - y);
  const ci: [number, number] = [r4(ds[Math.floor(0.025 * ds.length)]), r4(ds[Math.floor(0.975 * ds.length)])];
  const delta = auc(ent, pos) - auc(len, pos);
  return {
    n: { garbage: pos.filter(Boolean).length, clean: pos.filter(x => !x).length },
    aucEntropy: r4(auc(ent, pos)),
    aucLength: r4(auc(len, pos)),
    delta: r4(delta),
    deltaCI95: ci,
    bootstrapShareAtOrBelowZero: r4(atOrBelowZero / ds.length),
    winner: ci[0] > 0 ? 'Jev' : ci[1] < 0 ? 'baseline' : 'no significant difference',
  };
}
const p6Garbage = p6GarbageAuc();

// ═══════════════════════════════════════════════════════ 3. E3, VOID and in-sample

const e3 = JSON.parse(execFileSync('git', ['show', 'feat/e3-blind-test:program/results/e3-blind.json'], { encoding: 'utf8' }));
const e3Rows: Array<{ jevCorrect: boolean; baselineCorrect: boolean }> = e3.holdout.rows;
const e3Void = {
  note: 'VOID: holdout ⊂ fit set (39/39). In-sample for Jev wording and for the keyword rule, which was fitted on the same 80.',
  n: e3Rows.length,
  jevAccuracy: r4(e3Rows.filter(r => r.jevCorrect).length / e3Rows.length),
  keywordAccuracy: r4(e3Rows.filter(r => r.baselineCorrect).length / e3Rows.length),
  vsKeyword: paired(e3Rows.map(r => +r.jevCorrect), e3Rows.map(r => +r.baselineCorrect)),
};

const out = {
  experiment: 'Q4',
  question: 'Does the cheap baseline win on our tasks? (NETER open window 6)',
  modelCalls: 0,
  sources: [
    'leads/corpus/truth-7.json', 'leads/results/pipeline-7.json', 'leads/results/baseline-7.json',
    'program/p6-corpus.json', 'program/results/p6-entropy.json',
  ],
  pairedRule: `accuracy: exact McNemar on per-item correctness, different iff p < ${ALPHA}; AUC: paired bootstrap, ${BOOT} resamples, seeded. P4's 0.11 is not used as a tie band.`,
  noPairedTestPossible: {
    e2: 'program/results/e2-entropy-agreement.json keeps jevCorrect per item but not the hook text or keyword prediction; the corpus (/Users/manu/CETI/.../ceti-silver-hooks.json) is not committed.',
    e1: 'consensus vs keyword: per-item keyword prediction not in the committed file; also not a Jev comparison.',
  },
  leads,
  p6Classification,
  p6Garbage,
  e3Void,
};

await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
const brief = (x: any) => ({ vs: x.vsRegex ?? x.vsNB, vsMajority: x.vsMajority });
console.log(JSON.stringify({
  leadsQualified: brief(leads.qualified), leadsSegment: brief(leads.segment),
  p6Both: brief(p6Classification.both), p6ToolKind: brief(p6Classification.toolKind), p6DocGenre: brief(p6Classification.docGenre),
  p6Garbage, e3Void,
}, null, 2));
console.log(`\nwrote ${OUT_PATH}`);
