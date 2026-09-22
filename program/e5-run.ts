/**
 * E5 — the run. Answers the TEST half of each masked target with Jev, once, and writes the raw
 * readings to program/results/e5-readings.json before any analysis touches them. Then scores
 * (e5-analyze.ts) and builds the review page (e5-review.ts).
 *
 * Pre-registered in program/E5-PREREG.md (committed before this file ran). One run per target: this
 * script refuses to start if the readings file already exists. Analysis can be re-derived from the
 * readings with `node program/e5-analyze.ts`, at zero calls.
 *
 *   cd /Users/manu/JEV-works && source ~/.zshrc >/dev/null 2>&1; /opt/homebrew/bin/node program/e5-run.ts
 */
import { experimental_evaluate as evaluate } from 'ai';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { JEV, JEV_ID, answeredBy } from '../lib/jev.ts';
import { RunLog } from '../lib/telemetry.ts';
import { pool } from './stats.ts';
import { buildTargets, scanState, type Item, type Target, type TargetName } from './e5-data.ts';
import { QUESTIONS } from './e5-questions.ts';
import { analyze } from './e5-analyze.ts';
import { writeReview } from './e5-review.ts';

export const READINGS_PATH = new URL('./results/e5-readings.json', import.meta.url).pathname;
const CONCURRENCY = 4;
const MAX_ATTEMPTS = 5;
const CALL_BUDGET = 950;

export type Reading = {
  id: string;
  /** Jev's option key, as returned. */
  choice: string | null;
  /** The dataset label that key maps to; null for a non-answer or an out-of-set key. */
  predicted: string | null;
  probabilities: Record<string, number> | null;
  answeredBy: string | null;
  ms: number | null;
  attempts: number;
  inputTokens: number | null;
  error?: string;
};

export type Readings = {
  experiment: 'E5';
  JEV_ID: string;
  startedAt: string;
  finishedAt: string;
  callsUsed: number;
  halted: Partial<Record<TargetName, string>>;
  readings: Record<TargetName, Reading[]>;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  if (existsSync(READINGS_PATH)) {
    console.error(`${READINGS_PATH} exists — E5 is one run per target. Re-score with: node program/e5-analyze.ts`);
    process.exit(1);
  }
  if (!process.env.TYPESAFE_API_KEY) console.warn('TYPESAFE_API_KEY not set; lib/jev.ts will fall back to the gateway.');

  const built = await buildTargets();
  const targets: Target[] = [built.hotpot, built.housing, built.faf];
  const halted: Readings['halted'] = {};
  for (const t of targets) {
    // Re-scan exactly what will be sent; the prereg scan is not trusted to still hold.
    const hits = t.test.flatMap(i => scanState(i.state)).length + t.privacy.hits.length;
    if (hits) halted[t.name] = `privacy scan: ${hits} hit(s); target not sent`;
    else if (t.disjointness.keyOverlap) halted[t.name] = `fit/test key overlap ${t.disjointness.keyOverlap}; target not sent`;
  }

  const live = targets.filter(t => !halted[t.name]);
  const log = new RunLog('e5-masked');
  log.announce({
    model: JEV_ID,
    items: live.reduce((s, t) => s + t.test.length, 0),
    questions: Object.fromEntries(live.map(t => [t.name, `choice(${Object.keys(QUESTIONS[t.name].criteria).length})`])),
    stateShape: 'hotpot {question} ~25 tok · housing 12 fields ~80 tok · faf 10 decoded fields ~110 tok',
    recombination: 'argmax choice → dataset label; non-answer = wrong',
    thresholdsFitted: false,
    maxRetries: MAX_ATTEMPTS - 1,
  });

  let callsUsed = 0;
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function read(t: Target, item: Item): Promise<Reading> {
    const q = QUESTIONS[t.name];
    const blank = { choice: null, predicted: null, probabilities: null, answeredBy: null, ms: null, inputTokens: null };
    for (let attempt = 1; ; attempt++) {
      if (callsUsed >= CALL_BUDGET) return { id: item.id, ...blank, attempts: attempt - 1, error: 'call budget exhausted' };
      callsUsed++;
      const t0 = performance.now();
      try {
        const r = await evaluate({
          model: JEV,
          state: item.state,
          questions: { label: { type: 'choice', instructions: q.instructions, criteria: q.criteria } } as never,
          maxRetries: 0,
        });
        const a = (r.answers as unknown as { label: { choice: string; probabilities?: Record<string, number> } }).label;
        const probs = a.probabilities
          ? Object.fromEntries(Object.entries(a.probabilities).map(([k, v]) => [k, +v.toFixed(4)]))
          : null;
        return {
          id: item.id,
          choice: a.choice ?? null,
          predicted: q.toLabel[a.choice] ?? null,
          probabilities: probs,
          answeredBy: answeredBy(r),
          ms: Math.round(performance.now() - t0),
          attempts: attempt,
          inputTokens: (r as any).usage?.inputTokens ?? null,
        };
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 300);
        const transient = /\b(429|500|502|503|504)\b|timed? ?out|ECONNRESET|fetch failed|rate/i.test(msg);
        if (!transient || attempt >= MAX_ATTEMPTS) return { id: item.id, ...blank, attempts: attempt, error: msg };
        log.retry(item.id, msg.slice(0, 80));
        await sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
      }
    }
  }

  const startedAt = new Date().toISOString();
  const readings = { hotpot: [], housing: [], faf: [] } as Record<TargetName, Reading[]>;
  for (const t of live) {
    readings[t.name] = await pool(t.test, CONCURRENCY, async item => {
      const r = await read(t, item);
      if (r.error) log.fail(item.id, r.error);
      else log.item(item.id, { verdict: r.predicted === item.label ? 'right' : 'wrong', ms: r.ms ?? undefined, inputTokens: r.inputTokens ?? undefined });
      return r;
    });
    // Persist after each target, so a crash later never forces a second run of an earlier one.
    const partial: Readings = { experiment: 'E5', JEV_ID, startedAt, finishedAt: '', callsUsed, halted, readings };
    await writeFile(READINGS_PATH, JSON.stringify(partial, null, 1));
  }
  log.done();

  const out: Readings = { experiment: 'E5', JEV_ID, startedAt, finishedAt: new Date().toISOString(), callsUsed, halted, readings };
  await writeFile(READINGS_PATH, JSON.stringify(out, null, 1));
  console.log(`readings → ${READINGS_PATH} (${callsUsed} calls)`);

  const result = await analyze(built, out);
  await writeReview(built, out, result);
}
