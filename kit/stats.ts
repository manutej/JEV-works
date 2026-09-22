/**
 * The kit's statistics, in one place. Before this, exact McNemar was reimplemented in four scripts
 * (e5-analyze, q4-baselines, oc-analyze, leads/evaluate). New code imports it from here.
 *
 * I6: an accuracy difference between two systems on the same items is judged by a PAIRED test
 * (exact McNemar, p < 0.05), never by P4's per-answer jitter band.
 */

/** Two-sided exact McNemar p from discordant counts b (only A right) and c (only B right). */
export function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  let logFact = 0;
  const lf: number[] = [0];
  for (let i = 1; i <= n; i++) { logFact += Math.log(i); lf.push(logFact); }
  let tail = 0;
  for (let k = 0; k <= Math.min(b, c); k++) tail += Math.exp(lf[n] - lf[k] - lf[n - k] - n * Math.LN2);
  return Math.min(1, 2 * tail);
}

export type Paired = {
  n: number;
  accuracyA: number;
  accuracyB: number;
  /** items only A got right / only B got right */
  b: number;
  c: number;
  p: number;
  different: boolean;
  deltaCI95: [number, number];
};

/** Seeded PRNG so every CI in a result file is reproducible. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

/** Paired comparison of 0/1 correctness vectors on the same items, same order. */
export function paired(a: readonly boolean[], bVec: readonly boolean[], draws = 2000, seed = 20260922): Paired {
  if (a.length !== bVec.length) throw new Error('paired: vectors differ in length');
  const n = a.length;
  let b = 0, c = 0;
  for (let i = 0; i < n; i++) { if (a[i] && !bVec[i]) b++; if (!a[i] && bVec[i]) c++; }
  const r = rng(seed), ds: number[] = [];
  for (let d = 0; d < draws; d++) {
    let s = 0;
    for (let i = 0; i < n; i++) { const j = Math.floor(r() * n); s += (+a[j]) - (+bVec[j]); }
    ds.push(s / n);
  }
  ds.sort((x, y) => x - y);
  const p = mcnemarExact(b, c);
  const acc = (v: readonly boolean[]) => v.filter(Boolean).length / (n || 1);
  return {
    n, accuracyA: acc(a), accuracyB: acc(bVec), b, c, p: +p.toPrecision(3), different: p < 0.05,
    deltaCI95: [ds[Math.floor(0.025 * draws)] ?? 0, ds[Math.floor(0.975 * draws)] ?? 0],
  };
}

/** Normalised Shannon entropy of a choice distribution, in [0, 1]. */
export function normEntropy(probs: Record<string, number>): number {
  const k = Object.keys(probs).length;
  const vs = Object.values(probs).filter(v => v > 0);
  if (k < 2 || vs.length < 2) return 0;
  return -vs.reduce((acc, v) => acc + v * Math.log(v), 0) / Math.log(k);
}
