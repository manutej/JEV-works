/**
 * E3 — blind test: fit on consensus, validate on untouched real labels (PROGRAM.md).
 *
 * Three modes, run in this order, each a separate process so the holdout cannot be reached by accident:
 *
 *   fit <v1|v2|v3>  one Jev choice per fit item with that question variant → results/e3-fit.json
 *   freeze          pick the variant and fit τ on the 80 only, stamp the git commit → results/e3-blind.json
 *   holdout         ONE run on the 39 with the frozen question → scores + verdict into results/e3-blind.json
 *
 * Hypothesis (fixed by PROGRAM.md, not editable here):
 *   Holdout accuracy drops less than 5 points from fit, and beats the baseline.
 * Falsified if:
 *   the drop exceeds 5 points (overfitting to the fit set) or the baseline wins.
 * Read through P4 (0.11 floor) for "wins"/"beats"; the 5-point rule is applied as written. See
 * E3-PROGRESS.md A3/A4 for why those two sit uneasily together.
 *
 *   source ~/.zshrc >/dev/null 2>&1; /opt/homebrew/bin/node program/e3-blind.ts fit v2
 */
import { experimental_evaluate as evaluate } from 'ai';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { CORPUS_PATH, FORMULA_KEYS, type Hook } from './formulas.ts';
import { keywordClassify } from './keyword-baseline.ts';
import { e3KeywordClassify, E3_MAJORITY_CLASS } from './e3-keyword-baseline.ts';
import { VARIANTS, type VariantName } from './e3-questions.ts';
import { entropy } from '../question-bank/colors.ts';
import { pool, costFromUsage, type UsageRow } from './stats.ts';
import { JEV, JEV_ID, JEV_PRICE_ID } from '../lib/jev.ts';
import { RunLog } from '../lib/telemetry.ts';

const HOLDOUT_PATH = '/Users/manu/CETI/PISCES-MARKETING/assets/ceti-silver-hooks-approved.json';
// Recorded before any E3 code existed (E3-PROGRESS.md "Holdout custody"). The run refuses a different file.
const HOLDOUT_SHA256 = '3948c5b38d1b48efdfc745021ea03fc689039a2ae2143161e3852b6e52a099c1';
const HOLDOUT_N = 39;

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4); // a leads run shares the rate limit
const MAX_RETRIES = 2;
const NOISE_FLOOR = 0.11; // PROGRAM.md ground rule 6 (P4)
const DROP_LIMIT = 0.05; // PROGRAM.md E3: "drops less than 5 points"
const TAU_GRID = [0, ...Array.from({ length: 15 }, (_, i) => +(0.2 + i * 0.05).toFixed(2))];

const ROOT = new URL('..', import.meta.url).pathname;
const FIT_OUT = new URL('./results/e3-fit.json', import.meta.url).pathname;
const OUT = new URL('./results/e3-blind.json', import.meta.url).pathname;
// Everything that decides a prediction. The holdout run refuses if any differs from the frozen commit.
const FROZEN_FILES = [
  'program/e3-blind.ts',
  'program/e3-questions.ts',
  'program/e3-keyword-baseline.ts',
  'program/keyword-baseline.ts',
  'program/formulas.ts',
  'lib/jev.ts',
  'lib/jev-direct.ts',
];

// ── scoring ───────────────────────────────────────────────────────────────

type Pred = { id: string; formula: string; text: string; choice: string | null; probabilities?: Record<string, number>; error?: string };

type Score = {
  n: number;
  correct: number;
  accuracy: number;
  macroRecall: number;
  perClass: Record<string, { n: number; correct: number; recall: number; insufficientData: boolean }>;
};

