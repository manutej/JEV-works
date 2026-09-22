/**
 * OC gate — scoring. Zero calls: reads program/results/oc-<slug>.json and writes
 *   .toq/<slug>/consist-report.yaml   (op-consist schema, aggregated over items)
 *   program/results/oc-summary.json   (every number OC-REPORT.md and oc-review.html cite)
 *
 * Declared before the run (this file is committed before oc-run.ts makes a call):
 *   · Equivalence: bool-exact after p ≥ 0.5 → true, per every tree's answer_space. Raw p is kept, never re-thresholded.
 *   · Item gate (skill §5): all four root answers equal → ACCEPT for that item, else REFUSE.
 *   · Edge disagreement: node Mi's edge group "L*-Mi" disagrees when Mi asked directly (collapse `mid`) ≠ Mi
 *     composed from its leaves (collapse `decomposed`); "M*-R" disagrees when R asked directly (`direct`) ≠ R
 *     composed from the directly asked Ms (`mid`). An L*-Mi disagreement is load-bearing when swapping the
 *     composed Mi into the mid set flips R. The failing edge of an inconsistent item is its deepest disagreeing
 *     edge that is load-bearing, else M*-R.
 *   · Tree verdict (a gate over items, not the skill's per-item 0.5 score): ACCEPT iff n ≥ 8 (I3), the all-four OC
 *     rate ≥ 0.90, and no edge group disagrees on more than 10% of items. Otherwise REFUSE. Chosen before the run,
 *     so that P4-sized jitter on near-threshold items (bool p95 ≤ 0.07) cannot by itself cause a REFUSE.
 *   · Correctness (labelled trees only): direct-answer accuracy on OC-consistent vs inconsistent items, Fisher exact
 *     two-sided plus a bootstrap 95% CI on the difference; direct vs decomposed accuracy, exact McNemar (I6).
 *   · Leaf/M pivots are attribution heuristics, labelled as such: a node is pivotal when flipping only its value
 *     makes the composed answer equal the direct one.
 *
 *   /opt/homebrew/bin/node program/oc-analyze.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { COLLAPSES, SLUGS, THRESHOLD, TOQ_DIR, compose, loadTree, verifyFrozen, type Collapse, type Slug, type Tree } from './oc-tree.ts';
import { resultPath, type ItemRec, type TreeResult } from './oc-run.ts';
import { quantile } from './stats.ts';

export const SUMMARY_PATH = new URL('./results/oc-summary.json', import.meta.url).pathname;
const OC_MIN = 0.9;
const EDGE_MAX = 0.1;
const MIN_N = 8;
/** P4: bool/score per-answer jitter p95 ≤ 0.07. A disagreement whose deciding p sits this close to 0.5 may be noise. */
const JITTER = 0.07;
const BOOT = 2000;
const ALPHA = 0.05;

const r4 = (x: number) => (Number.isFinite(x) ? +x.toFixed(4) : null);
const rate = (k: number, n: number) => (n ? r4(k / n) : null);

// ───────────────────────────────────────────────────────── stats

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const logFact = (k: number) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };

export function mcnemarExact(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const logChoose = (k: number) => logFact(n) - logFact(k) - logFact(n - k);
  let tail = 0;
  for (let k = 0; k <= Math.min(b, c); k++) tail += Math.exp(logChoose(k) - n * Math.LN2);
  return Math.min(1, 2 * tail);
}

/** Fisher exact, two-sided (sum of tables no more likely than the observed one). [[a,b],[c,d]]. */
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  const lp = (x: number) => logFact(r1) + logFact(r2) + logFact(c1) + logFact(n - c1) - logFact(n) - logFact(x) - logFact(r1 - x) - logFact(c1 - x) - logFact(r2 - c1 + x);
  const obs = lp(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const l = lp(x); if (l <= obs + 1e-9) p += Math.exp(l); }
  return Math.min(1, p);
}

/** Wilson 95% interval for k/n. */
function wilson(k: number, n: number): [number, number] | null {
  if (!n) return null;
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [r4(Math.max(0, c - h))!, r4(Math.min(1, c + h))!];
}

/** Bootstrap 95% CI of mean(x) − mean(y), resampling each group independently. */
function diffCI(x: readonly number[], y: readonly number[], seed = 7): [number, number] | null {
  if (!x.length || !y.length) return null;
  const rand = mulberry32(seed);
  const m = (xs: readonly number[]) => { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rand() * xs.length)]; return s / xs.length; };
  const ds: number[] = [];
  for (let k = 0; k < BOOT; k++) ds.push(m(x) - m(y));
  ds.sort((a, b) => a - b);
  return [r4(ds[Math.floor(0.025 * BOOT)])!, r4(ds[Math.floor(0.975 * BOOT)])!];
}

