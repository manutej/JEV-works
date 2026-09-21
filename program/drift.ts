/**
 * U6 — what does version drift cost? (NETER.md §5, open research window 5)
 *
 * Same states, same questions, three calls each over the direct API:
 *
 *   pinned A   jevDirect('jev-1.13.0')
 *   latest     jevDirect('jev-latest')
 *   pinned B   jevDirect('jev-1.13.0') again — the run-to-run noise floor (P4 says ~0.11)
 *
 * The three calls for one state run back to back in a per-state shuffled order, so time-of-day
 * load cannot masquerade as a version difference. Every call records answeredBy(), because
 * `jev-latest` resolves server-side and a result without the resolved version cannot be diffed.
 *
 * |Δp| per question, per state:
 *   boolean  |p_a − p_b|
 *   choice   max over options of |P_a(o) − P_b(o)|   (L∞ on the distribution)
 *   score    max over levels  of |P_a(l) − P_b(l)|
 * Discrete flips are counted separately: choice argmax, score argmax level, boolean side of 0.5.
 *
 * Verdict (hand-set, not fitted): a question MOVED when its pinned-vs-latest p95 |Δp| is ≥ 0.11
 * AND above its own pinned-vs-pinned p95, or when latest flips ≥ FLIP_EXCESS more discrete answers
 * than pinned-vs-pinned did. "no drift" = nothing moved. When jev-latest resolves to the pin, the
 * comparison is an A/A test and any "moved" question is a false positive of this rule.
 *
 * Weekly rerun: the newest earlier drift-*.json is read before writing, and today's latest
 * answers are diffed per state against its latest answers — that diff is the week-over-week drift.
 *
 *   source ~/.zshrc; /opt/homebrew/bin/node program/drift.ts
 */
import { experimental_evaluate as evaluate } from 'ai';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { BANK, type BankKey } from '../question-bank/bank.ts';
import { answeredBy } from '../lib/jev.ts';
import { jevDirect } from '../lib/jev-direct.ts';
import { RunLog } from '../lib/telemetry.ts';
import { pool, median, quantile } from './stats.ts';

const CONCURRENCY = Math.min(4, Number(process.env.CONCURRENCY ?? 4)); // shared rate limit: never above 4
const MAX_ATTEMPTS = 6;
const NOISE_FLOOR = 0.11; // P4
// Flips beyond the A/A count needed to call a question moved. Hand-set after the first run: with
// ~16 states per question, "1 flip vs 0" fired on an A/A comparison (jev-latest resolved to the pin).
const FLIP_EXCESS = 3;
const PINNED = 'jev-1.13.0';
const LATEST = 'jev-latest';
const RESULTS_DIR = new URL('./results/', import.meta.url).pathname;
const QB_DIR = new URL('../question-bank/', import.meta.url).pathname;

// Three sets so every answer type is covered: DOC_RELEVANCE (boolean + score), COURSE_QA
// (boolean + score), GRAPH_EDGES (the only choice set with a real corpus). 18 + 16 + 16 = 50 states.
const SETS: Array<{ key: BankKey; states: string }> = [
  { key: 'DOC_RELEVANCE', states: 'doc-relevance-states.json' },
  { key: 'COURSE_QA', states: 'course-qa-states.json' },
  { key: 'GRAPH_EDGES', states: 'graph-edges-states.json' },
];

type Arm = 'pinnedA' | 'latest' | 'pinnedB';
const ARMS: Record<Arm, string> = { pinnedA: PINNED, latest: LATEST, pinnedB: PINNED };

type Answer =
  | { type: 'boolean'; probability: number }
  | { type: 'choice'; choice: string; probabilities?: Record<string, number> }
  | { type: 'score'; score: number; probabilities?: Record<string, number> };

type Call = { requested: string; answeredBy: string; ms: number; answers: Record<string, Answer> } | { requested: string; error: string };
type Row = { id: string; set: BankKey; order: Arm[]; calls: Record<Arm, Call> };

const models: Record<string, ReturnType<typeof jevDirect>> = { [PINNED]: jevDirect(PINNED), [LATEST]: jevDirect(LATEST) };