function score(truth: readonly string[], guesses: readonly (string | null)[]): Score {
  const perClass: Score['perClass'] = {};
  let correct = 0;
  truth.forEach((t, i) => {
    const c = (perClass[t] ??= { n: 0, correct: 0, recall: 0, insufficientData: false });
    c.n++;
    if (guesses[i] === t) {
      c.correct++;
      correct++;
    }
  });
  for (const c of Object.values(perClass)) {
    c.recall = +(c.correct / c.n).toFixed(4);
    c.insufficientData = c.n < 8; // I3: no per-class verdict below 8
  }
  const recalls = Object.values(perClass).map(c => c.recall);
  return {
    n: truth.length,
    correct,
    // A failed call is a wrong answer, never a dropped item — the denominator is always n.
    accuracy: +(correct / truth.length).toFixed(4),
    macroRecall: +(recalls.reduce((a, b) => a + b, 0) / recalls.length).toFixed(4),
    perClass,
  };
}

function confusion(truth: readonly string[], guesses: readonly (string | null)[]): Record<string, Record<string, number>> {
  const m: Record<string, Record<string, number>> = {};
  truth.forEach((t, i) => {
    const g = guesses[i] ?? '(failed)';
    m[t] ??= {};
    m[t][g] = (m[t][g] ?? 0) + 1;
  });
  return m;
}

const topProb = (p: Pred) => (p.probabilities && p.choice ? p.probabilities[p.choice] ?? 0 : 0);
const hybrid = (p: Pred, tau: number) => (p.choice !== null && topProb(p) >= tau ? p.choice : e3KeywordClassify(p.text));

/** Deterministic PRNG so the bootstrap CI is reproducible from the result file alone. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95% percentile bootstrap CI of mean(a) - mean(b), resampling each set independently. */
function bootstrapDiffCI(a: readonly boolean[], b: readonly boolean[], draws = 10000, seed = 7): [number, number] {
  const rnd = mulberry32(seed);
  const resampleMean = (xs: readonly boolean[]) => {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rnd() * xs.length)] ? 1 : 0;
    return s / xs.length;
  };
  const diffs = Array.from({ length: draws }, () => resampleMean(a) - resampleMean(b)).sort((x, y) => x - y);
  return [+diffs[Math.floor(draws * 0.025)].toFixed(4), +diffs[Math.floor(draws * 0.975)].toFixed(4)];
}

// ── Jev ───────────────────────────────────────────────────────────────────

const isRateLimit = (msg: string) => /\b(429|rate.?limit|too many requests|5\d\d)\b/i.test(msg);

async function runJev(name: string, items: readonly Hook[], variant: VariantName): Promise<{ preds: Pred[]; usage: UsageRow[]; telemetry: ReturnType<RunLog['done']> }> {
  const q = VARIANTS[variant];
  const questions = { formula: { type: 'choice', instructions: q.instructions, criteria: q.criteria } } as const;
  const log = new RunLog(name);
  log.announce({
    model: JEV_ID,
    items: items.length,
    questions: { formula: `choice(${Object.keys(q.criteria).length}) ${variant}` },
    stateShape: '{text}  ~20 tok',
    recombination: 'argmax of the choice distribution',
    thresholdsFitted: false,
    maxRetries: MAX_RETRIES,
  });
  const usage: UsageRow[] = [];

  const preds = await pool(items, CONCURRENCY, async (hook): Promise<Pred> => {
    const base = { id: hook.id, formula: hook.formula, text: hook.text };
    // SDK retries cover transient errors; this outer loop backs off on rate limits instead of aborting.
    for (let attempt = 0; ; attempt++) {
      const t0 = performance.now();
      try {
        const { answers, usage: u } = await evaluate({
          model: JEV,
          state: { text: hook.text },
          questions,
          maxRetries: MAX_RETRIES,
          providerOptions: { gateway: { zeroDataRetention: true } },
        });
        usage.push({ model: JEV_PRICE_ID, inputTokens: u?.inputTokens ?? 0, outputTokens: u?.outputTokens ?? 0 });
        const choice = answers.formula.choice;
        log.item(hook.id, {
          verdict: choice === hook.formula ? 'right' : 'wrong',
          choice,
          p: answers.formula.probabilities?.[choice],
          ms: Math.round(performance.now() - t0),
          inputTokens: u?.inputTokens,
        });
        return { ...base, choice, probabilities: answers.formula.probabilities ?? undefined };
      } catch (e: any) {
        const msg: string = e?.message?.slice(0, 300) ?? String(e);
        if (isRateLimit(msg) && attempt < 4) {
          log.retry(hook.id, `backoff ${2 ** attempt * 5}s: ${msg}`);
          await new Promise(r => setTimeout(r, 2 ** attempt * 5000));
          continue;
        }
        log.fail(hook.id, msg);
        return { ...base, choice: null, error: msg };
      }
    }
  });
  return { preds, usage, telemetry: log.done() };
}

