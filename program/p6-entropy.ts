/**
 * P6 — does normalised entropy separate garbage from clean input at n≈200? (P6-PREREG.md)
 *
 * One Jev call per item in program/p6-corpus.json: the item's choice question plus the bank's
 * CLASSIFICATION.onTopic boolean. Thresholds are fit on the fit half only; the test half is
 * scored once. The pre-registered falsifier is evaluated here and nowhere else.
 *
 *   /opt/homebrew/bin/node program/p6-entropy.ts            # calls Jev, then analyses
 *   P6_ANALYSE_ONLY=1 /opt/homebrew/bin/node program/p6-entropy.ts   # re-analyse saved readings, 0 calls
 */
import { experimental_evaluate as evaluate } from 'ai';
import { readFile, writeFile } from 'node:fs/promises';
import { JEV, JEV_ID, answeredBy } from '../lib/jev.ts';
import { CLASSIFICATION } from '../question-bank/bank.ts';
import { entropy } from '../question-bank/colors.ts';
import { pool, median, quantile, auc } from './stats.ts';
import type { P6Item, P6Question } from './p6-build-corpus.ts';

const CORPUS_PATH = new URL('./p6-corpus.json', import.meta.url).pathname;
const OUT_PATH = new URL('./results/p6-entropy.json', import.meta.url).pathname;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 5;
const CALL_BUDGET = 600;
const BOOT = 2000;
const BOOT_SEED = 20260921;

// Pre-registered thresholds (P6-PREREG.md). Not tuned after the run.
const F1_MIN_AUC = 0.85;
const F2_MIN_DELTA = 0.05;
const I5_WITHIN = 0.05;
const NOISE_FLOOR = 0.11; // P4
const MIN_CELL = 40;

// Both questions are the bank's CLASSIFICATION.label template with its labels filled in — the
// instruction text is the bank's, verbatim. No catch-all option, by design (see prereg).
const CHOICE: Record<P6Question, Record<string, string>> = {
  toolKind: {
    shell_output: 'Output printed by a shell command: terminal text, listings, versions, exit codes, stack traces.',
    file_contents: 'The contents of a file, printed with a line number at the start of each line.',
    file_changed: 'A confirmation that a file was created or updated.',
    message_receipt: 'A JSON receipt confirming a message was delivered to a named recipient.',
  },
  docGenre: {
    library_docs: 'Reference documentation for a software library: its features, options, and how to call its APIs.',
    research_note: 'A note reporting findings about how an AI model behaves: measurements, results, and recommendations.',
  },
};
const questionsFor = (q: P6Question) => ({
  label: { ...CLASSIFICATION.questions.label, criteria: CHOICE[q] },
  onTopic: CLASSIFICATION.questions.onTopic,
});

type Reading = {
  id: string;
  choice: string | null;
  probabilities: Record<string, number> | null;
  entropy: number | null;
  topP: number | null;
  onTopicP: number | null;
  /** TypeSafe's own per-choice confidence, if returned. Exploratory — not in the prereg. */
  vendorConfidence: number | null;
  answeredBy: string | null;
  ms: number | null;
  attempts: number;
  error?: string;
};

let attemptsUsed = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function read(item: P6Item): Promise<Reading> {
  const blank = { choice: null, probabilities: null, entropy: null, topP: null, onTopicP: null, vendorConfidence: null, answeredBy: null, ms: null };
  for (let attempt = 1; ; attempt++) {
    if (attemptsUsed >= CALL_BUDGET) return { id: item.id, ...blank, attempts: attempt - 1, error: 'call budget exhausted' };
    attemptsUsed++;
    const t = performance.now();
    try {
      const r = await evaluate({ model: JEV, state: { text: item.text }, questions: questionsFor(item.question) as never, maxRetries: 0 });
      const a = r.answers as unknown as {
        label: { choice: string; probabilities?: Record<string, number> };
        onTopic: { probability: number };
      };
      const probs = a.label.probabilities ?? null;
      const h = probs ? entropy(probs) : NaN;
      const conf = (r.providerMetadata as any)?.typesafe?.confidence?.label;
      return {
        id: item.id,
        choice: a.label.choice,
        probabilities: probs,
        entropy: Number.isFinite(h) ? +h.toFixed(4) : null,
        topP: probs ? +(probs[a.label.choice] ?? Math.max(...Object.values(probs))).toFixed(4) : null,
        onTopicP: Number.isFinite(a.onTopic?.probability) ? +a.onTopic.probability.toFixed(4) : null,
        vendorConfidence: typeof conf === 'number' ? conf : null,
        answeredBy: answeredBy(r),
        ms: Math.round(performance.now() - t),
        attempts: attempt,
      };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300);
      const transient = /\b(429|500|502|503|504)\b|timed? ?out|ECONNRESET|fetch failed|rate/i.test(msg);
      if (!transient || attempt >= MAX_ATTEMPTS) return { id: item.id, ...blank, attempts: attempt, error: msg };
      await sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
    }
  }
}

