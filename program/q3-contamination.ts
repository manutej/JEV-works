/**
 * Q3 — does a batch contaminate itself? (NETER.md §5 window 3; design fixed in Q3-PREREG.md)
 *
 * One six-question batch over the 71 clean toolKind states of p6-corpus.json, five calls per state:
 *
 *   A    original batch                      A′   A again (A/A noise floor)
 *   A″   A a third time (placebo)            B    toolKind descriptions reworded, same meaning
 *   C    toolKind.shell_output narrowed to failures (meaning changed) — the control
 *
 * For every question: |Δp| and flips of A-vs-X against A-vs-A′, paired by state (drift.ts method).
 * A question MOVED under X if p95 excess > 0.05 with a bootstrap CI on the mean excess above 0, or
 * ≥ 3 excess flips with a CI on the flip-rate excess above 0. Nothing here is fitted.
 *
 *   /opt/homebrew/bin/node program/q3-contamination.ts                    # calls Jev, then analyses
 *   Q3_ANALYSE_ONLY=1 /opt/homebrew/bin/node program/q3-contamination.ts  # re-analyse saved rows, 0 calls
 */
import { experimental_evaluate as evaluate } from 'ai';
import { readFile, writeFile } from 'node:fs/promises';
import { JEV, JEV_ID, answeredBy } from '../lib/jev.ts';
import { CLASSIFICATION, CONTEXT_TRIAGE } from '../question-bank/bank.ts';
import type { P6Item } from './p6-build-corpus.ts';
import { pool, mean, median, quantile } from './stats.ts';

const CORPUS_PATH = new URL('./p6-corpus.json', import.meta.url).pathname;
const OUT_PATH = new URL('./results/q3-contamination.json', import.meta.url).pathname;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 6;
const CALL_BUDGET = 800;
const BOOT = 2000;
const BOOT_SEED = 20260921;

// Pre-registered (Q3-PREREG.md). Hand-set, not fitted.
const P95_MARGIN = 0.05;
const FLIP_EXCESS = 3;

const TARGET = 'toolKind';
const OTHERS = ['hasFinding', 'oneTimeSetupSettled', 'emptyOrError', 'density', 'onTopic'] as const;
const COUPLED = new Set<string>(['onTopic']); // refers to the target's categories; excluded from the C verdict

// A: P6's toolKind options, verbatim (program/p6-entropy.ts).
const ORIGINAL = {
  shell_output: 'Output printed by a shell command: terminal text, listings, versions, exit codes, stack traces.',
  file_contents: 'The contents of a file, printed with a line number at the start of each line.',
  file_changed: 'A confirmation that a file was created or updated.',
  message_receipt: 'A JSON receipt confirming a message was delivered to a named recipient.',
};
// B: same meaning, new words, every description.
const REWORDED = {
  shell_output: 'Text that a terminal command printed: console output, directory listings, version strings, exit codes, or stack traces.',
  file_contents: "A file's text shown with a line number prefixed to every line.",
  file_changed: 'A notice that a file has been written or modified.',
  message_receipt: 'A JSON acknowledgement that a message reached a specific named recipient.',
};
// C: one description's meaning changed; the other three verbatim.
const MEANING_CHANGED = {
  ...ORIGINAL,
  shell_output: 'An error reported by a shell command: a failure message, a non-zero exit code, or a stack trace.',
};

const batch = (criteria: Record<string, string>) => ({
  [TARGET]: { ...CLASSIFICATION.questions.label, criteria },
  hasFinding: CONTEXT_TRIAGE.questions.hasFinding,
  oneTimeSetupSettled: CONTEXT_TRIAGE.questions.oneTimeSetupSettled,
  emptyOrError: CONTEXT_TRIAGE.questions.emptyOrError,
  density: CONTEXT_TRIAGE.questions.density,
  onTopic: CLASSIFICATION.questions.onTopic,
});

