/**
 * E3-K — 5-fold study on the 80 CETI hooks, reported as IN-SAMPLE for Jev (E3-KFOLD-PREREG.md).
 *
 * E3's holdout was void (the 39 "approved" rows are a subset of the 80, LESSONS L31). Manu's decision
 * (2026-09-21): "k-fold on the 80, reported as in-sample". The honesty point this script is built around:
 * Jev's v2 option descriptions were written by reading all 80 items, so no fold is unseen by Jev. Folds
 * only change who the KEYWORD BASELINE learned from — it is fitted on k−1 folds and scored on the held-out
 * one, so it is the only genuinely held-out system here. Jev answers each item once; folds affect scoring.
 *
 *   /opt/homebrew/bin/node program/e3-kfold.ts folds     # build + check folds, write the folds file, 0 calls
 *   source ~/.zshrc >/dev/null 2>&1; /opt/homebrew/bin/node program/e3-kfold.ts          # 80 Jev calls, then score
 *   E3K_ANALYSE_ONLY=1 /opt/homebrew/bin/node program/e3-kfold.ts   # re-score the saved readings, 0 calls
 */
import { experimental_evaluate as evaluate } from 'ai';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { CORPUS_PATH, FORMULA_KEYS, type Hook } from './formulas.ts';
import { keywordClassify } from './keyword-baseline.ts';
import { e3KeywordClassify } from './e3-keyword-baseline.ts';
import { VARIANTS } from './e3-questions.ts';
import { pool } from './stats.ts';
import { JEV, JEV_ID, answeredBy } from '../lib/jev.ts';
import { RunLog } from '../lib/telemetry.ts';

// ── pre-registered constants (E3-KFOLD-PREREG.md) — not tuned after the run ──
const K = 5;
const SEED = 20260921;
const CORPUS_SHA256 = '16b9efe1cfbea781b3b83d2f9e68dc4b7d88bd42c3c4f69ada89ae95b41fbf7b'; // E3-PROGRESS.md custody table
const VARIANT = 'v2' as const;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 4;
const CALL_BUDGET = 250;
const NB_ALPHA = 1;
const TIE_BAND = 0.11; // P4, ground rule 6
const SENSITIVITY_BAND = 0.15; // P4 addendum, reported only
const BOOT = 10000;
const BOOT_SEED = 7;
const MIN_CLASS_N = 8; // I3
const TAU_GRID = [0, ...Array.from({ length: 15 }, (_, i) => +(0.2 + i * 0.05).toFixed(2))];
const SWEEP = [0.5, 0.6, 0.7, 0.8, 0.9];

const FOLDS_PATH = new URL('./results/e3-kfold-folds.json', import.meta.url).pathname;
const OUT_PATH = new URL('./results/e3-kfold.json', import.meta.url).pathname;
// Set after `folds` ran and before any Jev call; the run refuses a different folds file.
const FOLDS_SHA256 = '2558c7c261572f69ea398d6df08190588fc9a3d39fbd7bd3b620d1c607ac1b47';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const normText = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
const r4 = (x: number) => +x.toFixed(4);

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadCorpus(): Promise<{ hooks: Hook[]; sha: string }> {
  const raw = await readFile(CORPUS_PATH, 'utf8');
  return { hooks: JSON.parse(raw), sha: sha256(raw) };
}

// ── folds ─────────────────────────────────────────────────────────────────

type FoldsFile = {
  k: number;
  seed: number;
  stratifiedBy: 'formula';
  corpusSha256: string;
  n: number;
  folds: Array<{ fold: number; ids: string[]; classCounts: Record<string, number> }>;
  disjointness: ReturnType<typeof checkDisjoint>;
};

/** Stratified: within each class (FORMULA_KEYS order), shuffle with the seeded PRNG, deal round-robin with one
 *  running counter across classes so every fold gets exactly n/k items and each class is spread evenly. */
function buildFolds(hooks: Hook[]): string[][] {
  const rnd = mulberry32(SEED);
  const folds: string[][] = Array.from({ length: K }, () => []);
  let counter = 0;
  for (const cls of FORMULA_KEYS) {
    const ids = hooks.filter(h => h.formula === cls).map(h => h.id).sort();
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    for (const id of ids) folds[counter++ % K].push(id);
  }
  return folds;
}