async function cost(usage: UsageRow[]) {
  return costFromUsage(usage).catch(e => {
    console.error('cost lookup failed:', e?.message ?? e);
    return { totalUsd: NaN, byModel: {} as Record<string, any> };
  });
}

const git = (...args: string[]) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8' }).trim();
const readJson = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
const writeJson = (p: string, x: unknown) => writeFile(p, JSON.stringify(x, null, 2) + '\n');

// ── modes ─────────────────────────────────────────────────────────────────

async function fit(variant: VariantName) {
  if (!(variant in VARIANTS)) throw new Error(`unknown variant ${variant}; expected one of ${Object.keys(VARIANTS).join(', ')}`);
  const corpus: Hook[] = await readJson(CORPUS_PATH);
  const t0 = performance.now();
  const { preds, usage, telemetry } = await runJev(`e3-fit-${variant}`, corpus, variant);
  const truth = preds.map(p => p.formula);
  const guesses = preds.map(p => p.choice);

  const prev = existsSync(FIT_OUT) ? await readJson(FIT_OUT) : { variants: {} };
  prev.model = JEV_ID;
  prev.n = corpus.length;
  prev.variants[variant] = {
    ranAt: new Date().toISOString(),
    question: VARIANTS[variant],
    score: score(truth, guesses),
    errors: preds.filter(p => p.error).length,
    meanEntropy: +(preds.filter(p => p.probabilities).reduce((s, p) => s + entropy(p.probabilities), 0) / preds.length).toFixed(4),
    cost: await cost(usage),
    telemetry,
    wallClockMs: Math.round(performance.now() - t0),
    preds,
  };
  // Baselines on the same 80 — recomputed each time, identical each time.
  prev.baselines = {
    e3Keyword: score(truth, corpus.map(h => e3KeywordClassify(h.text))),
    e1Keyword: score(truth, corpus.map(h => keywordClassify(h.text))),
    majorityClass: { guess: E3_MAJORITY_CLASS, ...score(truth, corpus.map(() => E3_MAJORITY_CLASS)) },
  };
  await writeJson(FIT_OUT, prev);
  const s = prev.variants[variant].score;
  console.error(`\nE3 fit ${variant}: acc ${s.accuracy} · macro recall ${s.macroRecall} · e3 keyword ${prev.baselines.e3Keyword.accuracy} · wrote ${FIT_OUT}`);
}

