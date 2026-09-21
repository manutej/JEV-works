/**
 * Shared harness for the Jev experiments.
 *
 * Vendored from ~/jev-playground/experiments/_harness.ts so this repo no longer imports across projects
 * (that path broke tsc in every worktree). The two copies may diverge; this one is canonical for JEV-works.
 *
 * Everything an experiment needs that isn't the experiment: timed calls, live
 * pricing, percentiles, calibration stats, and a results writer. Experiments
 * stay short and about one question each.
 */
import { experimental_evaluate as evaluate, type Experimental_EvaluationQuestion } from 'ai';
import { writeFile, mkdir } from 'node:fs/promises';
import { JEV as JEV_MODEL, JEV_PRICE_ID, type JevModel } from './jev.ts';

/** Pricing-catalog key (callers index `livePricing()` with it). Calls go through the selector, not this string. */
export const JEV = JEV_PRICE_ID;

// ---------------------------------------------------------------- timed calls

export type Timed<T> = { value: T; ms: number };

export async function timed<T>(fn: () => Promise<T>): Promise<Timed<T>> {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - t0 };
}

export type JevRun<Q extends Record<string, Experimental_EvaluationQuestion>> = Timed<
  Awaited<ReturnType<typeof evaluate<Q>>>
>;

/** One Jev call, timed, with retries off so latency numbers mean something. */
export async function askJev<const Q extends Record<string, Experimental_EvaluationQuestion>>(
  state: string | Record<string, unknown>,
  questions: Q,
  opts: { model?: JevModel; maxRetries?: number } = {},
): Promise<JevRun<Q>> {
  return timed(() =>
    evaluate({
      model: opts.model ?? JEV_MODEL,
      state: state as never,
      questions,
      maxRetries: opts.maxRetries ?? 0,
      providerOptions: { gateway: { zeroDataRetention: true } },
    }),
  );
}

/** Run `fn` over items with bounded concurrency, preserving order. */
export async function pool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// -------------------------------------------------------------------- pricing

export type Pricing = { input: number; output: number };

let pricingCache: Record<string, Pricing> | undefined;

export async function livePricing(): Promise<Record<string, Pricing>> {
  if (pricingCache) return pricingCache;
  const res = await fetch('https://ai-gateway.vercel.sh/v1/models');
  if (!res.ok) throw new Error(`model catalog: ${res.status}`);
  const { data } = (await res.json()) as {
    data: Array<{ id: string; pricing?: { input?: string; output?: string } }>;
  };
  pricingCache = Object.fromEntries(
    data.map(m => [
      m.id,
      { input: Number(m.pricing?.input ?? 0), output: Number(m.pricing?.output ?? 0) },
    ]),
  );
  return pricingCache;
}

export function dollars(p: Pricing | undefined, inputTokens = 0, outputTokens = 0): number {
  if (!p) return NaN;
  return p.input * inputTokens + p.output * outputTokens;
}

// ---------------------------------------------------------------- descriptive

export const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function percentile(xs: readonly number[], q: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export const latencyReport = (ms: readonly number[]) => ({
  n: ms.length,
  mean: +mean(ms).toFixed(1),
  p50: +percentile(ms, 0.5).toFixed(1),
  p95: +percentile(ms, 0.95).toFixed(1),
  min: +Math.min(...ms).toFixed(1),
  max: +Math.max(...ms).toFixed(1),
});

// --------------------------------------------------------------- calibration
//
// The whole point of a model that returns probabilities is that the numbers
// mean something. These are the measurements that check it.

/** Brier score for binary predictions. Lower is better; 0.25 = always saying 0.5. */
export const brier = (predicted: readonly number[], actual: readonly boolean[]) =>
  mean(predicted.map((p, i) => (p - (actual[i] ? 1 : 0)) ** 2));

export type ReliabilityBin = {
  range: string;
  n: number;
  meanPredicted: number;
  observedRate: number;
  gap: number;
};

/** Reliability table: within each probability band, how often was it actually true? */
export function reliability(
  predicted: readonly number[],
  actual: readonly boolean[],
  bins = 10,
): ReliabilityBin[] {
  const out: ReliabilityBin[] = [];
  for (let b = 0; b < bins; b++) {
    const lo = b / bins;
    const hi = (b + 1) / bins;
    const idx = predicted
      .map((p, i) => [p, i] as const)
      .filter(([p]) => (b === bins - 1 ? p >= lo && p <= hi : p >= lo && p < hi))
      .map(([, i]) => i);
    if (idx.length === 0) continue;
    const mp = mean(idx.map(i => predicted[i]));
    const rate = idx.filter(i => actual[i]).length / idx.length;
    out.push({
      range: `${lo.toFixed(1)}–${hi.toFixed(1)}`,
      n: idx.length,
      meanPredicted: +mp.toFixed(3),
      observedRate: +rate.toFixed(3),
      gap: +(mp - rate).toFixed(3),
    });
  }
  return out;
}

/** Expected calibration error — the n-weighted mean |predicted − observed|. */
export const ece = (predicted: readonly number[], actual: readonly boolean[], bins = 10) => {
  const rs = reliability(predicted, actual, bins);
  const n = predicted.length;
  return +rs.reduce((acc, r) => acc + (r.n / n) * Math.abs(r.gap), 0).toFixed(4);
};

/**
 * Precision / coverage as a function of an auto-act threshold. This is the
 * table that actually picks your operating point: at each threshold, how much
 * traffic do you automate and how often are you wrong when you do?
 */
export function thresholdSweep(
  confidence: readonly number[],
  correct: readonly boolean[],
  thresholds = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.99],
) {
  return thresholds.map(t => {
    const auto = confidence.map((c, i) => [c, i] as const).filter(([c]) => c >= t);
    const wrong = auto.filter(([, i]) => !correct[i]).length;
    return {
      threshold: t,
      coverage: +(auto.length / confidence.length).toFixed(3),
      precision: auto.length ? +(1 - wrong / auto.length).toFixed(4) : NaN,
      autoErrors: wrong,
      toReview: confidence.length - auto.length,
    };
  });
}

// ------------------------------------------------------------------- results

export async function saveResults(name: string, payload: unknown): Promise<string> {
  const dir = new URL('./results/', import.meta.url);
  await mkdir(dir, { recursive: true });
  const path = new URL(`./${name}.json`, dir);
  await writeFile(path, JSON.stringify(payload, null, 2) + '\n');
  return path.pathname;
}

export function table(rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) return console.log('(no rows)');
  const cols = Object.keys(rows[0]);
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length)));
  console.log(cols.map((c, i) => c.padEnd(w[i])).join('  '));
  console.log(w.map(n => '─'.repeat(n)).join('  '));
  for (const r of rows) {
    console.log(cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  '));
  }
}