const shuffle = <T>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function call(log: RunLog, id: string, arm: Arm, state: unknown, questions: Record<string, never>): Promise<Call> {
  const requested = ARMS[arm];
  for (let attempt = 1; ; attempt++) {
    const t = performance.now();
    try {
      const r = await evaluate({ model: models[requested], state: state as never, questions, maxRetries: 0 });
      const ms = Math.round(performance.now() - t);
      const c = { requested, answeredBy: answeredBy(r), ms, answers: r.answers as unknown as Record<string, Answer> };
      log.item(`${id}:${arm}`, { verdict: c.answeredBy, ms, inputTokens: r.usage?.inputTokens });
      return c;
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 300);
      const transient = /\b(429|500|502|503|504)\b|timed? ?out|ECONNRESET|fetch failed/i.test(msg);
      if (!transient || attempt >= MAX_ATTEMPTS) {
        log.fail(`${id}:${arm}`, msg);
        return { requested, error: msg };
      }
      log.retry(`${id}:${arm}`, msg);
      await sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
    }
  }
}

// ─────────────────────────────────────────────────────────────── comparison

type Delta = { dp: number; flip: boolean; scoreDelta?: number };

/** Top option of a distribution. A score's `score` is the expected level (e.g. 1.16), so its flip is read here. */
const argmax = (p: Record<string, number> = {}) => Object.entries(p).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

function linf(a: Record<string, number> = {}, b: Record<string, number> = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let m = 0;
  for (const k of keys) m = Math.max(m, Math.abs((a[k] ?? 0) - (b[k] ?? 0)));
  return m;
}

function delta(a: Answer, b: Answer): Delta {
  if (a.type === 'boolean' && b.type === 'boolean')
    return { dp: Math.abs(a.probability - b.probability), flip: a.probability >= 0.5 !== b.probability >= 0.5 };
  if (a.type === 'choice' && b.type === 'choice')
    return { dp: linf(a.probabilities, b.probabilities), flip: a.choice !== b.choice };
  if (a.type === 'score' && b.type === 'score')
    return { dp: linf(a.probabilities, b.probabilities), flip: argmax(a.probabilities) !== argmax(b.probabilities), scoreDelta: Math.abs(a.score - b.score) };
  return { dp: 1, flip: true }; // answer type changed between calls — the most drastic drift there is
}

const ok = (c: Call | undefined): c is Extract<Call, { answers: unknown }> => !!c && 'answers' in c;
const r4 = (x: number) => (Number.isFinite(x) ? +x.toFixed(4) : null);

type PairStats = { n: number; medianDp: number | null; p95Dp: number | null; maxDp: number | null; flips: number; flipRate: number | null; meanScoreDelta?: number | null };

function pairStats(ds: Delta[]): PairStats {
  const dp = ds.map(d => d.dp);
  const flips = ds.filter(d => d.flip).length;
  const sd = ds.flatMap(d => (d.scoreDelta === undefined ? [] : [d.scoreDelta]));
  return {
    n: ds.length,
    medianDp: r4(median(dp)),
    p95Dp: r4(quantile(dp, 0.95)),
    maxDp: r4(dp.length ? Math.max(...dp) : NaN),
    flips,
    flipRate: r4(flips / ds.length),
    ...(sd.length ? { meanScoreDelta: r4(sd.reduce((s, x) => s + x, 0) / sd.length) } : {}),
  };
}

/** Per-question deltas between two arms, across every state where both answered. */
function compare(rows: Row[], x: (r: Row) => Call | undefined, y: (r: Row) => Call | undefined) {
  const byQ = new Map<string, Delta[]>();
  for (const r of rows) {
    const a = x(r), b = y(r);
    if (!ok(a) || !ok(b)) continue;
    for (const q of Object.keys(a.answers)) {
      if (!b.answers[q]) continue;
      const k = `${r.set}.${q}`;
      if (!byQ.has(k)) byQ.set(k, []);
      byQ.get(k)!.push(delta(a.answers[q], b.answers[q]));
    }
  }
  return byQ;
}