// ───────────────────────────────────────────────────────── per-item derivation

export type ItemView = {
  id: string;
  label: boolean | null;
  R: Record<Collapse, boolean>;
  consistent: boolean;
  /** Edge group → disagrees? ("L*-M1", …, "M*-R") */
  edges: Record<string, boolean>;
  loadBearing: Record<string, boolean>;
  failingEdges: string[];
  /** Deciding p for each disagreeing edge is within JITTER of 0.5. */
  nearThreshold: Record<string, boolean>;
  leafPivots: Record<string, string[]>;
  midPivots: string[];
};

const leafGroup = (m: string) => `L*-${m}`;

export function viewItem(t: Tree, it: ItemRec): ItemView | null {
  const a = it.answers;
  if (COLLAPSES.some(c => !a[c])) return null;
  const R = Object.fromEntries(COLLAPSES.map(c => [c, a[c]!.R])) as Record<Collapse, boolean>;
  const mid = a.mid!.M, dec = a.decomposed!.M;
  const pMid = it.calls.mid.p!, pDec = it.calls.decomposed.p!, pDir = it.calls.direct.p!;
  const leafBool = Object.fromEntries(Object.entries(pDec).map(([k, v]) => [k, v >= THRESHOLD]));
  const edges: Record<string, boolean> = {}, loadBearing: Record<string, boolean> = {}, nearThreshold: Record<string, boolean> = {};
  const leafPivots: Record<string, string[]> = {};
  const near = (p: number) => Math.abs(p - THRESHOLD) <= JITTER;
  for (const m of t.root.children) {
    const g = leafGroup(m.id);
    edges[g] = mid[m.id] !== dec[m.id];
    loadBearing[g] = edges[g] && compose(t.root.compose, { ...mid, [m.id]: dec[m.id] }) !== compose(t.root.compose, mid);
    if (edges[g]) {
      nearThreshold[g] = near(pMid[m.id]) || m.children.some(l => near(pDec[l.id]));
      leafPivots[g] = m.children.filter(l => compose(m.compose, { ...leafBool, [l.id]: !leafBool[l.id] }) === mid[m.id]).map(l => l.id);
    }
  }
  const fromMids = compose(t.root.compose, mid);
  edges['M*-R'] = R.direct !== fromMids;
  loadBearing['M*-R'] = edges['M*-R'];
  const midPivots = edges['M*-R'] ? t.root.children.filter(m => compose(t.root.compose, { ...mid, [m.id]: !mid[m.id] }) === R.direct).map(m => m.id) : [];
  if (edges['M*-R']) nearThreshold['M*-R'] = near(pDir.R) || t.root.children.some(m => near(pMid[m.id]));
  const consistent = COLLAPSES.every(c => R[c] === R.direct);
  let failingEdges: string[] = [];
  if (!consistent) {
    failingEdges = t.root.children.map(m => leafGroup(m.id)).filter(g => loadBearing[g]);
    // Jointly load-bearing (added after the run, see OC-REPORT.md): no single L*-Mi flips R, but all disagreeing ones together do.
    if (!failingEdges.length) {
      const dis = t.root.children.filter(m => edges[leafGroup(m.id)]);
      const swapped = { ...mid, ...Object.fromEntries(dis.map(m => [m.id, dec[m.id]])) };
      if (dis.length > 1 && compose(t.root.compose, swapped) !== fromMids) failingEdges = dis.map(m => leafGroup(m.id));
    }
    if (!failingEdges.length && edges['M*-R']) failingEdges = ['M*-R'];
    // Only the high-risk collapse differs: its M re-read in another batch crossed 0.5 (the P4/P31 replication).
    if (!failingEdges.length) failingEdges = ['highrisk-reread'];
  }
  return { id: it.id, label: it.label, R, consistent, edges, loadBearing, failingEdges, nearThreshold, leafPivots, midPivots };
}

// ───────────────────────────────────────────────────────── per-tree analysis

const PAIRS: [Collapse, Collapse][] = [['direct', 'mid'], ['direct', 'decomposed'], ['direct', 'highrisk'], ['mid', 'decomposed'], ['mid', 'highrisk'], ['decomposed', 'highrisk']];