async function freeze() {
  const fitFile = await readJson(FIT_OUT);
  const names = Object.keys(VARIANTS) as VariantName[];
  const missing = names.filter(v => !fitFile.variants[v]);
  if (missing.length) throw new Error(`freeze needs every variant fitted; missing ${missing.join(', ')}`);
  if (existsSync(OUT) && (await readJson(OUT)).holdout) throw new Error('holdout already run — refreezing after the look would be fitting on it');

  // Declared selection rule: fit accuracy, then macro recall, then the earlier (simpler) variant.
  const ranked = [...names].sort((a, b) => {
    const sa = fitFile.variants[a].score;
    const sb = fitFile.variants[b].score;
    return sb.accuracy - sa.accuracy || sb.macroRecall - sa.macroRecall || names.indexOf(a) - names.indexOf(b);
  });
  const chosen = ranked[0];
  const preds: Pred[] = fitFile.variants[chosen].preds;
  const truth = preds.map(p => p.formula);

  // τ for the secondary hybrid, fitted on the 80: argmax accuracy, smallest τ on ties.
  const tauCurve = TAU_GRID.map(tau => ({ tau, accuracy: score(truth, preds.map(p => hybrid(p, tau))).accuracy }));
  const best = tauCurve.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));

  const dirty = git('status', '--porcelain', '--', ...FROZEN_FILES);
  if (dirty) throw new Error(`commit the E3 code before freezing; uncommitted:\n${dirty}`);
  const codeCommit = git('rev-parse', 'HEAD');

  const out = {
    experiment: 'E3',
    hypothesis: 'Holdout accuracy drops less than 5 points from fit, and beats the baseline.',
    falsifier: 'Falsified if the drop exceeds 5 points (overfitting to the fit set) or the baseline wins.',
    readings: {
      drop: `fit accuracy − holdout accuracy of the PRIMARY system; falsified if > ${DROP_LIMIT} (applied as written, below P4's ${NOISE_FLOOR}; see E3-PROGRESS A3)`,
      baseline: `E3 keyword baseline fitted on the same 80. Jev beats it if holdout Δ ≥ ${NOISE_FLOOR}; it wins if Δ ≤ −${NOISE_FLOOR}; else a tie (P4)`,
      primarySystem: 'Jev choice argmax with the frozen variant. The τ-hybrid is secondary and never decides the verdict.',
    },
    approval: {
      by: 'Manu (human-of-record)',
      date: '2026-09-21',
      question: 'Pre-approve the one-shot holdout run?',
      answer:
        'Run evaluation upon the questions and move forward with consensus but also create an html dashboard for manual review. NO stopping, keep going in the meantime and track the logs and results and assumptions.',
    },
    model: JEV_ID,
    holdoutCustody: {
      path: HOLDOUT_PATH,
      sha256: HOLDOUT_SHA256,
      items: HOLDOUT_N,
      recordedAt: '2026-09-21T21:24:05Z',
      inspectedBeforeRun: false,
    },
    frozen: {
      frozenAt: new Date().toISOString(),
      codeCommit,
      codeFiles: FROZEN_FILES,
      variant: chosen,
      selectionRule: 'highest fit accuracy; tie → higher macro recall; tie → earlier variant',
      variantRanking: ranked.map(v => ({ variant: v, accuracy: fitFile.variants[v].score.accuracy, macroRecall: fitFile.variants[v].score.macroRecall })),
      question: VARIANTS[chosen],
      hybridTau: best.tau,
      tauCurve,
      concurrency: CONCURRENCY,
      maxRetries: MAX_RETRIES,
    },
    fit: {
      n: fitFile.n,
      primary: fitFile.variants[chosen].score,
      hybrid: score(truth, preds.map(p => hybrid(p, best.tau))),
      baselines: fitFile.baselines,
      confusion: confusion(truth, preds.map(p => p.choice)),
    },
  };
  await writeJson(OUT, out);
  console.error(`frozen: ${chosen} (fit acc ${out.fit.primary.accuracy}), τ=${best.tau}, commit ${codeCommit.slice(0, 7)} → ${OUT}`);
  console.error('now commit results/e3-blind.json, then run: holdout');
}

