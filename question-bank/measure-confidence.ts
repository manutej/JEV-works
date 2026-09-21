/**
 * Validate a question set BEFORE you trust it — no labels required.
 *
 * This is NETER.md P21 turned into a tool. Run any question set over a corpus of
 * real states and rank the questions by how confidently they get answered. Two
 * distinct defects show up, and they need opposite fixes:
 *
 *   MOVE-TO-CODE — the answers never leave the mid band. The question requires
 *     reasoning the model cannot do from one state (supersession, "is this a
 *     duplicate", "would this matter later"). Compute it, or escalate it.
 *
 *   NO-INFORMATION — the answers are confident but always the same. The question
 *     is answered before it is asked, so it adds cost and no signal. Cut it, or
 *     rewrite it to discriminate.
 *
 * Both are invisible if you only look at whether the pipeline "works", and both
 * are cheap to find: one call per state, all questions batched.
 *
 *   node --env-file-if-exists=/path/.env.local measure-confidence.ts <BANK_KEY> <states.json>
 *
 * states.json: a JSON array of states (strings or objects) to evaluate against.
 */
import { experimental_evaluate as evaluate } from 'ai';
import { readFile } from 'node:fs/promises';
import { BANK, type BankKey } from './bank.ts';
import {
  defects, renderTable, summariseSet, THRESHOLDS,
  type Reading, type QuestionSummary,
} from './confidence.ts';
import { JEV, JEV_ID } from '../lib/jev.ts';

const MODEL = JEV_ID;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

const key = process.argv[2] as BankKey;
const statesPath = process.argv[3];

if (!key || !(key in BANK)) {
  console.error(`usage: measure-confidence.ts <BANK_KEY> <states.json>`);
  console.error(`available: ${Object.keys(BANK).join(', ')}`);
  process.exit(1);
}
if (!statesPath) {
  console.error('a states.json (JSON array of states) is required');
  process.exit(1);
}

const set = BANK[key];
const states: unknown[] = JSON.parse(await readFile(statesPath, 'utf8'));
const questions = set.questions as Record<string, never>;
const names = Object.keys(questions);

if (names.length === 0) {
  console.error(`${key} has no questions defined — fill in its criteria first.`);
  process.exit(1);
}

console.log(`${key} — ${set.context}`);
console.log(`status: ${set.status} · ${names.length} questions × ${states.length} states\n`);

async function pool<T, R>(xs: readonly T[], n: number, f: (x: T) => Promise<R>) {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      for (let i = next++; i < xs.length; i = next++) out[i] = await f(xs[i]);
    }),
  );
  return out;
}

const t0 = performance.now();
let failed = 0;

const readings = await pool(states, CONCURRENCY, async state => {
  try {
    const { answers } = await evaluate({
      model: JEV,
      state: state as never,
      questions,
      maxRetries: 2,
      providerOptions: { gateway: { zeroDataRetention: true } },
    });
    const row: Record<string, Reading> = {};
    for (const n of names) {
      const a = (answers as Record<string, Record<string, unknown>>)[n];
      if (a.type === 'boolean') row[n] = { p: a.probability as number };
      else if (a.type === 'score') row[n] = { level: a.score as number };
      else {
        const probs = (a.probabilities ?? {}) as Record<string, number>;
        const vs = Object.values(probs).filter(v => v > 0);
        const h = vs.length > 1
          ? -vs.reduce((acc, v) => acc + v * Math.log2(v), 0) / Math.log2(Object.keys(probs).length)
          : 0;
        row[n] = { key: a.choice as string, p: probs[a.choice as string], entropy: h };
      }
    }
    process.stdout.write('.');
    return row;
  } catch (error) {
    failed++;
    process.stdout.write('x');
    return null;
  }
});

const ok = readings.filter((r): r is Record<string, Reading> => r !== null);
console.log(`\n`);

const byQuestion: Record<string, { kind: 'boolean' | 'choice' | 'score'; levels?: number; optionCount?: number; readings: Reading[] }> = {};
for (const n of names) {
  const q = questions[n] as unknown as { type: 'boolean' | 'choice' | 'score'; criteria?: unknown };
  byQuestion[n] = {
    kind: q.type,
    levels: Array.isArray(q.criteria) ? q.criteria.length : undefined,
    optionCount: q.type === 'choice' && q.criteria && !Array.isArray(q.criteria)
      ? Object.keys(q.criteria as Record<string, unknown>).length : undefined,
    readings: ok.map(r => r[n] as Reading),
  };
}
const rows: QuestionSummary[] = summariseSet(byQuestion);

console.log(renderTable(rows));

console.log(`\n${ok.length}/${states.length} states evaluated in ${Math.round(performance.now() - t0)}ms${failed ? ` (${failed} failed)` : ''}`);

const { moveToCode: toCode, noInformation: useless } = defects(rows);

if (toCode.length) {
  console.log(`\nMOVE-TO-CODE (${toCode.length}) — these never left the mid band. Compute them or escalate them:`);
  for (const r of toCode) console.log(`  ${r.question}`);
}
if (useless.length) {
  console.log(`\nNO-INFORMATION (${useless.length}) — confident but always the same answer. Cut or rewrite to discriminate:`);
  for (const r of useless) console.log(`  ${r.question} (spread ${r.spread.toFixed(3)} < ${THRESHOLDS.noInformationSpread})`);
}
const marginal = rows.filter(r => r.verdict === 'MARGINAL');
if (!toCode.length && !useless.length && !marginal.length) {
  console.log('\nEvery question is JEV-SAFE. The set is safe to build a policy on.');
} else if (!toCode.length && !useless.length) {
  console.log(`\nNo hard defects, but ${marginal.length} question(s) MARGINAL — usable only with a wide review band.`);
}

console.log('\nReminder: this measures whether the questions are ANSWERABLE, not whether the answers are RIGHT.');
console.log('Accuracy still needs labels. See NETER.md P20.');
