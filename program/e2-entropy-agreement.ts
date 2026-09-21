/**
 * E2 — does model disagreement mark the same boundary as Jev's entropy? (PROGRAM.md)
 *
 * One `experimental_evaluate` choice call per hook, with Jev, over the same 9
 * formula options and the same descriptions used in E1 (so a difference in
 * result cannot be attributed to different wording). Requires
 * results/e1-consensus.json to already exist — this experiment is
 * conditional on E1's agreement buckets.
 *
 * Hypothesis (fixed by PROGRAM.md, not editable here):
 *   Entropy rises monotonically as agreement falls.
 * Falsified if:
 *   (a) |Spearman rho (entropy vs agreement level)| < 0.3, OR
 *   (b) the entropy distributions of unanimous vs split items overlap
 *       substantially — declared here as: their IQRs intersect, OR the
 *       median gap is below the 0.11 noise floor (P4).
 *
 *   node --env-file-if-exists=/Users/manu/jev-playground/.env.local program/e2-entropy-agreement.ts
 */
import { experimental_evaluate as evaluate } from 'ai';
import { readFile, writeFile } from 'node:fs/promises';
import { CORPUS_PATH, FORMULA_DESCRIPTIONS, type Hook } from './formulas.ts';
import { keywordClassify, MAJORITY_CLASS } from './keyword-baseline.ts';
import { entropy } from '../question-bank/colors.ts';
import { pool, spearman, median, iqr, auc, costFromUsage, type UsageRow } from './stats.ts';
import { JEV, JEV_PRICE_ID } from '../lib/jev.ts';

const CONCURRENCY = Number(process.env.CONCURRENCY ?? 10);
const MODEL = JEV_PRICE_ID; // pricing key; the call itself goes through JEV
const OUT_PATH = new URL('./results/e2-entropy-agreement.json', import.meta.url).pathname;
const E1_PATH = new URL('./results/e1-consensus.json', import.meta.url).pathname;

const QUESTIONS = {
  formula: {
    type: 'choice',
    instructions: 'Which single mechanism does this marketing hook rely on most?',
    criteria: FORMULA_DESCRIPTIONS,
  },
} as const;

type E1Hook = { id: string; formula: string; pluralityCount: number; bucket: string };