async function previousRun(today: string) {
  const files = (await readdir(RESULTS_DIR)).filter(f => /^drift-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  // Prefer the newest EARLIER date; a same-day rerun falls back to the file it is about to replace.
  const earlier = files.filter(f => f < `drift-${today}.json`);
  const pick = earlier.at(-1) ?? files.find(f => f === `drift-${today}.json`);
  if (!pick) return null;
  return { file: pick, data: JSON.parse(await readFile(RESULTS_DIR + pick, 'utf8')) };
}

// ─────────────────────────────────────────────────────────────────── main

async function main() {
  if (!process.env.TYPESAFE_API_KEY) {
    console.error('TYPESAFE_API_KEY is not set — `source ~/.zshrc` first. Drift is measured on the direct API only.');
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const outPath = `${RESULTS_DIR}drift-${today}.json`;
  const prev = await previousRun(today);

  const items: Array<{ id: string; set: BankKey; state: unknown }> = [];
  for (const s of SETS) {
    const states: unknown[] = JSON.parse(await readFile(QB_DIR + s.states, 'utf8'));
    states.forEach((state, i) => items.push({ id: `${s.key}#${i}`, set: s.key, state }));
  }

  const log = new RunLog('drift');
  const questionShape = Object.fromEntries(
    SETS.flatMap(s => Object.entries(BANK[s.key].questions).map(([n, q]) => [`${s.key}.${n}`, q.type]))
  );
  log.announce({
    model: `${PINNED} ×2 vs ${LATEST} (direct)`,
    items: items.length * 3,
    questions: questionShape,
    stateShape: `${SETS.map(s => s.key).join(' + ')} corpora, ${items.length} states × 3 arms, arm order shuffled per state`,
    recombination: `drift = pinned-vs-latest p95 |Δp| ≥ ${NOISE_FLOOR} AND > pinned-vs-pinned p95, or ≥${FLIP_EXCESS} more flips than pinned-vs-pinned`,
    thresholdsFitted: false,
    maxRetries: MAX_ATTEMPTS - 1,
  });

  const t0 = performance.now();
  const rows: Row[] = await pool(items, CONCURRENCY, async it => {
    const questions = BANK[it.set].questions as Record<string, never>;
    const order = shuffle<Arm>(['pinnedA', 'latest', 'pinnedB']);
    const calls = {} as Record<Arm, Call>;
    for (const arm of order) calls[arm] = await call(log, it.id, arm, it.state, questions);
    return { id: it.id, set: it.set, order, calls };
  });
  const run = log.done();

  // ── versions
  const resolved: Record<string, Record<string, number>> = {};
  for (const r of rows)
    for (const c of Object.values(r.calls)) {
      if (!ok(c)) continue;
      resolved[c.requested] ??= {};
      resolved[c.requested][c.answeredBy] = (resolved[c.requested][c.answeredBy] ?? 0) + 1;
    }
  const latestResolvedTo = Object.keys(resolved[LATEST] ?? {});
  const pinnedResolvedTo = Object.keys(resolved[PINNED] ?? {});
  const latestIsPinned = latestResolvedTo.length === 1 && pinnedResolvedTo.length === 1 && latestResolvedTo[0] === pinnedResolvedTo[0];

  // ── deltas. Noise: pinnedA vs pinnedB. Drift: pinnedA vs latest (same reference call on both sides).
  const noise = compare(rows, r => r.calls.pinnedA, r => r.calls.pinnedB);
  const drift = compare(rows, r => r.calls.pinnedA, r => r.calls.latest);

  const perQuestion = [...noise.keys()].map(q => {
    const pp = pairStats(noise.get(q) ?? []);
    const pl = pairStats(drift.get(q) ?? []);
    const byMagnitude = pl.p95Dp !== null && pp.p95Dp !== null && pl.p95Dp >= NOISE_FLOOR && pl.p95Dp > pp.p95Dp;
    const byFlips = pl.flips - pp.flips >= FLIP_EXCESS;
    return { question: q, pinnedVsPinned: pp, pinnedVsLatest: pl, moved: byMagnitude || byFlips, movedBecause: { p95AboveFloorAndNoise: byMagnitude, moreFlipsThanNoise: byFlips } };
  });

  const all = (m: Map<string, Delta[]>) => pairStats([...m.values()].flat());
  const overall = { pinnedVsPinned: all(noise), pinnedVsLatest: all(drift) };
  const choiceOnly = (m: Map<string, Delta[]>) =>
    pairStats([...m.entries()].filter(([q]) => q.startsWith('GRAPH_EDGES.')).flatMap(([, d]) => d));
  const choiceFlipRate = { pinnedVsPinned: choiceOnly(noise).flipRate, pinnedVsLatest: choiceOnly(drift).flipRate };

  const moved = perQuestion.filter(q => q.moved);
  const verdict = moved.length === 0 ? 'no drift' : 'drift detected';

  // ── latency per arm
  const latency = Object.fromEntries(
    (Object.keys(ARMS) as Arm[]).map(arm => {
      const ms = rows.flatMap(r => (ok(r.calls[arm]) ? [(r.calls[arm] as { ms: number }).ms] : []));
      return [arm, { n: ms.length, p50: r4(median(ms)), p95: r4(quantile(ms, 0.95)) }];
    })
  );

  // ── week-over-week: today's latest vs the previous run's latest, per state
  let sincePrevious: unknown = { note: 'no previous drift-*.json — this run is the baseline' };
  if (prev) {
    const prevRows: Row[] = prev.data.rows ?? [];
    const prevById = new Map(prevRows.map(r => [r.id, r]));
    const matched = rows.filter(r => prevById.has(r.id));
    const wow = compare(matched, r => prevById.get(r.id)!.calls.latest, r => r.calls.latest);
    const wowPinned = compare(matched, r => prevById.get(r.id)!.calls.pinnedA, r => r.calls.pinnedA);
    sincePrevious = {
      file: prev.file,
      previousDate: prev.data.date,
      previousLatestResolvedTo: prev.data.versions?.latestResolvedTo ?? null,
      latestResolvedToChanged: JSON.stringify(prev.data.versions?.latestResolvedTo ?? null) !== JSON.stringify(latestResolvedTo),
      previousVerdict: prev.data.verdict,
      statesMatched: matched.length,
      latestThenVsNow: all(wow),
      pinnedThenVsNow: all(wowPinned),
      perQuestionLatestThenVsNow: Object.fromEntries([...wow.entries()].map(([q, d]) => [q, pairStats(d)])),
    };
  }

  const fmt = (x: number | null) => (x === null ? 'n/a' : x.toFixed(3));
  const headline =
    `U6 drift ${today}: ${verdict} — ${LATEST}→${latestResolvedTo.join('/') || '?'}; ` +
    `p95 |Δp| latest ${fmt(overall.pinnedVsLatest.p95Dp)} vs noise ${fmt(overall.pinnedVsPinned.p95Dp)}`;

  const output = {
    headline,
    experiment: 'U6 / NETER window 5',
    date: today,
    verdict,
    verdictNote: latestIsPinned
      ? `${LATEST} resolved to ${pinnedResolvedTo[0]} on every call — an A/A comparison, so drift is impossible by construction today; any moved question is a false positive of the rule`
      : null,
    movedQuestions: moved.map(q => ({ question: q.question, p95Latest: q.pinnedVsLatest.p95Dp, p95Noise: q.pinnedVsPinned.p95Dp, flipsLatest: q.pinnedVsLatest.flips, flipsNoise: q.pinnedVsPinned.flips })),
    rule: {
      noiseFloorP4: NOISE_FLOOR,
      moved: `pinnedVsLatest.p95Dp >= ${NOISE_FLOOR} AND > pinnedVsPinned.p95Dp, OR pinnedVsLatest.flips - pinnedVsPinned.flips >= ${FLIP_EXCESS}`,
      thresholdsFitted: false,
      dp: 'boolean |Δprobability|; choice/score L∞ over the returned distribution',
      flip: 'boolean: side of 0.5; choice: chosen option; score: argmax level (not the expected-value scalar)',
    },
    versions: { requested: [PINNED, LATEST], resolvedCounts: resolved, latestResolvedTo, pinnedResolvedTo, latestIsPinned },
    n: { states: items.length, sets: SETS.map(s => s.key), callsAnnounced: items.length * 3, callsCompleted: run.completed, callsFailed: run.failed, retried: run.retried.length },
    overall,
    choiceFlipRate,
    perQuestion,
    latency,
    sincePrevious,
    wallClockMs: Math.round(performance.now() - t0),
    rows,
  };

  await writeFile(outPath, JSON.stringify(output, null, 2));
  console.log(`\nwrote ${outPath}`);
  console.log(headline);
  console.log(`versions: ${JSON.stringify(resolved)}`);
  console.log(`overall |Δp|  noise  med ${fmt(overall.pinnedVsPinned.medianDp)} p95 ${fmt(overall.pinnedVsPinned.p95Dp)} max ${fmt(overall.pinnedVsPinned.maxDp)} flips ${overall.pinnedVsPinned.flips}/${overall.pinnedVsPinned.n}`);
  console.log(`overall |Δp|  latest med ${fmt(overall.pinnedVsLatest.medianDp)} p95 ${fmt(overall.pinnedVsLatest.p95Dp)} max ${fmt(overall.pinnedVsLatest.maxDp)} flips ${overall.pinnedVsLatest.flips}/${overall.pinnedVsLatest.n}`);
  console.log(`choice flip rate: noise ${fmt(choiceFlipRate.pinnedVsPinned)} · latest ${fmt(choiceFlipRate.pinnedVsLatest)}`);
  for (const q of perQuestion)
    console.log(`  ${q.moved ? 'MOVED' : '     '} ${q.question.padEnd(38)} noise p95 ${fmt(q.pinnedVsPinned.p95Dp)} flips ${q.pinnedVsPinned.flips} · latest p95 ${fmt(q.pinnedVsLatest.p95Dp)} flips ${q.pinnedVsLatest.flips}`);
  if (prev) console.log(`diffed against ${prev.file}`);
}

main();