/** L31: overlap is counted, never assumed. Ids and normalised-text hashes, every fold pair. */
function checkDisjoint(folds: string[][], hooks: Hook[]) {
  const textOf = new Map(hooks.map(h => [h.id, sha256(normText(h.text))]));
  let idOverlap = 0;
  let textOverlap = 0;
  for (let a = 0; a < folds.length; a++)
    for (let b = a + 1; b < folds.length; b++) {
      const ids = new Set(folds[a]);
      const texts = new Set(folds[a].map(id => textOf.get(id)));
      idOverlap += folds[b].filter(id => ids.has(id)).length;
      textOverlap += folds[b].filter(id => texts.has(textOf.get(id))).length;
    }
  const all = folds.flat();
  const corpusIds = new Set(hooks.map(h => h.id));
  return {
    pairwiseIdOverlap: idOverlap,
    pairwiseNormalisedTextOverlap: textOverlap,
    duplicateNormalisedTextsInCorpus: hooks.length - new Set(hooks.map(h => textOf.get(h.id))).size,
    coversCorpus: all.length === hooks.length && new Set(all).size === hooks.length && all.every(id => corpusIds.has(id)),
    pass: idOverlap === 0 && textOverlap === 0,
  };
}

async function foldsMode() {
  const { hooks, sha } = await loadCorpus();
  if (sha !== CORPUS_SHA256) throw new Error(`corpus sha256 ${sha} ≠ recorded ${CORPUS_SHA256}`);
  const folds = buildFolds(hooks);
  const disjointness = checkDisjoint(folds, hooks);
  const cls = new Map(hooks.map(h => [h.id, h.formula]));
  const file: FoldsFile = {
    k: K,
    seed: SEED,
    stratifiedBy: 'formula',
    corpusSha256: sha,
    n: hooks.length,
    folds: folds.map((ids, fold) => ({
      fold,
      ids,
      classCounts: Object.fromEntries(FORMULA_KEYS.map(c => [c, ids.filter(id => cls.get(id) === c).length])),
    })),
    disjointness,
  };
  const body = JSON.stringify(file, null, 2) + '\n';
  await writeFile(FOLDS_PATH, body);
  // Counts only — nothing about any item's text or label is printed.
  console.log(JSON.stringify({ foldSizes: folds.map(f => f.length), disjointness, foldsSha256: sha256(body) }, null, 2));
  if (!disjointness.pass || !disjointness.coversCorpus) process.exit(1);
}

// ── keyword baseline, fitted fold-wise: multinomial naive Bayes on tokens ──

