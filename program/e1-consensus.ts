/**
 * E1 — does unanimity mean correctness? (PROGRAM.md)
 *
 * Five independent, MODEL-DIVERSE labellers (one call each, no shared context,
 * no cross-visibility) each classify all 80 `ceti-silver-hooks.json` items into
 * one of 9 formula classes. Diverse families are used deliberately — five
 * calls to one model measure that model's determinism, not truth, because
 * identical models share correlated errors.
 *
 * `formula` (the true label) is read once, up front, to compute the majority
 * class and to score after the fact. It is never placed in a prompt or state.
 *
 * Hypothesis (fixed by PROGRAM.md, not editable here):
 *   Unanimous (5/5) items are >=95% accurate.
 * Falsified if:
 *   (a) unanimous accuracy < 95%, OR
 *   (b) the 4/5 bucket is "no worse than" 5/5 — using P4's rule that a
 *       difference under 0.11 is not a difference, i.e. acc(5/5) - acc(4/5) < 0.11.
 *
 *   node --env-file-if-exists=/Users/manu/jev-playground/.env.local program/e1-consensus.ts
 */
import { generateObject } from 'ai';
import { z } from 'zod';
import { readFile, writeFile } from 'node:fs/promises';
import { CORPUS_PATH, FORMULA_DESCRIPTIONS, FORMULA_KEYS, type Hook } from './formulas.ts';
import { keywordClassify, MAJORITY_CLASS } from './keyword-baseline.ts';
import { pool, plurality, costFromUsage, type UsageRow } from './stats.ts';

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 12);
const OUT_PATH = new URL('./results/e1-consensus.json', import.meta.url).pathname;

// Five different model FAMILIES, per instruction — clones would measure
// determinism, not truth.
const LABELLERS = [
  'openai/gpt-5.6-luna',
  'deepseek/deepseek-v4-pro',
  'alibaba/qwen3.7-plus',
  'meta/llama-4-maverick',
  'anthropic/claude-haiku-4.5',
];

const schema = z.object({
  formula: z.enum(FORMULA_KEYS).describe('The single best-fitting mechanism class for this hook.'),
});

const optionList = Object.entries(FORMULA_DESCRIPTIONS)
  .map(([k, d]) => `- ${k}: ${d}`)
  .join('\n');

const SYSTEM = `You are classifying a short marketing "hook" (an opening line meant to earn attention) into exactly one of 9 mechanism classes. Read the hook, decide which single mechanism it relies on MOST, and answer with that class's key only.

Classes:
${optionList}`;

function buildPrompt(text: string): string {
  return `Hook:\n"""\n${text}\n"""\n\nWhich class does this hook rely on?`;
}

type Vote = { model: string; label: string | null; error?: string };