// ───────────────────────────────────────────────────────── analysis

type Scored = P6Item & Reading & { nonWs: number };

/** Each signal is oriented so that HIGHER = more garbage-like. */
const SIGNALS = {
  entropy: (r: Scored) => r.entropy,
  oneMinusTopP: (r: Scored) => (r.topP === null ? null : 1 - r.topP),
  lengthBaseline: (r: Scored) => -r.nonWs,
  oneMinusOnTopic: (r: Scored) => (r.onTopicP === null ? null : 1 - r.onTopicP),
} as const;
type Signal = keyof typeof SIGNALS;

function scoresOf(rows: Scored[], s: Signal) {
  const kept = rows.filter(r => SIGNALS[s](r) !== null);
  return { x: kept.map(r => SIGNALS[s](r) as number), y: kept.map(r => r.label === 'garbage') };
}

/** Youden's J on the fit half: flag garbage when score >= t. */
function fitThreshold(x: number[], y: boolean[]) {
  const P = y.filter(Boolean).length, N = y.length - P;
  let best = { t: Infinity, j: -Infinity };
  for (const t of [...new Set(x)].sort((a, b) => a - b)) {
    let tp = 0, fp = 0;
    x.forEach((v, i) => { if (v >= t) (y[i] ? tp++ : fp++); });
    const j = tp / P - fp / N;
    if (j > best.j) best = { t, j };
  }
  return best;
}