/** Bag of lowercased words; digit runs → <num>; selling punctuation kept as tokens. No hand-picked features. */
const tokenize = (t: string) =>
  (t.toLowerCase().replace(/\d+([.,]\d+)?/g, ' <num> ').match(/<num>|[a-z]+(?:'[a-z]+)?|[→$?!:—\[\]%]/g) ?? []);

function fitNB(train: Hook[]) {
  const vocab = new Set<string>();
  const counts = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  const docs = new Map<string, number>();
  for (const h of train) {
    docs.set(h.formula, (docs.get(h.formula) ?? 0) + 1);
    const m = counts.get(h.formula) ?? new Map<string, number>();
    counts.set(h.formula, m);
    for (const w of tokenize(h.text)) {
      vocab.add(w);
      m.set(w, (m.get(w) ?? 0) + 1);
      totals.set(h.formula, (totals.get(h.formula) ?? 0) + 1);
    }
  }
  const classes = FORMULA_KEYS.filter(c => docs.has(c));
  return (text: string): string => {
    let best = classes[0];
    let bestScore = -Infinity;
    for (const c of classes) {
      let s = Math.log(docs.get(c)! / train.length);
      const m = counts.get(c)!;
      const denom = (totals.get(c) ?? 0) + NB_ALPHA * vocab.size;
      for (const w of tokenize(text)) if (vocab.has(w)) s += Math.log(((m.get(w) ?? 0) + NB_ALPHA) / denom);
      if (s > bestScore) [best, bestScore] = [c, s]; // strict >: ties go to the earlier FORMULA_KEYS class
    }
    return best;
  };
}

function majorityOf(train: Hook[]): string {
  const n = (c: string) => train.filter(h => h.formula === c).length;
  return FORMULA_KEYS.reduce((a, c) => (n(c) > n(a) ? c : a));
}

// ── Jev ───────────────────────────────────────────────────────────────────

type Reading = {
  id: string;
  choice: string | null;
  probabilities: Record<string, number> | null;
  topP: number | null;
  answeredBy: string | null;
  ms: number | null;
  attempts: number;
  error?: string;
};

let attemptsUsed = 0;

async function readAll(hooks: Hook[]): Promise<{ readings: Reading[]; telemetry: unknown }> {
  const q = VARIANTS[VARIANT];
  const questions = { formula: { type: 'choice', instructions: q.instructions, criteria: q.criteria } } as const;
  const log = new RunLog('e3-kfold');
  log.announce({
    model: JEV_ID,
    items: hooks.length,
    questions: { formula: `choice(${Object.keys(q.criteria).length}) ${VARIANT}` },
    stateShape: '{text}  ~20 tok',
    recombination: 'argmax of the choice distribution; folds affect scoring only',
    thresholdsFitted: false,
    maxRetries: 0,
  });
  const readings = await pool(hooks, CONCURRENCY, async (h): Promise<Reading> => {
    const blank = { id: h.id, choice: null, probabilities: null, topP: null, answeredBy: null, ms: null };
    for (let attempt = 1; ; attempt++) {
      if (attemptsUsed >= CALL_BUDGET) return { ...blank, attempts: attempt - 1, error: 'call budget exhausted' };
      attemptsUsed++;
      const t0 = performance.now();
      try {
        const r = await evaluate({ model: JEV, state: { text: h.text }, questions, maxRetries: 0 });
        const a = r.answers.formula;
        const probs = a.probabilities ?? null;
        const ms = Math.round(performance.now() - t0);
        log.item(h.id, { verdict: a.choice === h.formula ? 'right' : 'wrong', choice: a.choice, p: probs?.[a.choice], ms, inputTokens: r.usage?.inputTokens });
        return { id: h.id, choice: a.choice, probabilities: probs, topP: probs ? probs[a.choice] ?? null : null, answeredBy: answeredBy(r), ms, attempts: attempt };
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 300);
        const transient = /\b(429|500|502|503|504)\b|timed? ?out|ECONNRESET|fetch failed|rate/i.test(msg);
        if (!transient || attempt >= MAX_ATTEMPTS) {
          log.fail(h.id, msg);
          return { ...blank, attempts: attempt, error: msg };
        }
        log.retry(h.id, msg);
        await new Promise(res => setTimeout(res, Math.min(30_000, 1000 * 2 ** attempt)));
      }
    }
  });
  return { readings, telemetry: log.done() };
}

// ── scoring ───────────────────────────────────────────────────────────────

type ClassCell = { n: number; correct: number; recall: number; insufficientData: boolean };
type Score = { n: number; answered: number; coverage: number; correct: number; accuracy: number; macroRecall: number; perClass: Record<string, ClassCell> };

function score(truth: readonly string[], guesses: readonly (string | null)[]): Score {
  const perClass: Record<string, ClassCell> = {};
  let correct = 0;
  truth.forEach((t, i) => {
    const c = (perClass[t] ??= { n: 0, correct: 0, recall: 0, insufficientData: false });
    c.n++;
    if (guesses[i] === t) (c.correct++, correct++);
  });
  for (const c of Object.values(perClass)) {
    c.recall = r4(c.correct / c.n);
    c.insufficientData = c.n < MIN_CLASS_N;
  }
  const recalls = Object.values(perClass).map(c => c.recall);
  const answered = guesses.filter(g => g !== null).length;
  return {
    n: truth.length,
    answered,
    coverage: r4(answered / truth.length),
    correct,
    accuracy: r4(correct / truth.length), // a failed call is wrong, never dropped
    macroRecall: r4(recalls.reduce((a, b) => a + b, 0) / recalls.length),
    perClass,
  };
}

function confusion(truth: readonly string[], guesses: readonly (string | null)[]) {
  const m: Record<string, Record<string, number>> = {};
  truth.forEach((t, i) => {
    const g = guesses[i] ?? '(failed)';
    (m[t] ??= {})[g] = (m[t][g] ?? 0) + 1;
  });
  return m;
}

/** Item-resampling bootstrap: CI of one system's accuracy, and the PAIRED CI of a − b (same draw for both). */
function bootstrap(a: readonly boolean[], b: readonly boolean[]) {
  const rnd = mulberry32(BOOT_SEED);
  const n = a.length;
  const accA: number[] = [];
  const accB: number[] = [];
  const diff: number[] = [];
  for (let d = 0; d < BOOT; d++) {
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rnd() * n);
      sa += a[j] ? 1 : 0;
      sb += b[j] ? 1 : 0;
    }
    accA.push(sa / n);
    accB.push(sb / n);
    diff.push((sa - sb) / n);
  }
  const ci = (xs: number[]): [number, number] => {
    const s = xs.sort((x, y) => x - y);
    return [r4(s[Math.floor(BOOT * 0.025)]), r4(s[Math.floor(BOOT * 0.975)])];
  };
  return { a: ci(accA), b: ci(accB), diff: ci(diff) };
}

