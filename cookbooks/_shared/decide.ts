/**
 * cookbooks/_shared/decide.ts — turn a kit result file into a decision, with every threshold fitted on the FIT split.
 *
 *   node cookbooks/_shared/decide.ts <domainDir> fit  <kit result of spec.fit.json>   → <domainDir>/rule.frozen.json
 *   node cookbooks/_shared/decide.ts <domainDir> test <kit result of spec.json>       → <domainDir>/results/decision-test.json
 *
 * `fit` refuses to overwrite rule.frozen.json; `test` refuses to run twice (one labelled test per domain) and never
 * re-fits anything. The domain's rule.ts says what to fit and why:
 *
 *   binary  features (noul ids, or "choiceId=option" for that option's probability) → L2 logistic regression on the
 *           fit split → a decision threshold (cost ratio or target precision) → an escalate band around it, the widest
 *           auto-decided region whose FIT error stays ≤ maxAutoError.
 *   choice  the decision is Jev's pick on one choice question; the gate is TypeSafe's documented confidence,
 *           (k·peak − 1)/(k − 1), cut at the lowest value whose FIT error on auto-accepted items is ≤ maxAutoError.
 *
 * Comparisons use the kit's single paired test (kit/stats.ts: exact McNemar + seeded bootstrap).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { paired } from '../../kit/stats.ts';
import type { Answer } from '../../kit/ask.ts';
import type { Label, Spec } from '../../kit/spec.ts';

export type Rule =
  | {
    kind: 'binary';
    /** labelled noul whose label is the decision (true = positive class) */
    target: string;
    features: string[];
    threshold: { method: 'cost'; fpCost: number; fnCost: number; why: string } | { method: 'precision'; min: number; why: string };
    escalate: { maxAutoError: number; why: string };
  }
  | { kind: 'choice'; target: string; escalate: { maxAutoError: number; why: string } };

type ResultItem = { id: string; answers?: Record<string, Answer>; answeredBy?: string; error?: string };
type Result = { spec: string; model: string; answeredBy: string[]; calls: number; items: ResultItem[] };

const [dirArg, mode, resultArg] = process.argv.slice(2);
if (!dirArg || !['fit', 'test'].includes(mode) || !resultArg) {
  console.error('usage: node cookbooks/_shared/decide.ts <domainDir> fit|test <kit-result.json>'); process.exit(64);
}
const dir = resolve(dirArg);
const { rule } = await import(join(dir, 'rule.ts')) as { rule: Rule };
const spec = JSON.parse(readFileSync(join(dir, 'spec.json'), 'utf8')) as Spec;
const result = JSON.parse(readFileSync(resolve(resultArg), 'utf8')) as Result;
// Labels and baseline come from items.meta.json (written by writeSpecs for every domain), so a decision target that is
// not itself a Jev question (job-postings, after its pilot) is scored exactly like one that is.
type Meta = { id: string; split: 'fit' | 'test'; labels?: Record<string, Label>; baseline?: Record<string, Label> };
const meta = JSON.parse(readFileSync(join(dir, 'items.meta.json'), 'utf8')) as Meta[];
spec.items = meta.map(m => ({ id: m.id, state: null, split: m.split, labels: m.labels, baseline: m.baseline }));
const byId = new Map(spec.items.map(i => [i.id, i]));
const r3 = (x: number) => +x.toFixed(3);

// ---------------------------------------------------------------- features

function featureValue(a: Record<string, Answer>, f: string): number {
  const [q, opt] = f.split('=');
  const x = a[q];
  if (!x) throw new Error(`feature ${f}: no answer for ${q}`);
  if (opt !== undefined) { if (x.type !== 'choice') throw new Error(`${f}: ${q} is not a choice`); return x.probabilities[opt] ?? 0; }
  if (x.type === 'noul') return x.p;
  throw new Error(`feature ${f}: use "${q}=<option>" for a choice`);
}

/** TypeSafe's documented choice confidence: (k·peak − 1)/(k − 1), clipped to [0, 1]. */
export function choiceConfidence(probs: Record<string, number>): number {
  const v = Object.values(probs), k = v.length;
  if (k < 2) return 1;
  return Math.max(0, Math.min(1, (k * Math.max(...v) - 1) / (k - 1)));
}

// ---------------------------------------------------------------- logistic regression (deterministic)

