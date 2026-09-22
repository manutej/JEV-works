/**
 * Thresholds that are chosen, not guessed. Pure functions; fit on the FIT split only, then freeze.
 *
 * The problem: "noul ≥ 0.5" or "escalate below 0.85" silently assume (a) Jev's probabilities are calibrated
 * and (b) a mistake in one direction costs the same as in the other. Neither is true by default.
 *
 * The method, in order:
 *   1. calibration(p, y)          → reliability bins, ECE, Brier: can p be read as a probability at all?
 *   2. isotonic(p, y)             → if not, a monotone recalibration map fitted on the fit split (PAV)
 *   3a. costThreshold(cFP, cFN)   → decision-theoretic cut t* = cFP / (cFP + cFN) on CALIBRATED p.
 *                                   Fixed by the business before seeing data; no fitting at all.
 *   3b. fitSelective(p, y, maxErr)→ three-way gate (accept / escalate / reject): the loosest cuts whose
 *                                   95% Clopper-Pearson UPPER bound on error among auto-decided items
 *                                   stays ≤ maxErr. You choose the error you can live with; coverage is the price.
 *   4. bootstrapCuts(...)         → how much the fitted cuts move under resampling (unstable = warn)
 *   5. applyGate(...) on TEST     → did the promised error bound actually hold on held-out data?
 */
import { rng } from './stats.ts';

// ---------------------------------------------------------------- exact binomial tools

/** P(X ≤ k) for X ~ Binomial(n, p), summed incrementally in log space: O(k). */
export function binomCdf(k: number, n: number, p: number): number {
  if (p <= 0) return 1;
  if (p >= 1) return k >= n ? 1 : 0;
  const logq = Math.log1p(-p), lr = Math.log(p) - logq;
  let lp = n * logq, s = Math.exp(lp);
  for (let i = 0; i < k; i++) { lp += Math.log(n - i) - Math.log(i + 1) + lr; s += Math.exp(lp); }
  return Math.min(1, s);
}
/** One-sided 95% (default) Clopper-Pearson upper bound on a rate after k events in n trials. */
export function clopperPearsonUpper(k: number, n: number, alpha = 0.05): number {
  if (n === 0) return 1;
  if (k >= n) return 1;
  let lo = k / n, hi = 1;
  for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (binomCdf(k, n, mid) > alpha) lo = mid; else hi = mid; }
  return hi;
}

// ---------------------------------------------------------------- 1. calibration

export type Calibration = { n: number; bins: { lo: number; hi: number; n: number; meanP: number; observed: number }[]; ece: number; brier: number };

export function calibration(p: readonly number[], y: readonly boolean[], nBins = 10): Calibration {
  if (p.length !== y.length) throw new Error('calibration: p and y differ in length');
  const bins = Array.from({ length: nBins }, (_, i) => ({ lo: i / nBins, hi: (i + 1) / nBins, n: 0, sp: 0, sy: 0 }));
  p.forEach((pi, i) => { const b = bins[Math.min(nBins - 1, Math.floor(pi * nBins))]; b.n++; b.sp += pi; b.sy += +y[i]; });
  const n = p.length;
  const ece = bins.reduce((a, b) => a + (b.n ? (b.n / n) * Math.abs(b.sp / b.n - b.sy / b.n) : 0), 0);
  const brier = p.reduce((a, pi, i) => a + (pi - +y[i]) ** 2, 0) / (n || 1);
  return { n, ece, brier, bins: bins.filter(b => b.n).map(b => ({ lo: b.lo, hi: b.hi, n: b.n, meanP: b.sp / b.n, observed: b.sy / b.n })) };
}

// ---------------------------------------------------------------- 2. isotonic recalibration (pool-adjacent-violators)

/** Returns a monotone non-decreasing map p → calibrated p, fitted on (p, y). Step function between knots. */
export function isotonic(p: readonly number[], y: readonly boolean[]): (x: number) => number {
  const pts = p.map((pi, i) => ({ x: pi, y: +y[i] })).sort((a, b) => a.x - b.x);
  const blocks: { xMax: number; sum: number; w: number }[] = [];
  for (const pt of pts) {
    blocks.push({ xMax: pt.x, sum: pt.y, w: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].w > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].w) {
      const b = blocks.pop()!, a = blocks.pop()!;
      blocks.push({ xMax: b.xMax, sum: a.sum + b.sum, w: a.w + b.w });
    }
  }
  const knots = blocks.map(b => ({ xMax: b.xMax, v: b.sum / b.w }));
  return (x: number) => (knots.find(k => x <= k.xMax) ?? knots[knots.length - 1])?.v ?? x;
}