type Cond = 'A' | 'A1' | 'A2' | 'B' | 'C';
const CONDS: Record<Cond, { label: string; criteria: Record<string, string> }> = {
  A: { label: 'original', criteria: ORIGINAL },
  A1: { label: "original again (A′, A/A noise)", criteria: ORIGINAL },
  A2: { label: 'original a third time (A″, placebo)', criteria: ORIGINAL },
  B: { label: 'toolKind reworded, same meaning', criteria: REWORDED },
  C: { label: 'toolKind.shell_output meaning changed (control)', criteria: MEANING_CHANGED },
};

type Answer =
  | { type: 'boolean'; probability: number }
  | { type: 'choice'; choice: string; probabilities?: Record<string, number> }
  | { type: 'score'; score: number; probabilities?: Record<string, number> };
type Call = { answeredBy: string; ms: number; attempts: number; answers: Record<string, Answer> } | { error: string; attempts: number };
type Row = { id: string; expected: string; order: Cond[]; calls: Record<Cond, Call> };

// ─────────────────────────────────────────────────────────────── calls

let attemptsUsed = 0;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const shuffle = <T>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

async function call(id: string, cond: Cond, text: string): Promise<Call> {
  for (let attempt = 1; ; attempt++) {
    if (attemptsUsed >= CALL_BUDGET) return { error: 'call budget exhausted', attempts: attempt - 1 };
    attemptsUsed++;
    const t = performance.now();
    try {
      const r = await evaluate({ model: JEV, state: { text }, questions: batch(CONDS[cond].criteria) as never, maxRetries: 0 });
      return { answeredBy: answeredBy(r), ms: Math.round(performance.now() - t), attempts: attempt, answers: r.answers as unknown as Record<string, Answer> };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300);
      const transient = /\b(429|500|502|503|504)\b|timed? ?out|ECONNRESET|fetch failed/i.test(msg);
      if (!transient || attempt >= MAX_ATTEMPTS) {
        console.log(`  FAIL ${id}:${cond}: ${msg.slice(0, 120)}`);
        return { error: msg, attempts: attempt };
      }
      console.log(`  retry ${id}:${cond}: ${msg.slice(0, 90)}`);
      await sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
    }
  }
}

// ─────────────────────────────────────────────────────────── comparison

const ok = (c: Call | undefined): c is Extract<Call, { answers: unknown }> => !!c && 'answers' in c;
const r4 = (x: number) => (Number.isFinite(x) ? +x.toFixed(4) : null);
const argmax = (p: Record<string, number> = {}) => Object.entries(p).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

function linf(a: Record<string, number> = {}, b: Record<string, number> = {}) {
  let m = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) m = Math.max(m, Math.abs((a[k] ?? 0) - (b[k] ?? 0)));
  return m;
}

/** Same definitions as program/drift.ts. */
function delta(a: Answer, b: Answer): { dp: number; flip: boolean } {
  if (a.type === 'boolean' && b.type === 'boolean') return { dp: Math.abs(a.probability - b.probability), flip: a.probability >= 0.5 !== b.probability >= 0.5 };
  if (a.type === 'choice' && b.type === 'choice') return { dp: linf(a.probabilities, b.probabilities), flip: a.choice !== b.choice };
  if (a.type === 'score' && b.type === 'score') return { dp: linf(a.probabilities, b.probabilities), flip: argmax(a.probabilities) !== argmax(b.probabilities) };
  return { dp: 1, flip: true };
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

/** Paired bootstrap over states: 95% CI of mean(x − y). Seeded per comparison, so a re-analysis is identical. */
function pairedCI(x: number[], y: number[]): [number | null, number | null] {
  const rng = mulberry32(BOOT_SEED);
  const n = x.length;
  const stats: number[] = [];
  for (let b = 0; b < BOOT; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rng() * n);
      s += x[j] - y[j];
    }
    stats.push(s / n);
  }
  return [r4(quantile(stats, 0.025)), r4(quantile(stats, 0.975))];
}

const summarise = (dp: number[], flips: boolean[]) => ({
  n: dp.length,
  medianDp: r4(median(dp)),
  p95Dp: r4(quantile(dp, 0.95)),
  maxDp: r4(dp.length ? Math.max(...dp) : NaN),
  flips: flips.filter(Boolean).length,
});