function fitLogistic(X: number[][], y: number[], lambda = 1, iters = 4000, lr = 0.5): { w: number[]; b: number } {
  const n = X.length, d = X[0].length;
  let w = new Array(d).fill(0), b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      const z = b + X[i].reduce((s, v, j) => s + v * w[j], 0);
      const e = 1 / (1 + Math.exp(-z)) - y[i];
      for (let j = 0; j < d; j++) gw[j] += e * X[i][j];
      gb += e;
    }
    w = w.map((wj, j) => wj - lr * (gw[j] / n + (lambda / n) * wj));
    b -= lr * gb / n;
  }
  return { w, b };
}
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

// ---------------------------------------------------------------- threshold + band, on fit only

type Pt = { s: number; y: boolean };

function chooseThreshold(pts: Pt[], t: Extract<Rule, { kind: 'binary' }>['threshold']): { t: number; how: string } {
  const cands = [...new Set([0.5, ...pts.map(p => p.s)])].sort((a, b) => a - b);
  if (t.method === 'cost') {
    let best = { t: 0.5, cost: Infinity };
    for (const c of cands) {
      const cost = pts.reduce((s, p) => s + (p.s >= c && !p.y ? t.fpCost : 0) + (p.s < c && p.y ? t.fnCost : 0), 0);
      if (cost < best.cost - 1e-9 || (Math.abs(cost - best.cost) < 1e-9 && Math.abs(c - 0.5) < Math.abs(best.t - 0.5))) best = { t: c, cost };
    }
    return { t: best.t, how: `minimises ${t.fpCost}·FP + ${t.fnCost}·FN on the fit split (fit cost ${best.cost})` };
  }
  for (const c of cands) {
    const pos = pts.filter(p => p.s >= c);
    if (pos.length >= 5 && pos.filter(p => p.y).length / pos.length >= t.min) return { t: c, how: `lowest cut with fit precision ≥ ${t.min} (≥ 5 flagged)` };
  }
  return { t: cands[cands.length - 1], how: `no cut reached fit precision ${t.min}; highest score used` };
}

/** Widest band [lo, hi) around t, escalated; auto-decided fit items (s < lo → negative, s ≥ hi → positive) keep error ≤ max. */
function chooseBand(pts: Pt[], t: number, max: number): { lo: number; hi: number; fitCoverage: number; fitAutoError: number } {
  const los = [...new Set([t, ...pts.map(p => p.s).filter(s => s < t)])];
  const his = [...new Set([t, ...pts.map(p => p.s).filter(s => s > t)])];
  let best = { lo: t, hi: t, fitCoverage: -1, fitAutoError: 1 };
  for (const lo of los) for (const hi of his) {
    const auto = pts.filter(p => p.s < lo || p.s >= hi);
    const err = auto.filter(p => (p.s >= hi) !== p.y).length / (auto.length || 1);
    const cov = auto.length / pts.length;
    if (err <= max && (cov > best.fitCoverage || (cov === best.fitCoverage && hi - lo < best.hi - best.lo))) best = { lo, hi, fitCoverage: cov, fitAutoError: err };
  }
  if (best.fitCoverage < 0) best = { lo: -1, hi: 2, fitCoverage: 0, fitAutoError: 0 };   // scores live in (0, 1): nothing is auto-decided
  return best;
}

function chooseConfidenceCut(pts: { conf: number; ok: boolean }[], max: number): { cut: number; fitCoverage: number; fitAutoError: number } {
  const cands = [...new Set(pts.map(p => p.conf))].sort((a, b) => a - b);
  for (const c of cands) {
    const auto = pts.filter(p => p.conf >= c);
    const err = auto.filter(p => !p.ok).length / auto.length;
    if (err <= max) return { cut: c, fitCoverage: auto.length / pts.length, fitAutoError: err };
  }
  return { cut: 2, fitCoverage: 0, fitAutoError: 0 };   // confidence ≤ 1: nothing is auto-accepted
}

// ---------------------------------------------------------------- fit

const frozenPath = join(dir, 'rule.frozen.json');
const labelOf = (id: string): Label => { const l = byId.get(id)?.labels?.[rule.target]; if (l === undefined) throw new Error(`${id}: no label for ${rule.target}`); return l; };

