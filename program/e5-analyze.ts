/**
 * E5 — scoring. Zero model calls: reads program/results/e5-readings.json, rebuilds the (deterministic)
 * splits and baselines, and writes program/results/e5-masked.json per PROGRAM.md's reporting contract
 * (n, baseline, result, delta, falsified + because). The verdict rules are the prereg's, verbatim.
 *
 *   /opt/homebrew/bin/node program/e5-analyze.ts     # re-score from saved readings, then rebuild the page
 */
import { readFile, writeFile } from 'node:fs/promises';
import { buildTargets, majorityOf, trainNB, SEED, type Built, type Target, type TargetName } from './e5-data.ts';
import { QUESTIONS } from './e5-questions.ts';
import type { Readings, Reading } from './e5-run.ts';

const OUT_PATH = new URL('./results/e5-masked.json', import.meta.url).pathname;
const ALPHA = 0.05;
const BOOT = 2000;
const r4 = (x: number) => +x.toFixed(4);
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const acc = (xs: readonly number[]) => (xs.length ? r4(sum(xs) / xs.length) : NaN);

// mulberry32, paired bootstrap and exact McNemar: copied from q4-baselines.ts (a script, not a module).
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const logFact = (k: number) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  const logChoose = (k: number) => logFact(n) - logFact(k) - logFact(n - k);
  let tail = 0;
  for (let k = 0; k <= Math.min(b, c); k++) tail += Math.exp(logChoose(k) - n * Math.LN2);
  return Math.min(1, 2 * tail);
}

/** x/y are 0/1 correctness on the same items; b = x right & y wrong, c = y right & x wrong. */
function paired(x: readonly number[], y: readonly number[], names: [string, string]) {
  let b = 0, c = 0;
  for (let i = 0; i < x.length; i++) { if (x[i] && !y[i]) b++; if (!x[i] && y[i]) c++; }
  const p = mcnemarExact(b, c);
  return { b, c, p: +p.toPrecision(3), significant: p < ALPHA, winner: p >= ALPHA ? 'no significant difference' : b > c ? names[0] : names[1] };
}

export type ItemRow = {
  id: string;
  label: string;
  state: Record<string, string | number>;
  jev: string | null;
  jevChoice: string | null;
  probabilities: Record<string, number> | null;
  nb: string;
  jevRight: boolean;
  nbRight: boolean;
  error?: string;
};

const PREDICTION: Record<TargetName, string> = {
  hotpot: 'Jev ≥ NB (falsified iff McNemar p < 0.05 with c > b)',
  housing: 'NB ≥ Jev, and neither system beats majority significantly (falsified iff Jev beats NB at p < 0.05, or either system beats majority at p < 0.05)',
  faf: 'Both ≥ 0.95 accuracy, no significant Jev–NB difference (falsified iff either < 0.95 or McNemar p < 0.05)',
};