/** Per-question test of A-vs-X against A-vs-A′, on states where A, A′ and X all answered. */
function test(rows: Row[], q: string, x: Cond) {
  const aa: { dp: number; flip: boolean }[] = [];
  const ax: { dp: number; flip: boolean }[] = [];
  for (const r of rows) {
    const A = r.calls.A, A1 = r.calls.A1, X = r.calls[x];
    if (!ok(A) || !ok(A1) || !ok(X) || !A.answers[q] || !A1.answers[q] || !X.answers[q]) continue;
    aa.push(delta(A.answers[q], A1.answers[q]));
    ax.push(delta(A.answers[q], X.answers[q]));
  }
  const noise = summarise(aa.map(d => d.dp), aa.map(d => d.flip));
  const vs = summarise(ax.map(d => d.dp), ax.map(d => d.flip));
  const p95Excess = (vs.p95Dp ?? NaN) - (noise.p95Dp ?? NaN);
  const meanExcessCI = pairedCI(ax.map(d => d.dp), aa.map(d => d.dp));
  const flipExcessCI = pairedCI(ax.map(d => +d.flip), aa.map(d => +d.flip));
  const byMagnitude = p95Excess > P95_MARGIN && (meanExcessCI[0] ?? -1) > 0;
  const byFlips = vs.flips - noise.flips >= FLIP_EXCESS && (flipExcessCI[0] ?? -1) > 0;
  return {
    question: q,
    vsNoise: noise,
    vsCondition: vs,
    p95Excess: r4(p95Excess),
    meanExcess: r4(mean(ax.map(d => d.dp)) - mean(aa.map(d => d.dp))),
    meanExcessCI95: meanExcessCI,
    flipExcess: vs.flips - noise.flips,
    flipRateExcessCI95: flipExcessCI,
    moved: byMagnitude || byFlips,
    movedBecause: { magnitude: byMagnitude, flips: byFlips },
  };
}

function accuracy(rows: Row[], c: Cond) {
  const scored = rows.flatMap(r => {
    const call = r.calls[c];
    if (!ok(call) || call.answers[TARGET]?.type !== 'choice') return [];
    return [{ expected: r.expected, got: (call.answers[TARGET] as { choice: string }).choice }];
  });
  const byClass: Record<string, string> = {};
  for (const cls of Object.keys(ORIGINAL)) {
    const s = scored.filter(x => x.expected === cls);
    byClass[cls] = `${s.filter(x => x.got === cls).length}/${s.length}`;
  }
  const picks: Record<string, number> = {};
  for (const x of scored) picks[x.got] = (picks[x.got] ?? 0) + 1;
  return { n: scored.length, accuracy: r4(scored.filter(x => x.got === x.expected).length / scored.length), byClass, picks };
}

// ─────────────────────────────────────────────────────────────── main