if (mode === 'fit') {
  if (existsSync(frozenPath)) { console.error(`REFUSED: ${frozenPath} exists; a frozen rule is never re-fitted.`); process.exit(4); }
  const fitIds = new Set(spec.items.filter(i => i.split === 'fit').map(i => i.id));
  const rows = result.items.filter(r => r.answers);
  if (rows.some(r => !fitIds.has(r.id))) { console.error('REFUSED: the result contains non-fit items; thresholds are fitted on the fit split only.'); process.exit(4); }
  let frozen: Record<string, unknown>;
  if (rule.kind === 'binary') {
    const X = rows.map(r => rule.features.map(f => featureValue(r.answers!, f)));
    const y = rows.map(r => (labelOf(r.id) === true ? 1 : 0));
    const { w, b } = fitLogistic(X, y);
    const pts: Pt[] = rows.map((r, i) => ({ s: sigmoid(b + X[i].reduce((s, v, j) => s + v * w[j], 0)), y: y[i] === 1 }));
    const th = chooseThreshold(pts, rule.threshold);
    const band = chooseBand(pts, th.t, rule.escalate.maxAutoError);
    const fitAcc = pts.filter(p => (p.s >= th.t) === p.y).length / pts.length;
    frozen = {
      kind: 'binary', target: rule.target, fittedOn: { result: resultArg, n: rows.length, unanswered: result.items.length - rows.length },
      features: rule.features, weights: Object.fromEntries(rule.features.map((f, j) => [f, r3(w[j])])), bias: r3(b), lambda: 1,
      threshold: { t: r3(th.t), how: th.how, why: rule.threshold.why },
      band: { lo: r3(band.lo), hi: r3(band.hi), maxAutoError: rule.escalate.maxAutoError, why: rule.escalate.why, fitCoverage: r3(band.fitCoverage), fitAutoError: r3(band.fitAutoError) },
      fitAccuracy: r3(fitAcc),
      _exact: { w, b, t: th.t, lo: band.lo, hi: band.hi },
    };
  } else {
    const pts = rows.map(r => { const a = r.answers![rule.target]; if (a.type !== 'choice') throw new Error(`${rule.target} is not a choice`); return { conf: choiceConfidence(a.probabilities), ok: a.choice === labelOf(r.id) }; });
    const g = chooseConfidenceCut(pts, rule.escalate.maxAutoError);
    frozen = {
      kind: 'choice', target: rule.target, fittedOn: { result: resultArg, n: rows.length, unanswered: result.items.length - rows.length },
      gate: { confidenceAtLeast: g.cut <= 1 ? r3(g.cut) : null, maxAutoError: rule.escalate.maxAutoError, why: rule.escalate.why, fitCoverage: r3(g.fitCoverage), fitAutoError: r3(g.fitAutoError) },
      fitAccuracy: r3(pts.filter(p => p.ok).length / pts.length),
      _exact: { cut: g.cut },
    };
  }
  frozen.frozenAt = new Date().toISOString();
  writeFileSync(frozenPath, JSON.stringify(frozen, null, 2) + '\n');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(frozen).filter(([k]) => k !== '_exact')), null, 2));
  console.log(`frozen → ${frozenPath}`);
  process.exit(0);
}

// ---------------------------------------------------------------- test (once)

const outDir = join(dir, 'results'); mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'decision-test.json');
if (existsSync(outPath)) { console.error(`REFUSED: ${outPath} exists; the labelled test is scored once.`); process.exit(4); }
if (!existsSync(frozenPath)) { console.error('REFUSED: no rule.frozen.json; fit first.'); process.exit(4); }
const frozen = JSON.parse(readFileSync(frozenPath, 'utf8'));
const test = spec.items.filter(i => i.split === 'test');
const rowById = new Map(result.items.map(r => [r.id, r]));
const fitLabels = spec.items.filter(i => i.split === 'fit').map(i => JSON.stringify(i.labels![rule.target]));
const majority = JSON.parse([...fitLabels.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0][0]) as Label;

type Decided = { id: string; label: Label; pred: Label | null; auto: boolean; score?: number; confidence?: number; baseline: Label };
const decided: Decided[] = test.map(it => {
  const r = rowById.get(it.id), label = it.labels![rule.target], baseline = it.baseline![rule.target];
  if (!r?.answers) return { id: it.id, label, pred: null, auto: false, baseline };
  if (frozen.kind === 'binary') {
    const { w, b, t, lo, hi } = frozen._exact;
    const s = sigmoid(b + (frozen.features as string[]).reduce((acc, f, j) => acc + featureValue(r.answers!, f) * w[j], 0));
    return { id: it.id, label, pred: s >= t, auto: s < lo || s >= hi, score: r3(s), baseline };
  }
  const a = r.answers[rule.target] as Extract<Answer, { type: 'choice' }>;
  const conf = choiceConfidence(a.probabilities);
  return { id: it.id, label, pred: a.choice, auto: conf >= frozen._exact.cut, confidence: r3(conf), baseline };
});