// ---------------------------------------------------------------- 3a. cost threshold

/** Bayes-optimal cut on a CALIBRATED probability: say "yes" when p ≥ cFP / (cFP + cFN). */
export function costThreshold(costFalsePositive: number, costFalseNegative: number): number {
  if (!(costFalsePositive > 0 && costFalseNegative > 0)) throw new Error('costThreshold: both costs must be > 0');
  return costFalsePositive / (costFalsePositive + costFalseNegative);
}

// ---------------------------------------------------------------- 3b. selective three-way gate

export type Gate = {
  /** Auto-accept (say yes) when p ≥ hi; auto-reject (say no) when p ≤ lo; escalate in between. null = never auto-decide that side. */
  hi: number | null;
  lo: number | null;
  maxError: number;
  fit: { n: number; acceptN: number; acceptErrors: number; acceptErrUpper: number; rejectN: number; rejectErrors: number; rejectErrUpper: number; coverage: number };
};

/**
 * Loosest cuts such that the 95% upper bound on the error rate among auto-accepted (resp. auto-rejected)
 * fit items is ≤ maxError. Scans every observed p as a candidate cut. Fit split only.
 */
export function fitSelective(p: readonly number[], y: readonly boolean[], maxError: number, minSide = 8): Gate {
  if (p.length !== y.length) throw new Error('fitSelective: p and y differ in length');
  const n = p.length;
  const ord = p.map((pi, i) => [pi, y[i]] as const).sort((a, b) => a[0] - b[0]);
  const ps = ord.map(o => o[0]);
  // negatives at or above index i (accept errors) and positives below index j (reject errors), via cumulative counts
  const posPrefix = [0]; for (const [, yi] of ord) posPrefix.push(posPrefix[posPrefix.length - 1] + +yi);
  const firstAtLeast = (t: number) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (ps[m] < t) lo = m + 1; else hi = m; } return lo; };
  const cands = [...new Set(ps)];
  let hi: number | null = null, acc = { n: 0, e: 0, u: 1 }, hiIdx = n;
  for (const t of cands) {                                   // ascending: the first passing cut is the loosest
    const i = firstAtLeast(t), m = n - i;
    if (m < minSide) break;
    const e = m - (posPrefix[n] - posPrefix[i]), u = clopperPearsonUpper(e, m);
    if (u <= maxError) { hi = t; acc = { n: m, e, u }; hiIdx = i; break; }
  }
  let lo: number | null = null, rej = { n: 0, e: 0, u: 1 };
  for (let c = cands.length - 1; c >= 0; c--) {               // descending: the first passing cut is the loosest
    const t = cands[c];
    let j = firstAtLeast(t); while (j < n && ps[j] === t) j++;  // items with p ≤ t are [0, j)
    j = Math.min(j, hiIdx);                                     // never overlap the accept side
    if (j < minSide) break;
    const e = posPrefix[j], u = clopperPearsonUpper(e, j);
    if (u <= maxError) { lo = t; rej = { n: j, e, u }; break; }
  }
  return {
    hi, lo, maxError,
    fit: { n, acceptN: acc.n, acceptErrors: acc.e, acceptErrUpper: acc.u, rejectN: rej.n, rejectErrors: rej.e, rejectErrUpper: rej.u, coverage: (acc.n + rej.n) / (n || 1) },
  };
}

export type GateOutcome = { n: number; coverage: number; accepted: number; acceptErrors: number; rejected: number; rejectErrors: number; errorRate: number; errorUpper95: number; held: boolean };

/** Apply a FROZEN gate to held-out data: did the promised error bound hold? */
export function applyGate(g: Gate, p: readonly number[], y: readonly boolean[]): GateOutcome {
  let accepted = 0, acceptErrors = 0, rejected = 0, rejectErrors = 0;
  p.forEach((pi, i) => {
    if (g.hi !== null && pi >= g.hi) { accepted++; if (!y[i]) acceptErrors++; }
    else if (g.lo !== null && pi <= g.lo) { rejected++; if (y[i]) rejectErrors++; }
  });
  const decided = accepted + rejected, errors = acceptErrors + rejectErrors;
  const errorUpper95 = clopperPearsonUpper(errors, decided);
  return {
    n: p.length, coverage: decided / (p.length || 1), accepted, acceptErrors, rejected, rejectErrors,
    errorRate: decided ? errors / decided : 0, errorUpper95,
    held: decided === 0 ? true : errors / decided <= g.maxError,
  };
}

// ---------------------------------------------------------------- 4. stability

