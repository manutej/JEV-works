/**
 * Small stats helpers shared by e1-consensus.ts and e2-entropy-agreement.ts.
 * Nothing here is fit to the data — these are generic functions, not
 * thresholds, so P2 (holdouts declared before fitting) does not apply to them.
 */

export async function pool<T, R>(xs: readonly T[], n: number, f: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      for (let i = next++; i < xs.length; i = next++) out[i] = await f(xs[i], i);
    }),
  );
  return out;
}

export const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Linear-interpolated quantile, the common default (numpy/R type 7). */
export function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  if (n === 1) return s[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const iqr = (xs: readonly number[]): [number, number] => [quantile(xs, 0.25), quantile(xs, 0.75)];

/** The most frequent value in a list, and how many votes it got. Ties broken alphabetically for determinism. */
export function plurality<T extends string>(xs: readonly T[]): { winner: T; count: number } {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let winner: T | undefined;
  let count = -1;
  for (const [k, v] of [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (v > count) {
      winner = k;
      count = v;
    }
  }
  return { winner: winner as T, count };
}

/** Spearman rank correlation. Average ranks on ties (standard treatment). */
export function spearman(xs: readonly number[], ys: readonly number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return NaN;
  const rank = (vs: readonly number[]): number[] => {
    const idx = vs.map((v, i) => i).sort((a, b) => vs[a] - vs[b]);
    const ranks = new Array(vs.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && vs[idx[j + 1]] === vs[idx[i]]) j++;
      const avgRank = (i + j) / 2 + 1; // 1-based, averaged over the tied block
      for (let k = i; k <= j; k++) ranks[idx[k]] = avgRank;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? NaN : num / denom;
}

/** Per-call token usage, tagged with the model that produced it. */
export type UsageRow = { model: string; inputTokens: number; outputTokens: number };

/**
 * Real dollar cost from the Gateway's own published pricing (fetched live,
 * not hand-copied — prices drift and a stale hardcoded table silently lies).
 * Falls back to reporting tokens only if a model's pricing is unavailable.
 */
export async function costFromUsage(rows: readonly UsageRow[]): Promise<{
  totalUsd: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; usd: number | null }>;
}> {
  const { gateway } = await import('ai');
  const meta = await gateway.getAvailableModels();
  const pricing = new Map(meta.models.map(m => [m.id, m.pricing]));

  const byModel: Record<string, { inputTokens: number; outputTokens: number; usd: number | null }> = {};
  for (const r of rows) {
    byModel[r.model] ??= { inputTokens: 0, outputTokens: 0, usd: 0 };
    byModel[r.model].inputTokens += r.inputTokens;
    byModel[r.model].outputTokens += r.outputTokens;
  }
  let totalUsd = 0;
  for (const [model, agg] of Object.entries(byModel)) {
    const p = pricing.get(model);
    if (!p) {
      agg.usd = null;
      continue;
    }
    agg.usd = agg.inputTokens * Number(p.input) + agg.outputTokens * Number(p.output);
    totalUsd += agg.usd;
  }
  return { totalUsd, byModel };
}

/**
 * AUC of `scores` as a predictor of the boolean `positive` label, via the
 * Mann-Whitney U equivalence (rank-sum), which handles ties correctly without
 * a threshold sweep.
 */
export function auc(scores: readonly number[], positive: readonly boolean[]): number {
  const n = scores.length;
  if (n !== positive.length) throw new Error('length mismatch');
  const nPos = positive.filter(Boolean).length;
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return NaN;

  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  const ranks = new Array(n);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]] === scores[idx[i]]) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = avgRank;
    i = j + 1;
  }
  const rankSumPos = ranks.reduce((s, r, k) => s + (positive[k] ? r : 0), 0);
  const u = rankSumPos - (nPos * (nPos + 1)) / 2;
  return u / (nPos * nNeg);
}