const ok = (d: Decided) => d.pred !== null && JSON.stringify(d.pred) === JSON.stringify(d.label);
const bOk = (d: Decided) => JSON.stringify(d.baseline) === JSON.stringify(d.label);
const mOk = (d: Decided) => JSON.stringify(majority) === JSON.stringify(d.label);
const auto = decided.filter(d => d.auto);
const strata = [...new Set(decided.map(d => JSON.stringify(d.label)))].map(k => {
  const ds = decided.filter(d => JSON.stringify(d.label) === k);
  const p = paired(ds.map(ok), ds.map(bOk));
  return { label: JSON.parse(k), n: ds.length, jev: r3(p.accuracyA), baseline: r3(p.accuracyB), b: p.b, c: p.c, p: p.p };
});
const binaryCounts = frozen.kind === 'binary' ? (() => {
  const c = (f: (d: Decided) => boolean) => decided.filter(f).length;
  const P = (d: Decided) => d.label === true;
  return {
    jev: { tp: c(d => d.pred === true && P(d)), fp: c(d => d.pred === true && !P(d)), fn: c(d => d.pred !== true && P(d)), tn: c(d => d.pred !== true && !P(d)) },
    baseline: { tp: c(d => d.baseline === true && P(d)), fp: c(d => d.baseline === true && !P(d)), fn: c(d => d.baseline !== true && P(d)), tn: c(d => d.baseline !== true && !P(d)) },
  };
})() : undefined;

const forced = paired(decided.map(ok), decided.map(bOk));
const vsMajority = paired(decided.map(ok), decided.map(mOk));
const onAuto = auto.length ? paired(auto.map(ok), auto.map(bOk)) : null;
const out = {
  domain: spec.name, testResult: resultArg, model: result.model, answeredBy: result.answeredBy, n: decided.length,
  unanswered: decided.filter(d => d.pred === null).length, rule: Object.fromEntries(Object.entries(frozen).filter(([k]) => k !== '_exact')),
  baselineName: spec.baselineName, majority,
  forced: { what: 'every test item decided by the frozen rule; unanswered items count wrong', jevAccuracy: r3(forced.accuracyA), baselineAccuracy: r3(forced.accuracyB), majorityAccuracy: r3(vsMajority.accuracyB), vsBaseline: forced, vsMajority, counts: binaryCounts },
  gated: {
    what: 'act only outside the escalate band / above the confidence cut, frozen from the fit split',
    coverage: r3(auto.length / decided.length), autoN: auto.length, escalated: decided.length - auto.length,
    autoAccuracy: auto.length ? r3(auto.filter(ok).length / auto.length) : null,
    baselineOnSameItems: onAuto ? r3(onAuto.accuracyB) : null, vsBaselineOnSameItems: onAuto,
    allItemsEscalationsWrong: r3(auto.filter(ok).length / decided.length),
  },
  strata,
  items: decided,
  scoredAt: new Date().toISOString(),
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`${spec.name}: n=${out.n} · forced Jev ${pct(forced.accuracyA)} vs ${spec.baselineName ?? 'baseline'} ${pct(forced.accuracyB)} (b=${forced.b} c=${forced.c} p=${forced.p}) · majority ${pct(vsMajority.accuracyB)} (p=${vsMajority.p})`);
console.log(`gated: coverage ${pct(out.gated.coverage)} · auto accuracy ${out.gated.autoAccuracy === null ? '-' : pct(out.gated.autoAccuracy)} · baseline on same items ${out.gated.baselineOnSameItems === null ? '-' : pct(out.gated.baselineOnSameItems)}${onAuto ? ` (b=${onAuto.b} c=${onAuto.c} p=${onAuto.p})` : ''}`);
for (const s of strata) console.log(`  stratum ${JSON.stringify(s.label)}: n=${s.n} Jev ${pct(s.jev)} vs baseline ${pct(s.baseline)} (b=${s.b} c=${s.c} p=${s.p})`);
console.log(`→ ${outPath}`);