export function analyzeTree(t: Tree, res: TreeResult) {
  const views = res.items.map(it => viewItem(t, it)).filter((v): v is ItemView => v !== null);
  const n = views.length;
  const failed = res.items.length - n;
  const ocK = views.filter(v => v.consistent).length;

  const pairwise = Object.fromEntries(PAIRS.map(([x, y]) => {
    const k = views.filter(v => v.R[x] === v.R[y]).length;
    return [`${x}~${y}`, { agree: k, n, rate: rate(k, n) }];
  }));

  const groups = [...t.root.children.map(m => leafGroup(m.id)), 'M*-R'];
  const edges = groups.map(g => {
    const dis = views.filter(v => v.edges[g]);
    const k = dis.length;
    const mId = g.startsWith('L*-') ? g.slice(3) : null;
    const pivots: Record<string, number> = {};
    for (const v of dis) for (const x of (mId ? v.leafPivots[g] : v.midPivots) ?? []) pivots[x] = (pivots[x] ?? 0) + 1;
    // Direction: for Ms, direct true & composed false ("M says yes, leaves say no") vs the reverse.
    return {
      edge: g,
      node: mId ?? 'R',
      disagree: k, n, rate: rate(k, n), ci95: wilson(k, n),
      loadBearing: dis.filter(v => v.loadBearing[g]).length,
      nearThreshold: dis.filter(v => v.nearThreshold[g]).length,
      pivots,
      highRisk: mId === t.highRiskMid,
    };
  }).sort((a, b) => b.disagree - a.disagree);

  const failCounts: Record<string, number> = {};
  for (const v of views) for (const e of v.failingEdges) failCounts[e] = (failCounts[e] ?? 0) + 1;

  // Replication: the high-risk M is asked in `mid` (beside its sibling Ms) and in `highrisk` (beside leaves).
  const h = t.highRiskMid;
  const reps = res.items.filter(it => it.calls.mid.p && it.calls.highrisk.p).map(it => ({ a: it.calls.mid.p![h], b: it.calls.highrisk.p![h] }));
  const dps = reps.map(r => Math.abs(r.a - r.b));
  const replication = {
    node: h, n: reps.length,
    medianAbsDp: r4(quantile(dps, 0.5)), p95AbsDp: r4(quantile(dps, 0.95)), maxAbsDp: r4(Math.max(...dps)),
    flips: reps.filter(r => (r.a >= THRESHOLD) !== (r.b >= THRESHOLD)).length,
    withinP4: dps.length ? r4(quantile(dps, 0.95)) !== null && quantile(dps, 0.95) <= JITTER : null,
  };

  // Correctness (only where labels exist).
  let correctness: Record<string, unknown> | null = null;
  const lab = views.filter(v => v.label !== null);
  if (lab.length) {
    const right = (v: ItemView, c: Collapse) => (v.R[c] === v.label ? 1 : 0);
    const acc = Object.fromEntries(COLLAPSES.map(c => [c, rate(lab.reduce((s, v) => s + right(v, c), 0), lab.length)]));
    const cons = lab.filter(v => v.consistent).map(v => right(v, 'direct'));
    const inc = lab.filter(v => !v.consistent).map(v => right(v, 'direct'));
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    const fisherP = fisherExact(sum(cons), cons.length - sum(cons), sum(inc), inc.length - sum(inc));
    const mc = (x: Collapse, y: Collapse) => {
      let b = 0, c = 0;
      for (const v of lab) { const rx = right(v, x), ry = right(v, y); if (rx && !ry) b++; if (!rx && ry) c++; }
      const p = mcnemarExact(b, c);
      return { [`${x}_only_right`]: b, [`${y}_only_right`]: c, p: +p.toPrecision(3), significant: p < ALPHA, winner: p >= ALPHA ? 'no significant difference' : b > c ? x : y };
    };
    correctness = {
      n: lab.length,
      positives: lab.filter(v => v.label).length,
      accuracy: acc,
      majorityBaseline: rate(Math.max(lab.filter(v => v.label).length, lab.filter(v => !v.label).length), lab.length),
      directOnConsistent: { n: cons.length, right: sum(cons), acc: rate(sum(cons), cons.length) },
      directOnInconsistent: { n: inc.length, right: sum(inc), acc: rate(sum(inc), inc.length) },
      fisher: { p: +fisherP.toPrecision(3), significant: fisherP < ALPHA },
      bootstrapDiffCI95: diffCI(cons, inc),
      mcnemarDirectVsDecomposed: mc('direct', 'decomposed'),
      mcnemarDirectVsMid: mc('direct', 'mid'),
      mcnemarDirectVsHighrisk: mc('direct', 'highrisk'),
    };
  }

  const pairRates = Object.values(pairwise).map(p => p.rate ?? 0);
  const ocRate = rate(ocK, n);
  const worstEdge = edges[0];
  const verdict = n >= MIN_N && (ocRate ?? 0) >= OC_MIN && edges.every(e => (e.rate ?? 0) <= EDGE_MAX) ? 'ACCEPT' : 'REFUSE';
  const reasons: string[] = [];
  if (n < MIN_N) reasons.push(`n ${n} < ${MIN_N}`);
  if ((ocRate ?? 0) < OC_MIN) reasons.push(`OC rate ${ocRate} < ${OC_MIN}`);
  for (const e of edges) if ((e.rate ?? 0) > EDGE_MAX) reasons.push(`${e.edge} disagrees on ${e.rate} > ${EDGE_MAX}`);

  return {
    slug: t.slug, toqSha256: t.sha256, JEV_ID: res.JEV_ID, answeredBy: [...new Set(res.items.flatMap(it => COLLAPSES.map(c => it.calls[c].answeredBy)).filter(Boolean))],
    calls: res.callsUsed, items: res.items.length, scored: n, failedItems: failed,
    ocRate, ocConsistent: ocK, ocCI95: wilson(ocK, n), oc_signal: r4(Math.min(...pairRates)),
    pairwise, edges, worstEdge: worstEdge?.edge, failingEdgeCounts: failCounts, replication, correctness,
    itemGate: { ACCEPT: ocK, REFUSE: n - ocK },
    verdict, verdictReasons: reasons,
    views,
  };
}