/** Refit the gate on bootstrap resamples of the fit split; report the spread of each cut. */
export function bootstrapCuts(p: readonly number[], y: readonly boolean[], maxError: number, draws = 200, seed = 20260922) {
  const r = rng(seed), his: number[] = [], los: number[] = [];
  let hiNull = 0, loNull = 0;
  for (let d = 0; d < draws; d++) {
    const idx = p.map(() => Math.floor(r() * p.length));
    const g = fitSelective(idx.map(i => p[i]), idx.map(i => y[i]), maxError);
    if (g.hi === null) hiNull++; else his.push(g.hi);
    if (g.lo === null) loNull++; else los.push(g.lo);
  }
  const q = (xs: number[], f: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null; };
  const band = (xs: number[]) => ({ p05: q(xs, 0.05), p50: q(xs, 0.5), p95: q(xs, 0.95) });
  const hi = band(his), lo = band(los);
  const width = (b: { p05: number | null; p95: number | null }) => (b.p05 === null || b.p95 === null ? null : b.p95 - b.p05);
  const unstable = (width(hi) ?? 0) > 0.2 || (width(lo) ?? 0) > 0.2 || hiNull / draws > 0.2 || loNull / draws > 0.2;
  return { draws, hi, lo, hiNeverFits: hiNull / draws, loNeverFits: loNull / draws, unstable };
}


// ---------------------------------------------------------------- evaluators of calibration, and an audit of those evaluators
//
// ECE alone is a poor judge: it depends on the binning and is biased UP at small n (it reports miscalibration from
// noise alone). So calibration is judged by several evaluators, and each evaluator is itself audited on data whose
// calibration is known by construction: its false-alarm rate on calibrated data must match its α, and its power
// on known distortions must be reported. An evaluator that fails its own audit is not used to set thresholds.

const clampP = (x: number) => Math.min(1 - 1e-6, Math.max(1e-6, x));
const logit = (x: number) => Math.log(clampP(x) / (1 - clampP(x)));
/** Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf). */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** Spiegelhalter's Z: tests H0 "p is calibrated" without binning. Returns z and the two-sided p-value. */
export function spiegelhalter(p: readonly number[], y: readonly boolean[]): { z: number; pValue: number } {
  let num = 0, den = 0;
  p.forEach((pi, i) => { const q = clampP(pi); num += (+y[i] - q) * (1 - 2 * q); den += (1 - 2 * q) ** 2 * q * (1 - q); });
  if (den === 0) return { z: 0, pValue: 1 };
  const z = num / Math.sqrt(den);
  return { z, pValue: 2 * (1 - normCdf(Math.abs(z))) };
}

/** Calibration slope and intercept: logistic regression of y on logit(p). Calibrated ⇔ slope ≈ 1, intercept ≈ 0. */
export function calibrationSlope(p: readonly number[], y: readonly boolean[]): { intercept: number; slope: number; seIntercept: number; seSlope: number } {
  const x = p.map(logit);
  let a = 0, b = 1, varA = Infinity, varB = Infinity;
  for (let it = 0; it < 50; it++) {                            // Newton-Raphson on the 2-parameter log-likelihood
    let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
    x.forEach((xi, i) => { const m = 1 / (1 + Math.exp(-(a + b * xi))), w = m * (1 - m), r = +y[i] - m; ga += r; gb += r * xi; haa += w; hab += w * xi; hbb += w * xi * xi; });
    const det = haa * hbb - hab * hab;
    if (Math.abs(det) < 1e-12) break;
    varA = hbb / det; varB = haa / det;          // inverse Fisher information → standard errors
    const da = (hbb * ga - hab * gb) / det, db = (haa * gb - hab * ga) / det;
    a += da; b += db;
    if (Math.abs(da) + Math.abs(db) < 1e-9) break;
  }
  return { intercept: a, slope: b, seIntercept: Math.sqrt(varA), seSlope: Math.sqrt(varB) };
}

/** ECE with a bootstrap 95% CI, so a small-n ECE is read with its noise. */
export function eceWithCI(p: readonly number[], y: readonly boolean[], draws = 300, seed = 20260922) {
  const r = rng(seed), es: number[] = [];
  for (let d = 0; d < draws; d++) { const idx = p.map(() => Math.floor(r() * p.length)); es.push(calibration(idx.map(i => p[i]), idx.map(i => y[i])).ece); }
  es.sort((a, b) => a - b);
  return { ece: calibration(p, y).ece, ci95: [es[Math.floor(0.025 * draws)], es[Math.floor(0.975 * draws)]] as [number, number] };
}