function applyThreshold(x: number[], y: boolean[], t: number) {
  let tp = 0, fp = 0;
  const P = y.filter(Boolean).length, N = y.length - P;
  x.forEach((v, i) => { if (v >= t) (y[i] ? tp++ : fp++); });
  const tpr = tp / P, fpr = fp / N;
  return { garbageCaught: +tpr.toFixed(4), cleanFlagged: +fpr.toFixed(4), balancedAccuracy: +((tpr + 1 - fpr) / 2).toFixed(4) };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stratified bootstrap over the test rows; the same resample feeds every signal, so differences are paired. */
function bootstrap(rows: Scored[]) {
  const rng = mulberry32(BOOT_SEED);
  const pos = rows.filter(r => r.label === 'garbage'), neg = rows.filter(r => r.label === 'clean');
  const draws: Record<Signal | 'deltaEntropyTopP', number[]> = { entropy: [], oneMinusTopP: [], lengthBaseline: [], oneMinusOnTopic: [], deltaEntropyTopP: [] };
  for (let b = 0; b < BOOT; b++) {
    const s = [...pos.map(() => pos[Math.floor(rng() * pos.length)]), ...neg.map(() => neg[Math.floor(rng() * neg.length)])];
    const a: Partial<Record<Signal, number>> = {};
    for (const k of Object.keys(SIGNALS) as Signal[]) {
      const { x, y } = scoresOf(s, k);
      a[k] = auc(x, y);
      draws[k].push(a[k]!);
    }
    draws.deltaEntropyTopP.push(a.entropy! - a.oneMinusTopP!);
  }
  const ci = (xs: number[]) => [quantile(xs, 0.025), quantile(xs, 0.975)].map(v => +v.toFixed(4));
  return Object.fromEntries(Object.entries(draws).map(([k, v]) => [k, ci(v)])) as Record<Signal | 'deltaEntropyTopP', number[]>;
}

const r4 = (v: number) => (Number.isFinite(v) ? +v.toFixed(4) : null);

function aucTable(rows: Scored[]) {
  return Object.fromEntries((Object.keys(SIGNALS) as Signal[]).map(k => {
    const { x, y } = scoresOf(rows, k);
    return [k, r4(auc(x, y))];
  })) as Record<Signal, number | null>;
}

function analyse(items: P6Item[], readings: Reading[]) {
  const byId = new Map(readings.map(r => [r.id, r]));
  const all: Scored[] = items.map(it => ({ ...it, ...byId.get(it.id)!, nonWs: it.text.replace(/\s/g, '').length }));
  const ok = all.filter(r => !r.error && r.entropy !== null);
  const fit = ok.filter(r => r.split === 'fit');
  const test = ok.filter(r => r.split === 'test');

  const n = (rs: Scored[]) => ({ clean: rs.filter(r => r.label === 'clean').length, garbage: rs.filter(r => r.label === 'garbage').length });

  const thresholds = Object.fromEntries((Object.keys(SIGNALS) as Signal[]).map(k => {
    const f = scoresOf(fit, k), t = scoresOf(test, k);
    const { t: thr, j } = fitThreshold(f.x, f.y);
    return [k, { fitThreshold: r4(thr), fitYoudenJ: r4(j), fitHalf: applyThreshold(f.x, f.y, thr), testHalf: applyThreshold(t.x, t.y, thr) }];
  }));

  const testAuc = aucTable(test);
  const ci = bootstrap(test);

  const hG = test.filter(r => r.label === 'garbage').map(r => r.entropy!);
  const hC = test.filter(r => r.label === 'clean').map(r => r.entropy!);
  const margin = quantile(hG, 0.05) - quantile(hC, 0.95);

  const perQuestion = Object.fromEntries((['toolKind', 'docGenre'] as const).map(q => {
    const rs = test.filter(r => r.question === q);
    const cells = n(rs);
    return [q, { n: cells, insufficientData: cells.clean < MIN_CELL || cells.garbage < MIN_CELL, auc: aucTable(rs) }];
  }));

  const kinds = [...new Set(test.filter(r => r.label === 'garbage').map(r => r.kind))];
  const perGarbageKind = Object.fromEntries(kinds.map(k => {
    const g = test.filter(r => r.label === 'garbage' && r.kind === k);
    const rs = [...g, ...test.filter(r => r.label === 'clean')];
    return [k, {
      n: g.length,
      entropyMedian: r4(median(g.map(r => r.entropy!))),
      entropyRange: [r4(Math.min(...g.map(r => r.entropy!))), r4(Math.max(...g.map(r => r.entropy!)))],
      topPMedian: r4(median(g.map(r => r.topP!))),
      aucVsAllClean: aucTable(rs),
    }];
  }));

  const clean = ok.filter(r => r.label === 'clean');
  const correct = clean.filter(r => r.choice === r.expected);
  const testCorrectOnly = test.filter(r => r.label === 'garbage' || r.choice === r.expected);

  const eAuc = testAuc.entropy ?? NaN, pAuc = testAuc.oneMinusTopP ?? NaN, lAuc = testAuc.lengthBaseline ?? NaN;
  const delta = eAuc - pAuc;
  const F1 = !(eAuc >= F1_MIN_AUC);
  const F2 = !(delta >= F2_MIN_DELTA);
  const cellsTest = n(test);
  const insufficient = cellsTest.clean < MIN_CELL || cellsTest.garbage < MIN_CELL;

  const because: string[] = [];
  if (F1) because.push(`F1: test AUC(entropy) ${eAuc.toFixed(3)} < ${F1_MIN_AUC}`);
  if (F2) because.push(`F2: AUC(entropy) − AUC(1−topP) = ${delta.toFixed(3)} < ${F2_MIN_DELTA}`);

  return {
    n: { total: all.length, answered: ok.length, errors: all.length - ok.length, fit: n(fit), test: cellsTest },
    insufficientData: insufficient,
    baseline: {
      name: 'length: −(non-whitespace chars), i.e. "short input is garbage"',
      testAuc: testAuc.lengthBaseline,
      ci95: ci.lengthBaseline,
      gate: thresholds.lengthBaseline,
    },
    result: {
      entropy: { testAuc: testAuc.entropy, ci95: ci.entropy, gate: thresholds.entropy },
      oneMinusTopP: { testAuc: testAuc.oneMinusTopP, ci95: ci.oneMinusTopP, gate: thresholds.oneMinusTopP },
      oneMinusOnTopic: { testAuc: testAuc.oneMinusOnTopic, ci95: ci.oneMinusOnTopic, gate: thresholds.oneMinusOnTopic, note: 'secondary: the bank\'s own abstain gate' },
      entropyByClass: {
        garbage: { median: r4(median(hG)), p5: r4(quantile(hG, 0.05)), min: r4(Math.min(...hG)), max: r4(Math.max(...hG)) },
        clean: { median: r4(median(hC)), p95: r4(quantile(hC, 0.95)), min: r4(Math.min(...hC)), max: r4(Math.max(...hC)) },
        marginP5GarbageMinusP95Clean: r4(margin),
        medianRatio: r4(median(hG) / median(hC)),
      },
    },
    delta: {
      entropyMinusTopP: r4(delta),
      entropyMinusTopPci95: ci.deltaEntropyTopP,
      entropyMinusBaseline: r4(eAuc - lAuc),
      belowP4NoiseFloor: Math.abs(delta) < NOISE_FLOOR,
    },
    falsified: F1 || F2,
    because: because.length ? because.join('; ') : `neither F1 (AUC ${eAuc.toFixed(3)} ≥ ${F1_MIN_AUC}) nor F2 (Δ ${delta.toFixed(3)} ≥ ${F2_MIN_DELTA}) triggered`,
    flags: {
      I5_baselineAsGood: lAuc >= eAuc - I5_WITHIN,
      wordingRangesDisjoint: margin > 0,
    },
    descriptive: {
      perQuestion,
      perGarbageKind,
      cleanAccuracy: { all: r4(correct.length / clean.length), n: clean.length, correct: correct.length },
      testAucCleanCorrectOnly: { n: n(testCorrectOnly), auc: aucTable(testCorrectOnly) },
      vendorConfidenceReturned: ok.filter(r => r.vendorConfidence !== null).length,
      testAucVendorConfidence: (() => {
        const rs = test.filter(r => r.vendorConfidence !== null);
        return rs.length ? r4(auc(rs.map(r => 1 - r.vendorConfidence!), rs.map(r => r.label === 'garbage'))) : null;
      })(),
    },
  };
}

async function main() {
  const corpus: { items: P6Item[] } = JSON.parse(await readFile(CORPUS_PATH, 'utf8'));
  const items = corpus.items;

  // L31: the holdout must actually be held out. Abort on any overlap.
  const fitH = new Set(items.filter(i => i.split === 'fit').map(i => i.textHash));
  const testH = new Set(items.filter(i => i.split === 'test').map(i => i.textHash));
  const fitIds = new Set(items.filter(i => i.split === 'fit').map(i => i.id));
  const hashOverlap = [...fitH].filter(h => testH.has(h)).length;
  const idOverlap = items.filter(i => i.split === 'test' && fitIds.has(i.id)).length;
  console.error(`disjointness: fit∩test by text hash = ${hashOverlap}, by id = ${idOverlap}`);
  if (hashOverlap || idOverlap) throw new Error('holdout overlaps the fit half — aborting before any call (L31)');

  let readings: Reading[];
  let wallClockMs = 0;
  if (process.env.P6_ANALYSE_ONLY) {
    readings = JSON.parse(await readFile(OUT_PATH, 'utf8')).readings;
    console.error(`analyse-only: ${readings.length} saved readings, 0 calls`);
  } else {
    console.error(`P6: ${items.length} items × 1 call, concurrency ${CONCURRENCY}, budget ${CALL_BUDGET}, model ${JEV_ID}`);
    const t0 = performance.now();
    let done = 0;
    readings = await pool(items, CONCURRENCY, async it => {
      const r = await read(it);
      if (++done % 25 === 0) console.error(`  ${done}/${items.length} (attempts ${attemptsUsed})`);
      return r;
    });
    wallClockMs = Math.round(performance.now() - t0);
  }

  const a = analyse(items, readings);
  const resolved = [...new Set(readings.map(r => r.answeredBy).filter(Boolean))];
  const prev = process.env.P6_ANALYSE_ONLY ? JSON.parse(await readFile(OUT_PATH, 'utf8')) : null;

  const out = {
    experiment: 'P6',
    prereg: 'program/P6-PREREG.md',
    hypothesis: 'Normalised choice entropy ranks garbage above clean input (test AUC ≥ 0.85) and beats 1−topP by ≥ 0.05 AUC.',
    JEV_ID,
    answeredBy: resolved,
    disjointness: { hashOverlap, idOverlap },
    ...a,
    calls: prev?.calls ?? { attempts: attemptsUsed, budget: CALL_BUDGET, wallClockMs },
    readings,
  };
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2));

  console.error(`\nwrote ${OUT_PATH}`);
  console.error(`n test: clean ${a.n.test.clean}, garbage ${a.n.test.garbage}; errors ${a.n.errors}; answeredBy ${resolved.join(',')}`);
  console.error(`test AUC  entropy ${a.result.entropy.testAuc} ${JSON.stringify(a.result.entropy.ci95)}  |  1−topP ${a.result.oneMinusTopP.testAuc} ${JSON.stringify(a.result.oneMinusTopP.ci95)}  |  length ${a.baseline.testAuc} ${JSON.stringify(a.baseline.ci95)}  |  1−onTopic ${a.result.oneMinusOnTopic.testAuc}`);
  console.error(`Δ entropy−topP ${a.delta.entropyMinusTopP} ${JSON.stringify(a.delta.entropyMinusTopPci95)}; margin p5(G)−p95(C) ${a.result.entropyByClass.marginP5GarbageMinusP95Clean}`);
  console.error(`falsified: ${a.falsified} — ${a.because}`);
  console.error(`flags: ${JSON.stringify(a.flags)}; calls ${out.calls.attempts}`);
}

main();