async function main() {
  const t0 = performance.now();
  const fullCorpus: Hook[] = JSON.parse(await readFile(CORPUS_PATH, 'utf8'));
  // Dev-only smoke-test knob; unset in the real run, so the reported n is always 80.
  const limit = process.env.E2_LIMIT ? Number(process.env.E2_LIMIT) : fullCorpus.length;
  const corpus = fullCorpus.slice(0, limit);

  let e1: { hookResults: E1Hook[] };
  try {
    e1 = JSON.parse(await readFile(E1_PATH, 'utf8'));
  } catch {
    console.error(`E2 requires E1's output at ${E1_PATH} — run e1-consensus.ts first.`);
    process.exit(1);
  }
  const e1ById = new Map(e1.hookResults.map(h => [h.id, h]));

  console.error(`E2: ${corpus.length} hooks x 1 Jev call each`);

  let done = 0;
  const usageRows: UsageRow[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  const jevResults = await pool(corpus, CONCURRENCY, async hook => {
    try {
      const { answers, usage } = await evaluate({
        model: JEV,
        state: { text: hook.text },
        questions: QUESTIONS,
        maxRetries: 2,
        providerOptions: { gateway: { zeroDataRetention: true } },
      });
      usageRows.push({ model: MODEL, inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0 });
      done++;
      if (done % 20 === 0) console.error(`  ${done}/${corpus.length}`);
      return { choice: answers.formula.choice, distribution: answers.formula.probabilities ?? undefined };
    } catch (e: any) {
      errors.push({ id: hook.id, error: e?.message?.slice(0, 300) ?? String(e) });
      done++;
      return { choice: null as string | null, distribution: undefined as Record<string, number> | undefined };
    }
  });

  const wallClockMs = performance.now() - t0;

  type Row = {
    id: string;
    formula: string;
    jevChoice: string | null;
    distribution: Record<string, number> | undefined;
    entropy: number | null;
    agreementCount: number | null; // E1 pluralityCount, 1-5
    agreementBucket: string | null;
    unanimous: boolean | null;
    jevCorrect: boolean | null;
  };

  const rows: Row[] = corpus.map((hook, i) => {
    const j = jevResults[i];
    const e = j.distribution ? entropy(j.distribution) : NaN;
    const e1h = e1ById.get(hook.id);
    return {
      id: hook.id,
      formula: hook.formula,
      jevChoice: j.choice,
      distribution: j.distribution,
      entropy: Number.isFinite(e) ? +e.toFixed(4) : null,
      agreementCount: e1h?.pluralityCount ?? null,
      agreementBucket: e1h?.bucket ?? null,
      unanimous: e1h ? e1h.bucket === '5/5' : null,
      jevCorrect: j.choice !== null ? j.choice === hook.formula : null,
    };
  });

  const withEntropyAndAgreement = rows.filter(r => r.entropy !== null && r.agreementCount !== null);
  const droppedForNaN = rows.length - withEntropyAndAgreement.length;

  const rho = spearman(
    withEntropyAndAgreement.map(r => r.entropy!),
    withEntropyAndAgreement.map(r => r.agreementCount!),
  );

  const unanimousEntropies = withEntropyAndAgreement.filter(r => r.unanimous === true).map(r => r.entropy!);
  const splitEntropies = withEntropyAndAgreement.filter(r => r.unanimous === false).map(r => r.entropy!);

  const unanimousMedian = median(unanimousEntropies);
  const splitMedian = median(splitEntropies);
  const unanimousIqr = iqr(unanimousEntropies);
  const splitIqr = iqr(splitEntropies);

  const iqrIntersect = Math.min(unanimousIqr[1], splitIqr[1]) >= Math.max(unanimousIqr[0], splitIqr[0]);
  const NOISE_FLOOR = 0.11;
  const medianGap = Math.abs(unanimousMedian - splitMedian);
  const medianGapBelowFloor = medianGap < NOISE_FLOOR;
  const overlapsSubstantially = iqrIntersect || medianGapBelowFloor;

  // AUC of entropy predicting "labellers disagreed" (positive = split/not-unanimous).
  const aucRows = withEntropyAndAgreement.filter(r => r.unanimous !== null);
  const entropyAuc = auc(
    aucRows.map(r => r.entropy!),
    aucRows.map(r => r.unanimous === false),
  );

  // Jev's own accuracy vs the two E1 baselines (majority-class, keyword), on all 80.
  const jevScored = rows.filter(r => r.jevChoice !== null);
  const jevAccuracy = +(jevScored.filter(r => r.jevCorrect).length / corpus.length).toFixed(4);
  const majorityClassAcc = +(corpus.filter(h => h.formula === MAJORITY_CLASS).length / corpus.length).toFixed(4);
  const keywordAcc = +(corpus.filter(h => keywordClassify(h.text) === h.formula).length / corpus.length).toFixed(4);

  const falsifiedWeakCorrelation = !Number.isFinite(rho) || Math.abs(rho) < 0.3;
  const falsified = falsifiedWeakCorrelation || overlapsSubstantially;

  const { totalUsd, byModel: costByModel } = await costFromUsage(usageRows).catch(e => {
    console.error('cost lookup failed:', e?.message ?? e);
    return { totalUsd: NaN, byModel: {} as Record<string, any> };
  });

  const headlineParts = [
    `E2: rho=${Number.isFinite(rho) ? rho.toFixed(2) : 'NaN'}`,
    `med(uni)=${unanimousMedian.toFixed(2)} vs med(split)=${splitMedian.toFixed(2)}`,
    falsified ? 'FALSIFIED' : 'NOT falsified',
  ];
  let headline = headlineParts.join(' — ');
  if (headline.length >= 140) headline = headline.slice(0, 137) + '...';

  const output = {
    headline,
    experiment: 'E2',
    hypothesis: 'Entropy rises monotonically as agreement falls; falsified if |rho|<0.3 or unanimous/split entropy distributions overlap substantially.',
    falsified,
    falsifiedBecause: {
      weakCorrelation: falsifiedWeakCorrelation,
      distributionsOverlap: overlapsSubstantially,
      iqrIntersect,
      medianGapBelowNoiseFloor: medianGapBelowFloor,
    },
    n: corpus.length,
    nUsedForCorrelation: withEntropyAndAgreement.length,
    droppedForMissingData: droppedForNaN,
    spearmanRho: Number.isFinite(rho) ? +rho.toFixed(4) : null,
    entropyByAgreement: {
      unanimous: { n: unanimousEntropies.length, median: +unanimousMedian.toFixed(4), iqr: unanimousIqr.map(x => +x.toFixed(4)), insufficientData: unanimousEntropies.length < 8 },
      split: { n: splitEntropies.length, median: +splitMedian.toFixed(4), iqr: splitIqr.map(x => +x.toFixed(4)), insufficientData: splitEntropies.length < 8 },
    },
    aucEntropyPredictsDisagreement: Number.isFinite(entropyAuc) ? +entropyAuc.toFixed(4) : null,
    jev: {
      accuracy: jevAccuracy,
      errors: errors.length,
      vsMajorityClassBaseline: +(jevAccuracy - majorityClassAcc).toFixed(4),
      vsKeywordBaseline: +(jevAccuracy - keywordAcc).toFixed(4),
    },
    baselines: {
      majorityClass: { guess: MAJORITY_CLASS, accuracy: majorityClassAcc },
      keywordMatcher: { accuracy: keywordAcc },
    },
    cost: { totalUsd, byModel: costByModel },
    wallClockMs: Math.round(wallClockMs),
    errorsDetail: errors,
    rows,
  };

  await writeFile(OUT_PATH, JSON.stringify(output, null, 2));
  console.error(`\nwrote ${OUT_PATH}`);
  console.error(headline);
  console.error(`rho=${output.spearmanRho}, unanimous median=${unanimousMedian.toFixed(3)} (n=${unanimousEntropies.length}), split median=${splitMedian.toFixed(3)} (n=${splitEntropies.length})`);
  console.error(`AUC(entropy predicts disagreement) = ${output.aucEntropyPredictsDisagreement}`);
  console.error(`Jev accuracy=${jevAccuracy} vs majority-class=${majorityClassAcc}, keyword=${keywordAcc}`);
  console.error(`cost: $${Number.isFinite(totalUsd) ? totalUsd.toFixed(4) : 'unknown'}, wall clock: ${(wallClockMs / 1000).toFixed(1)}s`);
}

main();