async function main() {
  const items = (JSON.parse(await readFile(CORPUS_PATH, 'utf8')).items as P6Item[]).filter(i => i.question === 'toolKind' && i.label === 'clean');
  if (items.length !== 71) throw new Error(`pre-registered 71 clean toolKind states, corpus has ${items.length}`);

  let rows: Row[];
  let callsMade: number;
  let startedAt: string;
  let wallClockMs: number;
  if (process.env.Q3_ANALYSE_ONLY) {
    const saved = JSON.parse(await readFile(OUT_PATH, 'utf8'));
    rows = saved.rows;
    callsMade = saved.n.callAttempts;
    startedAt = saved.startedAt;
    wallClockMs = saved.wallClockMs;
    console.log(`re-analysing ${rows.length} saved rows, 0 calls`);
  } else {
    if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is not set: `source ~/.zshrc` first (direct, pinned path only)');
    startedAt = new Date().toISOString();
    console.log(`Q3 · ${JEV_ID} · ${items.length} states × ${Object.keys(CONDS).length} conditions = ${items.length * 5} calls (cap ${CALL_BUDGET}), concurrency ${CONCURRENCY}`);
    const t0 = performance.now();
    let done = 0;
    rows = await pool(items, CONCURRENCY, async it => {
      const order = shuffle<Cond>(['A', 'A1', 'A2', 'B', 'C']);
      const calls = {} as Record<Cond, Call>;
      for (const c of order) calls[c] = await call(it.id, c, it.text);
      if (++done % 10 === 0) console.log(`  ${done}/${items.length} states, ${attemptsUsed} calls`);
      return { id: it.id, expected: it.expected!, order, calls };
    });
    callsMade = attemptsUsed;
    wallClockMs = Math.round(performance.now() - t0);
  }

  const answeredByCounts: Record<string, number> = {};
  let failed = 0;
  for (const r of rows)
    for (const c of Object.values(r.calls)) {
      if (ok(c)) answeredByCounts[c.answeredBy] = (answeredByCounts[c.answeredBy] ?? 0) + 1;
      else failed++;
    }

  const perCondition = Object.fromEntries(
    (['A2', 'B', 'C'] as Cond[]).map(x => [x, [TARGET, ...OTHERS].map(q => test(rows, q, x))]),
  ) as Record<'A2' | 'B' | 'C', ReturnType<typeof test>[]>;

  const placeboFired = perCondition.A2.filter(t => t.moved).map(t => t.question);
  const controlLive = perCondition.C.find(t => t.question === TARGET)!.moved;
  const contaminatedB = perCondition.B.filter(t => t.question !== TARGET && t.moved).map(t => t.question);
  const contaminatedC = perCondition.C.filter(t => t.question !== TARGET && !COUPLED.has(t.question) && t.moved).map(t => t.question);
  const coupledMovedC = perCondition.C.filter(t => COUPLED.has(t.question) && t.moved).map(t => t.question);

  const verdict =
    placeboFired.length ? 'INCONCLUSIVE (detector miscalibrated: placebo fired)'
    : !controlLive ? 'INCONCLUSIVE (manipulation not live: toolKind did not move under C)'
    : contaminatedB.length || contaminatedC.length ? 'CONTAMINATION: a regression suite is needed'
    : 'NO CONTAMINATION: fan out freely';
  const falsified = verdict.startsWith('CONTAMINATION') ? true : verdict.startsWith('NO ') ? false : null;
  const because =
    falsified === null ? verdict
    : falsified ? `moved beyond A/A: under B ${JSON.stringify(contaminatedB)}, under C (independent) ${JSON.stringify(contaminatedC)}`
    : `none of the 5 other questions moved under B, none of the 4 independent others moved under C; placebo silent; control live (toolKind moved under C)`;

  // Pooled over the five others, for the headline.
  const pooled = (x: Cond, qs: readonly string[]) => {
    const aa: number[] = [], ax: number[] = [], fa: boolean[] = [], fx: boolean[] = [];
    for (const r of rows) {
      const A = r.calls.A, A1 = r.calls.A1, X = r.calls[x];
      if (!ok(A) || !ok(A1) || !ok(X)) continue;
      for (const q of qs) {
        if (!A.answers[q] || !A1.answers[q] || !X.answers[q]) continue;
        const n = delta(A.answers[q], A1.answers[q]), d = delta(A.answers[q], X.answers[q]);
        aa.push(n.dp); fa.push(n.flip); ax.push(d.dp); fx.push(d.flip);
      }
    }
    return { noise: summarise(aa, fa), condition: summarise(ax, fx) };
  };

  const latency = rows.flatMap(r => Object.values(r.calls).flatMap(c => (ok(c) ? [c.ms] : [])));
  const fmt = (x: number | null) => (x === null ? 'n/a' : x.toFixed(3));
  const pB = pooled('B', OTHERS), pC = pooled('C', OTHERS.filter(q => !COUPLED.has(q))), pP = pooled('A2', OTHERS);
  const headline =
    `Q3 ${startedAt.slice(0, 10)}: ${verdict} · others p95 |Δp| A/A ${fmt(pB.noise.p95Dp)} vs A/B ${fmt(pB.condition.p95Dp)} ` +
    `(flips ${pB.noise.flips} vs ${pB.condition.flips} of ${pB.noise.n}) · control toolKind under C moved=${controlLive}`;

  const output = {
    headline,
    experiment: 'Q3 / NETER window 3 — does a batch contaminate itself?',
    prereg: 'program/Q3-PREREG.md',
    startedAt,
    JEV_ID,
    answeredBy: answeredByCounts,
    n: { states: items.length, questionsPerCall: 1 + OTHERS.length, conditions: Object.keys(CONDS).length, callsPlanned: items.length * 5, callAttempts: callsMade, callsFailed: failed, callBudget: CALL_BUDGET },
    design: {
      target: TARGET,
      others: OTHERS,
      coupledExcludedFromC: [...COUPLED],
      conditions: Object.fromEntries(Object.entries(CONDS).map(([k, v]) => [k, { label: v.label, criteria: v.criteria }])),
      metric: 'boolean |Δp|; choice/score L∞ over the distribution; flip = side of 0.5 / pick / argmax level (as program/drift.ts)',
      rule: `MOVED under X: (p95(A,X) − p95(A,A′) > ${P95_MARGIN} AND paired-bootstrap 95% CI of mean excess > 0) OR (flips(A,X) − flips(A,A′) ≥ ${FLIP_EXCESS} AND CI of flip-rate excess > 0); ${BOOT} resamples, seed ${BOOT_SEED}`,
      thresholdsFitted: false,
    },
    noiseFloor: { perQuestion: Object.fromEntries(perCondition.B.map(t => [t.question, t.vsNoise])), othersPooled: pB.noise },
    result: {
      verdict,
      placebo: { fired: placeboFired, othersPooled: pP.condition },
      control: { toolKindMovedUnderC: controlLive, accuracy: { A: accuracy(rows, 'A'), A1: accuracy(rows, 'A1'), B: accuracy(rows, 'B'), C: accuracy(rows, 'C') } },
      othersPooledB: pB.condition,
      independentOthersPooledC: pC.condition,
      contaminatedUnderB: contaminatedB,
      contaminatedUnderC: contaminatedC,
      coupledMovedUnderC: coupledMovedC,
    },
    delta: {
      othersPooledB_p95MinusNoise: r4((pB.condition.p95Dp ?? NaN) - (pB.noise.p95Dp ?? NaN)),
      othersPooledB_flipsMinusNoise: pB.condition.flips - pB.noise.flips,
      independentOthersPooledC_p95MinusNoise: r4((pC.condition.p95Dp ?? NaN) - (pC.noise.p95Dp ?? NaN)),
      independentOthersPooledC_flipsMinusNoise: pC.condition.flips - pC.noise.flips,
    },
    falsified,
    because,
    perCondition,
    latencyMs: { n: latency.length, p50: r4(median(latency)), p95: r4(quantile(latency, 0.95)), max: latency.length ? Math.max(...latency) : null },
    wallClockMs,
    rows,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nwrote ${OUT_PATH}\n${headline}`);
  console.log(`JEV_ID ${JEV_ID} · answeredBy ${JSON.stringify(answeredByCounts)} · attempts ${callsMade} · failed ${failed}`);
  for (const x of ['A2', 'B', 'C'] as const) {
    console.log(`\n${x} (${CONDS[x].label})`);
    for (const t of perCondition[x])
      console.log(
        `  ${t.moved ? 'MOVED' : '     '} ${t.question.padEnd(20)} A/A p95 ${fmt(t.vsNoise.p95Dp)} max ${fmt(t.vsNoise.maxDp)} flips ${t.vsNoise.flips}` +
          ` · A/${x} p95 ${fmt(t.vsCondition.p95Dp)} max ${fmt(t.vsCondition.maxDp)} flips ${t.vsCondition.flips} · mean excess ${fmt(t.meanExcess)} CI [${fmt(t.meanExcessCI95[0])}, ${fmt(t.meanExcessCI95[1])}]`,
      );
  }
  for (const c of ['A', 'A1', 'B', 'C'] as const) console.log(`toolKind accuracy ${c}: ${JSON.stringify(output.result.control.accuracy[c])}`);
}

main();