async function holdout() {
  const out = await readJson(OUT);
  if (!out.frozen) throw new Error('run freeze first');
  if (out.holdout) throw new Error('the holdout has already been spent — E3 runs it exactly once');
  if (out.holdoutRunStartedAt && process.env.E3_RESUME_AFTER_CRASH !== '1')
    throw new Error(`a holdout run started at ${out.holdoutRunStartedAt} and did not finish; set E3_RESUME_AFTER_CRASH=1 to record a resumed run`);

  // The frozen code must be the code that runs.
  const drift = git('diff', '--name-only', out.frozen.codeCommit, '--', ...FROZEN_FILES);
  if (drift) throw new Error(`E3 code changed since the frozen commit ${out.frozen.codeCommit}:\n${drift}`);
  if (JSON.stringify(VARIANTS[out.frozen.variant as VariantName]) !== JSON.stringify(out.frozen.question))
    throw new Error('frozen question differs from the question in code');

  const raw = await readFile(HOLDOUT_PATH);
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== HOLDOUT_SHA256) throw new Error(`holdout sha256 ${sha} ≠ recorded ${HOLDOUT_SHA256}`);

  // Mark the look BEFORE the first call: from here on the holdout counts as spent, even on a crash.
  out.holdoutRunStartedAt = new Date().toISOString();
  if (process.env.E3_RESUME_AFTER_CRASH === '1') out.resumedAfterCrash = true;
  out.holdoutHeadAtRun = git('rev-parse', 'HEAD');
  await writeJson(OUT, out);

  const holdoutItems: Hook[] = JSON.parse(raw.toString('utf8'));
  // Schema check (assumption A1) — recorded, not fatal, so a surprise becomes a finding instead of a stop.
  const required = ['id', 'text', 'formula'];
  const schema = {
    n: holdoutItems.length,
    matchesRecordedCount: holdoutItems.length === HOLDOUT_N,
    missingFields: required.filter(f => holdoutItems.some(h => (h as any)[f] === undefined)),
    keys: [...new Set(holdoutItems.flatMap(h => Object.keys(h)))].sort().join(','),
    outOfSetLabels: [...new Set(holdoutItems.map(h => h.formula).filter(f => !FORMULA_KEYS.includes(f)))],
  };
  const fitCorpus: Hook[] = await readJson(CORPUS_PATH);
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const fitTexts = new Set(fitCorpus.map(h => norm(h.text)));
  const overlapIds = holdoutItems.filter(h => fitTexts.has(norm(h.text))).map(h => h.id);

  const t0 = performance.now();
  const { preds, usage, telemetry } = await runJev('e3-holdout', holdoutItems, out.frozen.variant);
  const truth = preds.map(p => p.formula);
  const primaryGuesses = preds.map(p => p.choice);
  const kwGuesses = holdoutItems.map(h => e3KeywordClassify(h.text));

  const primary = score(truth, primaryGuesses);
  const hybridScore = score(truth, preds.map(p => hybrid(p, out.frozen.hybridTau)));
  const baselines = {
    e3Keyword: score(truth, kwGuesses),
    e1Keyword: score(truth, holdoutItems.map(h => keywordClassify(h.text))),
    majorityClass: { guess: E3_MAJORITY_CLASS, ...score(truth, holdoutItems.map(() => E3_MAJORITY_CLASS)) },
  };
  const fresh = preds.filter(p => !overlapIds.includes(p.id));
  const dedup = fresh.length
    ? {
        n: fresh.length,
        primary: score(fresh.map(p => p.formula), fresh.map(p => p.choice)),
        e3Keyword: score(fresh.map(p => p.formula), fresh.map(p => e3KeywordClassify(p.text))),
      }
    : null;

  // ── verdict ──
  const fitAcc: number = out.fit.primary.accuracy;
  const drop = +(fitAcc - primary.accuracy).toFixed(4);
  const vsBaseline = +(primary.accuracy - baselines.e3Keyword.accuracy).toFixed(4);
  const dropExceeds5Points = drop > DROP_LIMIT;
  const baselineWins = vsBaseline <= -NOISE_FLOOR;
  const jevBeatsBaseline = vsBaseline >= NOISE_FLOOR;
  const falsified = dropExceeds5Points || baselineWins;
  const hypothesisSupported = !dropExceeds5Points && jevBeatsBaseline;

  const fitCorrect: boolean[] = (await readJson(FIT_OUT)).variants[out.frozen.variant].preds.map((p: Pred) => p.choice === p.formula);
  const holdoutCorrect = preds.map(p => p.choice === p.formula);
  const baselineCorrect = kwGuesses.map((g, i) => g === truth[i]);

  const { totalUsd } = await cost(usage);
  const verdictWord = falsified ? 'FALSIFIED' : hypothesisSupported ? 'SUPPORTED' : 'NOT falsified, NOT supported (tie with baseline)';
  let headline = `E3: holdout acc ${(primary.accuracy * 100).toFixed(0)}% vs keyword ${(baselines.e3Keyword.accuracy * 100).toFixed(0)}%, drop ${(drop * 100).toFixed(0)} pts — ${verdictWord}`;
  if (headline.length >= 140) headline = headline.slice(0, 137) + '...';

  Object.assign(out, {
    headline,
    // Reporting contract order: n, baseline, result, delta, falsified.
    n: { fit: out.fit.n, holdout: holdoutItems.length },
    baseline: {
      name: 'E3 keyword baseline (fitted on the same 80)',
      fitAccuracy: out.fit.baselines.e3Keyword.accuracy,
      holdoutAccuracy: baselines.e3Keyword.accuracy,
      holdoutMacroRecall: baselines.e3Keyword.macroRecall,
    },
    result: {
      system: `Jev choice, variant ${out.frozen.variant}`,
      fitAccuracy: fitAcc,
      holdoutAccuracy: primary.accuracy,
      holdoutMacroRecall: primary.macroRecall,
    },
    delta: {
      fitToHoldoutDrop: drop,
      fitToHoldoutDropCI95: bootstrapDiffCI(fitCorrect, holdoutCorrect),
      holdoutVsBaseline: vsBaseline,
      holdoutVsBaselineCI95: bootstrapDiffCI(holdoutCorrect, baselineCorrect),
      baselineFitToHoldoutDrop: +(out.fit.baselines.e3Keyword.accuracy - baselines.e3Keyword.accuracy).toFixed(4),
    },
    falsified,
    falsifiedBecause: { dropExceeds5Points, baselineWins, drop, holdoutVsBaseline: vsBaseline },
    hypothesisSupported,
    baselineAheadRaw: vsBaseline < 0,
    holdout: {
      ranAt: out.holdoutRunStartedAt,
      schema,
      fitOverlap: { count: overlapIds.length, ids: overlapIds },
      primary,
      hybrid: { tau: out.frozen.hybridTau, ...hybridScore },
      baselines,
      dedup,
      confusion: confusion(truth, primaryGuesses),
      baselineConfusion: confusion(truth, kwGuesses),
      errors: preds.filter(p => p.error).length,
      cost: { totalUsd },
      telemetry,
      wallClockMs: Math.round(performance.now() - t0),
      rows: preds.map((p, i) => ({
        ...p,
        entropy: p.probabilities ? +entropy(p.probabilities).toFixed(4) : null,
        baseline: kwGuesses[i],
        jevCorrect: p.choice === p.formula,
        baselineCorrect: kwGuesses[i] === p.formula,
        inFitSet: overlapIds.includes(p.id),
      })),
    },
  });
  await writeJson(OUT, out);
  console.error(`\n${headline}\nwrote ${OUT}`);
}

const [mode, arg] = process.argv.slice(2);
const run = mode === 'fit' ? fit(arg as VariantName) : mode === 'freeze' ? freeze() : mode === 'holdout' ? holdout() : null;
if (!run) {
  console.error('usage: e3-blind.ts fit <v1|v2|v3> | freeze | holdout');
  process.exit(2);
}
run.catch(e => {
  console.error(e?.message ?? e);
  process.exit(1);
});