export type CalibrationVerdict = {
  n: number; ece: number; eceCI95: [number, number]; brier: number;
  slope: number; intercept: number; spiegelhalterZ: number; spiegelhalterP: number;
  /** calibrated = no evaluator rejects, each at Bonferroni α = 0.05/3: Spiegelhalter, slope CI covers 1, intercept CI covers 0 */
  calibrated: boolean; reasons: string[];
};

/** The combined judgement used before any cost threshold is trusted. */
export function judgeCalibration(p: readonly number[], y: readonly boolean[]): CalibrationVerdict {
  const c = calibration(p, y), e = eceWithCI(p, y), s = spiegelhalter(p, y), cs = calibrationSlope(p, y);
  const reasons: string[] = [];
  // Three evaluators each at 0.05 false-alarmed ~10% combined (audit); Bonferroni: each at 0.05/3, z = 2.394.
  if (s.pValue < 0.05 / 3) reasons.push(`Spiegelhalter rejects calibration (z=${s.z.toFixed(2)}, p=${s.pValue.toPrecision(2)})`);
  // Reject on the parameter's 95% CI, not on a fixed tolerance: fixed bounds false-alarmed 80% of the time at n=40
  // on calibrated data (caught by auditCalibrationEvaluator, 2026-09-22).
  if (Math.abs(cs.slope - 1) > 2.394 * cs.seSlope) reasons.push(`slope ${cs.slope.toFixed(2)} ± ${(2.394 * cs.seSlope).toFixed(2)} excludes 1 (<1 overconfident, >1 underconfident)`);
  if (Math.abs(cs.intercept) > 2.394 * cs.seIntercept) reasons.push(`intercept ${cs.intercept.toFixed(2)} ± ${(2.394 * cs.seIntercept).toFixed(2)} excludes 0 (miscalibrated in the large)`);
  // Audit (program/calib-audit.ts): power < 0.8 below n≈100, so a small-n 'calibrated' is absence of evidence.
  if (p.length < 100) reasons.push(`n=${p.length} < 100: too few items to judge calibration (evaluator power < 80%); treat p as uncalibrated`);
  return { n: p.length, ece: c.ece, eceCI95: e.ci95, brier: c.brier, slope: cs.slope, intercept: cs.intercept,
    spiegelhalterZ: s.z, spiegelhalterP: s.pValue, calibrated: reasons.length === 0, reasons };
}

/**
 * Audit the evaluator itself by simulation: on data calibrated BY CONSTRUCTION, how often does judgeCalibration
 * call it miscalibrated (false alarms; should be ≈ α or less)? On a KNOWN distortion, how often does it catch it (power)?
 * Run this at the n you actually have: an evaluator can be trustworthy at n=3000 and useless at n=40.
 */
export function auditCalibrationEvaluator(n: number, sims = 200, distort = (t: number) => Math.min(0.99, t < 0.5 ? t / 3 : 1 - (1 - t) / 3), seed = 7) {
  const r = rng(seed);
  const sample = (f: (t: number) => number) => { const p: number[] = [], y: boolean[] = []; for (let i = 0; i < n; i++) { const t = r(); p.push(+f(t).toFixed(2)); y.push(r() < t); } return { p, y }; };
  let falseAlarms = 0, detections = 0;
  for (let k = 0; k < sims; k++) {
    const c = sample(t => t); if (!judgeCalibration(c.p, c.y).calibrated) falseAlarms++;
    const d = sample(distort); if (!judgeCalibration(d.p, d.y).calibrated) detections++;
  }
  return { n, sims, falseAlarmRate: falseAlarms / sims, power: detections / sims, trustworthy: falseAlarms / sims <= 0.075 && detections / sims >= 0.8 };
}

// ---------------------------------------------------------------- planning: can this fit split certify anything?

/**
 * Smallest number of auto-decided fit items that could certify `maxError` at 95% if EVERY one were correct:
 * the Clopper-Pearson upper bound for 0 errors in n is 1 − α^(1/n), so n ≥ ln α / ln(1 − maxError).
 * maxError 0.05 → 59, 0.02 → 149, 0.10 → 29. Each errorful item raises it further. Use BEFORE collecting data:
 * a fit split below this can't produce a bounded gate on that side, however good the model is.
 */
export function minItemsForBound(maxError: number, alpha = 0.05): number {
  if (!(maxError > 0 && maxError < 1)) throw new Error('minItemsForBound: maxError must be in (0, 1)');
  return Math.ceil(Math.log(alpha) / Math.log(1 - maxError));
}