async function labelOne(model: string, text: string): Promise<{ label: string | null; error?: string; usage?: UsageRow }> {
  try {
    const { object, usage } = await generateObject({
      model,
      schema,
      system: SYSTEM,
      prompt: buildPrompt(text),
      maxRetries: 2,
    });
    return {
      label: object.formula,
      usage: { model, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
    };
  } catch (e: any) {
    return { label: null, error: e?.message?.slice(0, 300) ?? String(e) };
  }
}

function bucketFor(count: number): '5/5' | '4/5' | '3/5' | '≤2/5' {
  if (count === 5) return '5/5';
  if (count === 4) return '4/5';
  if (count === 3) return '3/5';
  return '≤2/5';
}

async function main() {
  const t0 = performance.now();
  const fullCorpus: Hook[] = JSON.parse(await readFile(CORPUS_PATH, 'utf8'));
  // Dev-only smoke-test knob; unset in the real run, so the reported n is always 80.
  const limit = process.env.E1_LIMIT ? Number(process.env.E1_LIMIT) : fullCorpus.length;
  const corpus = fullCorpus.slice(0, limit);
  console.error(`E1: ${corpus.length} hooks x ${LABELLERS.length} labellers = ${corpus.length * LABELLERS.length} calls`);

  const calls: Array<{ hookIdx: number; model: string }> = [];
  for (let i = 0; i < corpus.length; i++) {
    for (const model of LABELLERS) calls.push({ hookIdx: i, model });
  }

  let done = 0;
  const usageRows: UsageRow[] = [];
  const votesByHook: Vote[][] = corpus.map(() => []);
  const errorsByModel: Record<string, number> = Object.fromEntries(LABELLERS.map(m => [m, 0]));

  await pool(calls, CONCURRENCY, async ({ hookIdx, model }) => {
    const hook = corpus[hookIdx];
    const { label, error, usage } = await labelOne(model, hook.text);
    votesByHook[hookIdx].push({ model, label, error });
    if (usage) usageRows.push(usage);
    if (error) errorsByModel[model]++;
    done++;
    if (done % 40 === 0) console.error(`  ${done}/${calls.length}`);
  });

  const wallClockMs = performance.now() - t0;

  // Fail loudly rather than silently substituting if a whole family is dead.
  for (const model of LABELLERS) {
    const rate = errorsByModel[model] / corpus.length;
    if (rate > 0.5) {
      console.error(`WARNING: ${model} failed on ${(rate * 100).toFixed(0)}% of hooks — this family is effectively down, not substituted.`);
    }
  }

  type HookResult = {
    id: string;
    formula: string;
    votes: Record<string, string | null>;
    plurality: string | null;
    pluralityCount: number;
    bucket: string;
    consensusCorrect: boolean | null;
  };

  const hookResults: HookResult[] = corpus.map((hook, i) => {
    const votes = votesByHook[i];
    const labels = votes.map(v => v.label).filter((l): l is string => l !== null);
    if (labels.length === 0) {
      return {
        id: hook.id,
        formula: hook.formula,
        votes: Object.fromEntries(votes.map(v => [v.model, v.label])),
        plurality: null,
        pluralityCount: 0,
        bucket: '≤2/5',
        consensusCorrect: null,
      };
    }
    const { winner, count } = plurality(labels);
    return {
      id: hook.id,
      formula: hook.formula,
      votes: Object.fromEntries(votes.map(v => [v.model, v.label])),
      plurality: winner,
      pluralityCount: count,
      bucket: bucketFor(count),
      consensusCorrect: winner === hook.formula,
    };
  });

  const BUCKETS = ['5/5', '4/5', '3/5', '≤2/5'] as const;
  const perBucket = Object.fromEntries(
    BUCKETS.map(b => {
      const items = hookResults.filter(h => h.bucket === b);
      const n = items.length;
      const correct = items.filter(h => h.consensusCorrect).length;
      const accuracy = n ? correct / n : NaN;
      return [
        b,
        {
          n,
          correct,
          accuracy: Number.isFinite(accuracy) ? +accuracy.toFixed(4) : null,
          insufficientData: n < 8,
        },
      ];
    }),
  );

  const unanimityRate = +(perBucket['5/5'].n / corpus.length).toFixed(4);

  // Baselines, on all 80, computed once and never retuned.
  const majorityClassAcc = +(corpus.filter(h => h.formula === MAJORITY_CLASS).length / corpus.length).toFixed(4);
  const keywordAcc = +(corpus.filter(h => keywordClassify(h.text) === h.formula).length / corpus.length).toFixed(4);

  // Per-model individual accuracy (diagnostic, not part of the falsification test).
  const perModelAccuracy = Object.fromEntries(
    LABELLERS.map(model => {
      const preds = hookResults.map((h, i) => votesByHook[i].find(v => v.model === model)?.label);
      const scored = preds.map((p, i) => (p ? p === corpus[i].formula : null)).filter((x): x is boolean => x !== null);
      return [model, scored.length ? +(scored.filter(Boolean).length / scored.length).toFixed(4) : null];
    }),
  );

  const overallConsensusAcc = +(hookResults.filter(h => h.consensusCorrect).length / corpus.length).toFixed(4);

  // --- falsification, per PROGRAM.md, not editable -------------------------
  const unanimousAcc = perBucket['5/5'].accuracy;
  const fourFifthsAcc = perBucket['4/5'].accuracy;
  const NOISE_FLOOR = 0.11; // PROGRAM.md ground rule 6 (P4)

  const falsifiedLowUnanimity = unanimousAcc !== null && unanimousAcc < 0.95;
  const gapFiveFour = unanimousAcc !== null && fourFifthsAcc !== null ? unanimousAcc - fourFifthsAcc : null;
  const falsifiedNoInfoInUnanimity = gapFiveFour !== null && gapFiveFour < NOISE_FLOOR;
  const falsified = falsifiedLowUnanimity || falsifiedNoInfoInUnanimity;

  const { totalUsd, byModel: costByModel } = await costFromUsage(usageRows).catch(e => {
    console.error('cost lookup failed:', e?.message ?? e);
    return { totalUsd: NaN, byModel: {} as Record<string, any> };
  });

  const headlineParts = [
    `E1: unanimous acc ${unanimousAcc !== null ? (unanimousAcc * 100).toFixed(0) + '%' : 'n/a'} (n=${perBucket['5/5'].n})`,
    falsified ? 'FALSIFIED' : 'NOT falsified',
  ];
  let headline = headlineParts.join(' — ');
  if (headline.length >= 140) headline = headline.slice(0, 137) + '...';

  const output = {
    headline,
    experiment: 'E1',
    hypothesis: 'Unanimous (5/5) items are >=95% accurate; falsified also if 4/5 is no worse than 5/5 (gap < 0.11).',
    falsified,
    falsifiedBecause: {
      unanimousAccuracyBelow95: falsifiedLowUnanimity,
      fourFifthsNoWorseThanFiveFifths: falsifiedNoInfoInUnanimity,
      gapFiveFour,
    },
    n: corpus.length,
    labellers: LABELLERS,
    labellerErrors: errorsByModel,
    perBucket,
    unanimityRate,
    overallConsensusAccuracy: overallConsensusAcc,
    perModelAccuracy,
    baselines: {
      majorityClass: { guess: MAJORITY_CLASS, accuracy: majorityClassAcc },
      keywordMatcher: { accuracy: keywordAcc },
    },
    cost: { totalUsd, byModel: costByModel },
    wallClockMs: Math.round(wallClockMs),
    hookResults,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2));
  console.error(`\nwrote ${OUT_PATH}`);
  console.error(headline);
  console.table(
    BUCKETS.map(b => ({
      bucket: b,
      n: (perBucket as any)[b].n,
      accuracy: (perBucket as any)[b].accuracy,
      insufficientData: (perBucket as any)[b].insufficientData,
    })),
  );
  console.error(`unanimity rate: ${unanimityRate}`);
  console.error(`majority-class baseline: ${majorityClassAcc}, keyword baseline: ${keywordAcc}`);
  console.error(`cost: $${Number.isFinite(totalUsd) ? totalUsd.toFixed(4) : 'unknown'}, wall clock: ${(wallClockMs / 1000).toFixed(1)}s`);
}

main();