function scoreTarget(t: Target, readings: Reading[] | undefined, halted: string | undefined) {
  if (halted || !readings?.length) return { target: t.name, field: t.field, halted: halted ?? 'no readings' };
  const byId = new Map(readings.map(r => [r.id, r]));
  const nb = trainNB(t.fit);
  const majority = majorityOf(t.fit.map(i => i.label));
  const rows: ItemRow[] = t.test.map(i => {
    const r = byId.get(i.id);
    const nbGuess = nb(i.tokens);
    return {
      id: i.id,
      label: i.label,
      state: i.state,
      jev: r?.predicted ?? null,
      jevChoice: r?.choice ?? null,
      probabilities: r?.probabilities ?? null,
      nb: nbGuess,
      jevRight: r?.predicted === i.label,
      nbRight: nbGuess === i.label,
      ...(r?.error ? { error: r.error } : {}),
    };
  });
  const jev = rows.map(r => +r.jevRight);
  const nbv = rows.map(r => +r.nbRight);
  const maj = rows.map(r => +(r.label === majority));
  const answered = rows.filter(r => r.jev !== null);
  const vsNB = paired(jev, nbv, ['Jev', 'NB']);
  const vsMaj = paired(jev, maj, ['Jev', 'majority']);
  const nbVsMaj = paired(nbv, maj, ['NB', 'majority']);
  const aJ = acc(jev), aN = acc(nbv), aM = acc(maj);

  let falsified: boolean, because: string;
  if (t.name === 'hotpot') {
    falsified = vsNB.significant && vsNB.c > vsNB.b;
    because = falsified
      ? `NB significantly better: b=${vsNB.b}, c=${vsNB.c}, p=${vsNB.p}`
      : `NB not significantly better (b=${vsNB.b}, c=${vsNB.c}, p=${vsNB.p}); ${vsNB.winner}`;
  } else if (t.name === 'housing') {
    const jevBeatsNB = vsNB.significant && vsNB.b > vsNB.c;
    const jevBeatsMaj = vsMaj.significant && vsMaj.b > vsMaj.c;
    const nbBeatsMaj = nbVsMaj.significant && nbVsMaj.b > nbVsMaj.c;
    falsified = jevBeatsNB || jevBeatsMaj || nbBeatsMaj;
    const parts = [
      `Jev vs NB: b=${vsNB.b}, c=${vsNB.c}, p=${vsNB.p}${jevBeatsNB ? ' — Jev significantly better (primary falsified)' : ''}`,
      `Jev vs majority: b=${vsMaj.b}, c=${vsMaj.c}, p=${vsMaj.p}${jevBeatsMaj ? ' — Jev beats majority (secondary falsified)' : ''}`,
      `NB vs majority: b=${nbVsMaj.b}, c=${nbVsMaj.c}, p=${nbVsMaj.p}${nbBeatsMaj ? ' — NB beats majority (secondary falsified)' : ''}`,
    ];
    because = parts.join('; ');
  } else {
    const low = [aJ < 0.95 ? `Jev ${aJ} < 0.95` : '', aN < 0.95 ? `NB ${aN} < 0.95` : ''].filter(Boolean);
    falsified = low.length > 0 || vsNB.significant;
    because = [...low, `McNemar b=${vsNB.b}, c=${vsNB.c}, p=${vsNB.p}${vsNB.significant ? ' (significant)' : ''}`].join('; ');
  }

  const recall = (pred: (r: ItemRow) => string | null) =>
    Object.fromEntries(t.classes.map(c => {
      const of = rows.filter(r => r.label === c);
      return [c, { n: of.length, recall: acc(of.map(r => +(pred(r) === c))) }];
    }));
  const answeredByVersions = [...new Set(readings.map(r => r.answeredBy).filter(Boolean))];

  return {
    target: t.name,
    field: t.field,
    n: { fit: t.fit.length, test: rows.length, testOverCapUnscored: t.testDropped },
    hypothesis: PREDICTION[t.name],
    baseline: {
      naiveBayes: { accuracy: aN, coverage: 1, perClass: recall(r => r.nb) },
      majority: { guess: majority, accuracy: aM },
    },
    result: {
      jev: {
        accuracy: aJ,
        coverage: acc(rows.map(r => +(r.jev !== null))),
        accuracyOnAnswered: acc(answered.map(r => +r.jevRight)),
        nonAnswers: rows.length - answered.length,
        perClass: recall(r => r.jev),
        answeredBy: answeredByVersions,
      },
    },
    delta: {
      jevMinusNB: r4(aJ - aN),
      jevMinusNB_CI95: pairedDeltaCI(jev, nbv),
      jevMinusMajority: r4(aJ - aM),
      jevMinusMajority_CI95: pairedDeltaCI(jev, maj),
    },
    mcnemar: { jevVsNB: vsNB, jevVsMajority: vsMaj, nbVsMajority: nbVsMaj },
    agreement: { jevNbAgree: acc(rows.map(r => +(r.jev === r.nb))) },
    falsified,
    because,
    disjointness: t.disjointness,
    privacyScan: { scanned: t.privacy.scanned, hits: t.privacy.hits.length },
    question: QUESTIONS[t.name],
    ...(t.sampling ? { sampling: t.sampling } : {}),
    items: rows,
  };
}

export type TargetResult = ReturnType<typeof scoreTarget>;

export async function analyze(built: Built, readings: Readings) {
  const targets = (['hotpot', 'housing', 'faf'] as const).map(n => scoreTarget(built[n], readings.readings[n], readings.halted[n]));
  const versions = [...new Set(Object.values(readings.readings).flat().map(r => r.answeredBy).filter(Boolean))];
  const result = {
    experiment: 'E5 — masked targets, Jev vs naive Bayes',
    prereg: 'program/E5-PREREG.md',
    JEV_ID: readings.JEV_ID,
    answeredBy: versions,
    seed: SEED,
    startedAt: readings.startedAt,
    finishedAt: readings.finishedAt,
    callsUsed: readings.callsUsed,
    testOfRecord: 'exact two-sided McNemar on per-item correctness (p < 0.05), paired bootstrap 95% CI (2000, seed 4); non-answer = wrong; 0.11 band not used',
    disjointness: Object.fromEntries(targets.map(t => [t.target, built[t.target].disjointness])),
    privacyScan: Object.fromEntries(targets.map(t => [t.target, { scanned: built[t.target].privacy.scanned, hits: built[t.target].privacy.hits.length }])),
    halted: readings.halted,
    targets,
  };
  await writeFile(OUT_PATH, JSON.stringify(result, null, 1));
  for (const t of targets) {
    if ('halted' in t) { console.log(`${t.target}: HALTED — ${t.halted}`); continue; }
    const m = t.mcnemar.jevVsNB;
    console.log(
      `${t.target}.${t.field}  n=${t.n.test}  Jev ${t.result.jev.accuracy} (cov ${t.result.jev.coverage})  NB ${t.baseline.naiveBayes.accuracy}  ` +
        `maj ${t.baseline.majority.accuracy}  Δ ${t.delta.jevMinusNB} CI ${JSON.stringify(t.delta.jevMinusNB_CI95)}  b=${m.b} c=${m.c} p=${m.p}  ` +
        `falsified=${t.falsified}`,
    );
  }
  console.log(`results → ${OUT_PATH}`);
  return result;
}

export type E5Result = Awaited<ReturnType<typeof analyze>>;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { READINGS_PATH } = await import('./e5-run.ts');
  const readings: Readings = JSON.parse(await readFile(READINGS_PATH, 'utf8'));
  const built = await buildTargets();
  const result = await analyze(built, readings);
  const { writeReview } = await import('./e5-review.ts');
  await writeReview(built, readings, result);
}