// ───────────────────────────────────────────────────────── YAML (skill schema, aggregated)

const q = (s: string) => JSON.stringify(s);

function yamlReport(t: Tree, res: TreeResult, a: ReturnType<typeof analyzeTree>): string {
  const ids = res.items.flatMap(it => COLLAPSES.map(c => it.calls[c].context_id)).filter((x): x is string => !!x).sort();
  const idsHash = createHash('sha256').update(ids.join('\n')).digest('hex');
  const evals = COLLAPSES.map(c => {
    const cids = res.items.map(it => it.calls[c].context_id).filter(Boolean);
    const ce = res.collapses[c].collapsed_edges;
    return `  - {id: ${c}, collapsed_edges: ${ce === 'all' ? 'all' : `[${ce.join(', ')}]`}, asked: [${res.collapses[c].asked.join(', ')}],\n` +
      `     context_id: per-item, context_ids_n: ${cids.length}, first_context_id: ${cids[0]},\n` +
      `     output_ref: "program/results/oc-${t.slug}.json#items[*].calls.${c}", cost: {calls: ${res.items.length}}}`;
  });
  const comps = Object.entries(a.pairwise).map(([k, v]) => {
    const [x, y] = k.split('~');
    // Per item the skill scores a pair 1/0; aggregated, a pair "agrees" at the declared tree bar OC_MIN, not at 0.5.
    return `  - {a: ${x}, b: ${y}, equivalence: bool, score: ${v.rate}, verdict: ${(v.rate ?? 0) >= OC_MIN ? 'agree' : 'disagree'},\n` +
      `     evidence: ${q(`root bool (p >= ${THRESHOLD}) equal on ${v.agree}/${v.n} items; per-item values in oc-${t.slug}.json`)}}`;
  });
  const edgeLines = a.edges.map(e => `  - {edge: ${q(e.edge)}, disagree: ${e.disagree}, n: ${e.n}, rate: ${e.rate}, ci95: [${e.ci95?.join(', ')}], load_bearing: ${e.loadBearing}, near_threshold_p4: ${e.nearThreshold}, pivots: ${JSON.stringify(e.pivots)}${e.highRisk ? ', declared_high_risk: true' : ''}}`);
  const c = a.correctness as any;
  return [
    `# op-consist report, aggregated over ${a.scored} items. Generated by program/oc-analyze.ts from program/results/oc-${t.slug}.json.`,
    `# toq.yaml status was NOT flipped to "gated": the tree is frozen (.toq/FROZEN.sha256). This file is the gate record.`,
    `report_version: 1`,
    `toq: .toq/${t.slug}/toq.yaml`,
    `toq_sha256: ${t.sha256}`,
    `agent: ${q(res.JEV_ID)}   # answered_by: ${a.answeredBy.join(', ')}`,
    `tier: deep   # named: [direct, mid, decomposed, highrisk], k = 4, one fresh stateless call each`,
    `items: {n: ${a.items}, scored: ${a.scored}, failed: ${a.failedItems}}`,
    `context_ids: {count: ${ids.length}, sha256_of_sorted: ${idsHash}, per_item: program/results/oc-${t.slug}.json}`,
    `evaluations:`, ...evals,
    `comparisons:`, ...comps,
    `oc_rate_all_four: ${a.ocRate}   # items where all 4 root answers agree, ci95 [${a.ocCI95?.join(', ')}]`,
    `oc_signal: ${a.oc_signal}   # min over pairwise agreement rates`,
    `item_gate: {ACCEPT: ${a.itemGate.ACCEPT}, REFUSE: ${a.itemGate.REFUSE}}`,
    `verdict: ${a.verdict}   # tree rule, declared before the run: OC rate >= ${OC_MIN} and every edge group <= ${EDGE_MAX}`,
    `verdict_reasons: [${a.verdictReasons.map(q).join(', ')}]`,
    `failing_edges: [${a.verdict === 'REFUSE' ? a.edges.filter(e => (e.rate ?? 0) > EDGE_MAX).map(e => q(e.edge)).join(', ') : ''}]   # ranked; worst first`,
    `failing_edge_counts: ${JSON.stringify(a.failingEdgeCounts)}   # per inconsistent item: deepest load-bearing disagreeing edge`,
    `edges:`, ...edgeLines,
    `replication: ${JSON.stringify(a.replication)}   # high-risk M asked in two different batches`,
    c ? `correctness: {n: ${c.n}, direct_acc: ${c.accuracy.direct}, decomposed_acc: ${c.accuracy.decomposed}, mid_acc: ${c.accuracy.mid}, highrisk_acc: ${c.accuracy.highrisk}, majority: ${c.majorityBaseline}, direct_acc_consistent: ${c.directOnConsistent.acc}, direct_acc_inconsistent: ${c.directOnInconsistent.acc}, fisher_p: ${c.fisher.p}, mcnemar_direct_vs_decomposed: ${JSON.stringify(c.mcnemarDirectVsDecomposed)}}` : `correctness: null   # label-free tree`,
    `triage: ${a.verdict === 'REFUSE' ? 'edge-localized   # tree audit + proposed rewordings in program/OC-REPORT.md; not re-run (a reworded tree is a new frozen tree)' : 'null'}`,
    `override: null`,
    `cost_total: {evaluations: ${a.items * COLLAPSES.length}, calls: ${a.calls}}`,
    '',
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyFrozen();
  const summary: Record<string, unknown> = {};
  for (const slug of SLUGS) {
    const t = loadTree(slug);
    const res: TreeResult = JSON.parse(readFileSync(resultPath(slug), 'utf8'));
    if (res.toqSha256 !== t.sha256) throw new Error(`${slug}: result was produced from a different tree`);
    const a = analyzeTree(t, res);
    writeFileSync(`${TOQ_DIR}${slug}/consist-report.yaml`, yamlReport(t, res, a));
    summary[slug] = a;
    const c = a.correctness as any;
    console.log(`\n== ${slug}  n ${a.scored}/${a.items}  calls ${a.calls}  OC ${a.ocRate} [${a.ocCI95}]  oc_signal ${a.oc_signal}  → ${a.verdict} ${a.verdictReasons.join('; ')}`);
    console.log(`   pairwise ${Object.entries(a.pairwise).map(([k, v]) => `${k} ${v.rate}`).join('  ')}`);
    for (const e of a.edges) console.log(`   edge ${e.edge.padEnd(7)} ${e.disagree}/${e.n} = ${e.rate} [${e.ci95}]  load-bearing ${e.loadBearing}  near-0.5 ${e.nearThreshold}  pivots ${JSON.stringify(e.pivots)}${e.highRisk ? '  (declared high-risk)' : ''}`);
    console.log(`   failing edges ${JSON.stringify(a.failingEdgeCounts)}  replication ${JSON.stringify(a.replication)}`);
    if (c) {
      console.log(`   acc ${JSON.stringify(c.accuracy)} majority ${c.majorityBaseline}  direct|consistent ${c.directOnConsistent.right}/${c.directOnConsistent.n}  direct|inconsistent ${c.directOnInconsistent.right}/${c.directOnInconsistent.n}  Fisher p ${c.fisher.p}  diff CI ${c.bootstrapDiffCI95}`);
      console.log(`   McNemar direct vs decomposed ${JSON.stringify(c.mcnemarDirectVsDecomposed)}`);
    }
  }
  writeFileSync(SUMMARY_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), ocMin: OC_MIN, edgeMax: EDGE_MAX, jitterBand: JITTER, trees: summary }, null, 1));
  console.log(`\nsummary → ${SUMMARY_PATH}`);
}