/** Exact two-sided McNemar on the discordant pairs. */
function mcnemar(a: readonly boolean[], b: readonly boolean[]) {
  const onlyA = a.filter((x, i) => x && !b[i]).length;
  const onlyB = a.filter((x, i) => !x && b[i]).length;
  const m = onlyA + onlyB;
  const k = Math.min(onlyA, onlyB);
  let p = 0;
  let c = 1; // C(m, 0)
  for (let i = 0; i <= k; i++) {
    p += c;
    c = (c * (m - i)) / (i + 1);
  }
  return { onlyJevRight: onlyA, onlyBaselineRight: onlyB, pTwoSided: m === 0 ? 1 : r4(Math.min(1, (2 * p) / 2 ** m)) };
}

function verdict(delta: number, ci: [number, number], band: number) {
  if (delta >= band && ci[0] > 0) return 'jev-ahead';
  if (delta <= -band && ci[1] < 0) return 'baseline-ahead';
  return 'tie';
}

// ── run ───────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv[2] === 'folds') return foldsMode();

  const analyseOnly = process.env.E3K_ANALYSE_ONLY === '1';
  const { hooks, sha } = await loadCorpus();
  if (sha !== CORPUS_SHA256) throw new Error(`corpus sha256 ${sha} ≠ recorded ${CORPUS_SHA256}`);
  const foldsRaw = await readFile(FOLDS_PATH, 'utf8');
  if (sha256(foldsRaw) !== FOLDS_SHA256) throw new Error(`folds file sha256 ${sha256(foldsRaw)} ≠ pre-registered ${FOLDS_SHA256}`);
  const foldsFile: FoldsFile = JSON.parse(foldsRaw);
  const folds = foldsFile.folds.map(f => f.ids);
  const disjointness = checkDisjoint(folds, hooks);
  if (!disjointness.pass || !disjointness.coversCorpus) throw new Error(`folds not disjoint: ${JSON.stringify(disjointness)}`);

  let readings: Reading[];
  let telemetry: unknown;
  let model = JEV_ID;
  let callsUsed = 0;
  let prior: any;
  if (analyseOnly) {
    prior = JSON.parse(await readFile(OUT_PATH, 'utf8'));
    readings = prior.readings;
    telemetry = prior.telemetry;
    model = prior.model;
    callsUsed = prior.callsUsed;
  } else {
    if (existsSync(OUT_PATH)) throw new Error(`${OUT_PATH} exists — the Jev pass is one-shot; use E3K_ANALYSE_ONLY=1 to re-score`);
    ({ readings, telemetry } = await readAll(hooks));
    callsUsed = attemptsUsed;
  }

  const byId = new Map(hooks.map(h => [h.id, h]));
  const readingOf = new Map(readings.map(r => [r.id, r]));
  const foldOf = new Map(folds.flatMap((ids, f) => ids.map(id => [id, f] as const)));

  // Held-out predictions for the fold-fitted systems: fit on k−1 folds, predict the held-out fold.
  const nbGuess = new Map<string, string>();
  const majGuess = new Map<string, string>();
  const hybGuess = new Map<string, string>();
  const tauPerFold: number[] = [];
  const jevChoice = (id: string) => readingOf.get(id)?.choice ?? null;
  const topP = (id: string) => readingOf.get(id)?.topP ?? 0;
  for (let f = 0; f < K; f++) {
    const train = folds.flatMap((ids, g) => (g === f ? [] : ids)).map(id => byId.get(id)!);
    const nb = fitNB(train);
    const maj = majorityOf(train);
    // τ for the secondary hybrid (Jev if top-p ≥ τ, else the fold-fitted NB), chosen on the training folds.
    // NB on the training folds is scored in-sample there, as any fitted fallback would be at fit time.
    let bestTau = TAU_GRID[0];
    let bestAcc = -1;
    for (const tau of TAU_GRID) {
      const acc = train.filter(h => (jevChoice(h.id) !== null && topP(h.id) >= tau ? jevChoice(h.id) : nb(h.text)) === h.formula).length;
      if (acc > bestAcc) [bestTau, bestAcc] = [tau, acc];
    }
    tauPerFold.push(bestTau);
    for (const id of folds[f]) {
      const h = byId.get(id)!;
      nbGuess.set(id, nb(h.text));
      majGuess.set(id, maj);
      hybGuess.set(id, jevChoice(id) !== null && topP(id) >= bestTau ? jevChoice(id)! : nb(h.text));
    }
  }

  const ids = hooks.map(h => h.id);
  const truth = ids.map(id => byId.get(id)!.formula);
  const systems = {
    jev: ids.map(jevChoice),
    nbKeyword: ids.map(id => nbGuess.get(id)!),
    majority: ids.map(id => majGuess.get(id)!),
    hybrid: ids.map(id => hybGuess.get(id)!),
    e3RegexInSample: ids.map(id => e3KeywordClassify(byId.get(id)!.text)),
    e1KeywordUnfitted: ids.map(id => keywordClassify(byId.get(id)!.text)),
  } as const;
  type Sys = keyof typeof systems;

  const pooled = Object.fromEntries(Object.entries(systems).map(([k, g]) => [k, score(truth, g)])) as Record<Sys, Score>;
  const perFold = folds.map((fids, f) => {
    const idx = fids.map(id => ids.indexOf(id));
    const t = idx.map(i => truth[i]);
    return {
      fold: f,
      n: fids.length,
      tau: tauPerFold[f],
      ...Object.fromEntries(Object.entries(systems).map(([k, g]) => {
        const s = score(t, idx.map(i => g[i]));
        return [k, { accuracy: s.accuracy, macroRecall: s.macroRecall, coverage: s.coverage, correct: s.correct }];
      })),
    };
  });
  const foldSpread = (k: Sys) => {
    const xs = perFold.map(p => (p as any)[k].accuracy as number);
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return { mean: r4(m), sd: r4(Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))), min: Math.min(...xs), max: Math.max(...xs) };
  };

  const right = (k: Sys) => systems[k].map((g, i) => g === truth[i]);
  const boot = bootstrap(right('jev'), right('nbKeyword'));
  const delta = r4(pooled.jev.accuracy - pooled.nbKeyword.accuracy);
  const primary = verdict(delta, boot.diff, TIE_BAND);
  const sensitivity = verdict(delta, boot.diff, SENSITIVITY_BAND);
  const falsified = primary !== 'jev-ahead';

  // Coverage beside accuracy (META-PLAN §9.2): descriptive top-p sweep, nothing fitted.
  const jevRight = right('jev');
  const sweep = SWEEP.map(t => {
    const kept = ids.map((id, i) => i).filter(i => systems.jev[i] !== null && topP(ids[i]) >= t);
    return { threshold: t, coverage: r4(kept.length / ids.length), accuracyOnCovered: kept.length ? r4(kept.filter(i => jevRight[i]).length / kept.length) : null, n: kept.length };
  });

  // Repeatability against the earlier v2 fit run (jev-latest, same wording, same 80).
  let repeatability: unknown = null;
  try {
    const fit = JSON.parse(await readFile(new URL('./results/e3-fit.json', import.meta.url), 'utf8'));
    const old = new Map<string, string | null>((fit.variants.v2.preds as any[]).map(p => [p.id, p.choice]));
    const both = ids.filter(id => old.get(id) != null && jevChoice(id) !== null);
    repeatability = {
      against: `results/e3-fit.json variants.v2 (${fit.model ?? 'jev-latest (direct)'})`,
      comparable: both.length,
      sameChoice: both.filter(id => old.get(id) === jevChoice(id)).length,
      oldAccuracy: fit.variants.v2.score?.accuracy ?? null,
    };
  } catch {}

  const answeredByValues = [...new Set(readings.map(r => r.answeredBy).filter(Boolean))];
  const pct = (x: number) => (x * 100).toFixed(1) + '%';
  const ciTxt = (c: [number, number]) => `${pct(c[0])}–${pct(c[1])}`;
  const headline =
    `IN-SAMPLE for Jev: Jev v2 ${pct(pooled.jev.accuracy)} (CI95 ${ciTxt(boot.a)}) vs fold-held-out NB keyword ` +
    `${pct(pooled.nbKeyword.accuracy)} (CI95 ${ciTxt(boot.b)}) on n=80, Δ ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pts ` +
    `(paired CI95 ${(boot.diff[0] * 100).toFixed(1)}…${(boot.diff[1] * 100).toFixed(1)}) → ${primary} at the 0.11 band. ` +
    `Jev's descriptions were written from all 80 items, so its number is an upper bound, not generalisation.`;

  const out = {
    experiment: 'E3-K · 5-fold on the 80 CETI hooks (in-sample for Jev)',
    preregistration: 'program/E3-KFOLD-PREREG.md',
    validity: 'in-sample for Jev; fold-held-out for the keyword baseline',
    validityDetail:
      'Jev v2 option descriptions (program/e3-questions.ts) were authored by reading all 80 items and labels; no fold is unseen by Jev. ' +
      'Only the naive-Bayes keyword baseline, the majority class and the hybrid τ are fitted on k−1 folds and scored on the held-out fold. ' +
      'The E3 hand-written regex was also written from all 80 (in-sample reference); the E1 keyword baseline was written without labels (unfitted reference).',
    approval: { by: 'Manu', date: '2026-09-21', decision: 'k-fold on the 80, reported as in-sample' },
    hypothesis:
      'Jev v2 (in-sample) pooled accuracy on the 80 exceeds the fold-held-out NB keyword baseline by ≥ 0.11, with the paired bootstrap 95% CI of the difference excluding 0.',
    falsifier: 'Δ < 0.11, or the paired 95% CI of Δ includes 0 (tie), or the baseline is ahead.',
    headline,
    // Reporting contract, in order: n, baseline, result, delta, falsified.
    n: { items: hooks.length, folds: K, foldSizes: folds.map(f => f.length) },
    baseline: { system: 'multinomial naive Bayes on tokens, α=1, fitted on k−1 folds', accuracy: pooled.nbKeyword.accuracy, ci95: boot.b, macroRecall: pooled.nbKeyword.macroRecall, coverage: pooled.nbKeyword.coverage },
    result: { system: `Jev ${VARIANT} (fixed descriptions, in-sample)`, accuracy: pooled.jev.accuracy, ci95: boot.a, macroRecall: pooled.jev.macroRecall, coverage: pooled.jev.coverage },
    delta: { jevMinusBaseline: delta, pairedCi95: boot.diff, mcnemar: mcnemar(right('jev'), right('nbKeyword')), tieBand: TIE_BAND, verdict: primary, sensitivityAt015: sensitivity },
    falsified,
    model: JEV_ID,
    answeredBy: answeredByValues,
    callsUsed,
    callBudget: CALL_BUDGET,
    failures: readings.filter(r => r.error).map(r => ({ id: r.id, error: r.error })),
    corpus: { path: CORPUS_PATH, sha256: sha },
    folds: { path: 'program/results/e3-kfold-folds.json', sha256: FOLDS_SHA256, seed: SEED, disjointness },
    pooled,
    perFold,
    foldSpread: Object.fromEntries((Object.keys(systems) as Sys[]).map(k => [k, foldSpread(k)])),
    hybrid: { rule: 'Jev if top-p ≥ τ else fold-fitted NB; τ chosen on training folds (grid, tie → smallest)', tauPerFold, secondary: true },
    coverageSweep: sweep,
    confusion: { jev: confusion(truth, systems.jev), nbKeyword: confusion(truth, systems.nbKeyword) },
    repeatability,
    rows: ids.map((id, i) => ({
      id,
      fold: foldOf.get(id),
      truth: truth[i],
      jev: systems.jev[i],
      probabilities: readingOf.get(id)?.probabilities ?? null,
      nbKeyword: systems.nbKeyword[i],
      hybrid: systems.hybrid[i],
      e3Regex: systems.e3RegexInSample[i],
      e1Keyword: systems.e1KeywordUnfitted[i],
    })),
    readings,
    telemetry,
    analysedAt: new Date().toISOString(),
    ...(analyseOnly ? { reanalysed: true, firstRunAt: prior.firstRunAt ?? prior.analysedAt } : { firstRunAt: new Date().toISOString() }),
  };
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(headline);
  console.log(JSON.stringify({ pooled: Object.fromEntries(Object.entries(pooled).map(([k, s]) => [k, [s.accuracy, s.macroRecall, s.coverage]])), foldSpread: out.foldSpread, delta: out.delta, callsUsed, answeredBy: answeredByValues, tauPerFold }, null, 1));
}

main().catch(e => {
  console.error(e?.message ?? e);
  process.exit(1);
});
