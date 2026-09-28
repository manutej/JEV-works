/**
 * PIPELINE — the fused workflow, as one pure function over two kit result files (fit and test) with labels:
 *
 *   anchor checks  →  fit the cut  →  freeze  →  apply once  →  gates  →  route every test item  →  ledger
 *
 * It is the composition of what already existed in separate places, in the order the doctrine states
 * (jev-elder fusion/DECISION-CALIBRATION.md; fusion/WORKFLOW.md is the runbook):
 *
 *   1. anchor checks (arXiv:2609.26550 §6–7, QUALIFY Q3): error-detection AUROC of confidence against correctness on the
 *      fit split (program/stats.ts auc), and the low-confidence stratum listed for a LABEL audit before anything is fitted.
 *   2. fit (kit/threshold.ts fitSelective): the loosest accept cut whose 95% Clopper-Pearson upper bound on error among
 *      accepted fit items is ≤ the error budget declared for the action's effect class (kit/gate/route.ts Budget).
 *   3. freeze: the cut, the budget, the bootstrap stability and the pin (answeredBy) in one object the caller writes once.
 *   4. apply once (applyGate) to the test split; G4, G8, G9 (SKIP: a selective gate needs no calibration), suite verdict.
 *   5. route every test item (kit/gate/route.ts): accepted → the verdict Jev gave; not accepted → escalate; then the
 *      effect class, the envelope and the gate's provenance decide auto / review / block / escalate_human.
 *   6. one ledger line per item (GateLedgerEntry), with answeredBy, so every route can be re-qualified after drift.
 *
 * Confidence per primitive (colours, P14): noul → max(p, 1 − p) with the verdict p ≥ 0.5; choice → TypeSafe's documented
 * (k·peak − 1)/(k − 1) with the verdict "act on the pick". Score targets are refused: a level is not a probability.
 * An unanswered item is invalid: it counts as an error on the anchor and defers at routing (arXiv:2609.26550 checklist 3).
 *
 * Pure: no I/O, no model calls, no clock (the caller passes `now`). kit/gate/pipeline-cli.ts reads and writes the files.
 */
import type { Answer } from '../ask.ts';
import type { Label } from '../spec.ts';
import { applyGate, bootstrapCuts, fitSelective, type Gate, type GateOutcome } from '../threshold.ts';
import { g4Coverage, g8ThresholdFittedAndHeld, g9CalibrationAudited, suite, type SuiteReport } from '../standard-gate.ts';
import { auc } from '../../program/stats.ts';
import { ledgerEntry, route, type Budget, type EffectClass, type Envelope, type GateLedgerEntry, type GateProvenance } from './route.ts';
import type { Verdict } from './decide.ts';

export type ResultRow = { id: string; answers?: Record<string, Answer>; answeredBy?: string; error?: string };
export type ResultFile = { model?: string; answeredBy?: string[]; items: ResultRow[] };
export type MetaItem = { id: string; split: 'fit' | 'test'; labels?: Record<string, Label>; [k: string]: unknown };

export type PipelineConfig = {
  name: string;
  /** The one question the decision rides on (noul or choice). */
  target: string;
  effect: EffectClass;
  budgets: Budget[];
  envelope?: Envelope;
  /** Declared before the run (G4). Undeclared → WARN. */
  minCoverage?: number;
  /** Share of the fit split, lowest confidence first, listed for a label audit. Default 0.1. */
  auditShare?: number;
  /** Optional meta field whose values define strata for a per-stratum AUROC (e.g. "source"). */
  stratumField?: string;
};

export type Scored = { id: string; q: number | null; verdict: Verdict | null; correct: boolean | null; label: Label; answeredBy?: string; stratum?: string };

export type Frozen = {
  name: string; target: string; kind: 'noul' | 'choice';
  gate: Gate; unstable: boolean; bootstrap: ReturnType<typeof bootstrapCuts>;
  budget: Budget; effect: EffectClass; envelope: Envelope;
  fittedOn: { n: number; unanswered: number; accuracy: number; answeredBy: string[] };
  frozenAt: string;
};

export type Anchor = {
  n: number; unanswered: number; accuracy: number;
  /** AUROC of (1 − q) against "wrong": how well confidence orders the errors. NaN when one class is absent. */
  errorAuroc: number;
  perStratum?: Record<string, { n: number; accuracy: number; errorAuroc: number }>;
  /** The low-confidence stratum, for a label audit before fitting. */
  labelAudit: { id: string; q: number | null; verdict: Verdict | null; label: Label; correct: boolean | null }[];
  reading: string;
};

export type PipelineReport = {
  name: string; target: string; kind: 'noul' | 'choice';
  anchor: Anchor;
  frozen: Frozen;
  test: { n: number; coverage: number; outcome: GateOutcome; accuracyAll: number; accuracyAccepted: number; acceptedShare: number };
  gates: SuiteReport;
  routes: Record<string, number>;
  ledger: GateLedgerEntry[];
};

const same = (a: Label, b: Label) => JSON.stringify(a) === JSON.stringify(b);

/** TypeSafe's documented choice confidence, as in cookbooks/_shared/decide.ts. */
export function choiceConfidence(probs: Record<string, number>): number {
  const v = Object.values(probs), k = v.length;
  if (k < 2) return 1;
  return Math.max(0, Math.min(1, (k * Math.max(...v) - 1) / (k - 1)));
}

/** One item's confidence, verdict and correctness on the target question. Missing or wrong-typed answers are invalid. */
export function score(row: ResultRow | undefined, meta: MetaItem, target: string, stratumField?: string): Scored {
  const label = meta.labels?.[target];
  if (label === undefined) throw new Error(`${meta.id}: no label for ${target}`);
  const stratum = stratumField ? String(meta[stratumField]) : undefined;
  const a = row?.answers?.[target];
  const base = { id: meta.id, label, answeredBy: row?.answeredBy, stratum };
  if (!a) return { ...base, q: null, verdict: null, correct: null };
  if (a.type === 'noul') {
    if (typeof label !== 'boolean') throw new Error(`${meta.id}: ${target} is a noul but its label is not boolean`);
    const yes = a.p >= 0.5;
    return { ...base, q: Math.max(a.p, 1 - a.p), verdict: yes, correct: yes === label };
  }
  if (a.type === 'choice') return { ...base, q: choiceConfidence(a.probabilities), verdict: true, correct: same(a.choice, label) };
  throw new Error(`${meta.id}: ${target} is a score; a level is not a probability (P14), choose a noul or choice target`);
}

function kindOf(rows: readonly ResultRow[], target: string): 'noul' | 'choice' {
  const a = rows.find(r => r.answers?.[target])?.answers?.[target];
  if (!a) throw new Error(`no answered item carries ${target}`);
  if (a.type === 'score') throw new Error(`${target} is a score; a level is not a probability (P14)`);
  return a.type;
}

/** Error-detection AUROC: score 1 − q, positive = wrong. Invalid items count as wrong with q = 0 (maximally unsure). */
export function errorAuroc(xs: readonly Scored[]): number {
  if (xs.length < 2) return NaN;
  return auc(xs.map(x => 1 - (x.q ?? 0)), xs.map(x => x.correct !== true));
}

export function anchorChecks(fit: readonly Scored[], auditShare = 0.1, stratumField?: string): Anchor {
  const answered = fit.filter(x => x.q !== null);
  const accuracy = fit.filter(x => x.correct === true).length / (fit.length || 1);
  const a = errorAuroc(fit);
  const byQ = [...fit].sort((x, y) => (x.q ?? -1) - (y.q ?? -1));
  const labelAudit = byQ.slice(0, Math.max(1, Math.ceil(fit.length * auditShare))).map(({ id, q, verdict, label, correct }) => ({ id, q, verdict, label, correct }));
  let perStratum: Anchor['perStratum'];
  if (stratumField) {
    perStratum = {};
    for (const s of new Set(fit.map(x => x.stratum ?? '?'))) {
      const xs = fit.filter(x => (x.stratum ?? '?') === s);
      perStratum[s] = { n: xs.length, accuracy: xs.filter(x => x.correct === true).length / xs.length, errorAuroc: errorAuroc(xs) };
    }
  }
  const reading = Number.isNaN(a) ? 'AUROC undefined: the fit split has no errors or no correct items; the cut cannot be sized from it'
    : a < 0.6 ? `AUROC ${a.toFixed(3)} is near chance: confidence does not order the errors here; no threshold will help (arXiv:2609.26550 reference-free prose: 0.518). Envelope not-supported unless a larger anchor says otherwise`
    : a < 0.75 ? `AUROC ${a.toFixed(3)}: confidence orders errors weakly (arXiv:2609.26550 JudgeBench 0.745 needed 61% escalation at τ = 0.9). Expect low coverage`
    : `AUROC ${a.toFixed(3)}: confidence orders the errors (arXiv:2609.26550 in-envelope 0.86–0.92)`;
  return { n: fit.length, unanswered: fit.length - answered.length, accuracy, errorAuroc: a, perStratum, labelAudit, reading };
}

export function fitAndFreeze(fit: readonly Scored[], kind: 'noul' | 'choice', cfg: PipelineConfig, budget: Budget, now: Date): Frozen {
  // Accept side only: the cut says "accept Jev's verdict when q ≥ hi". Invalid items enter as q = 0, wrong.
  const q = fit.map(x => x.q ?? 0), y = fit.map(x => x.correct === true);
  const gate = fitSelective(q, y, budget.maxError);
  const bootstrap = bootstrapCuts(q, y, budget.maxError);
  return {
    name: cfg.name, target: cfg.target, kind,
    gate: { ...gate, lo: null }, unstable: bootstrap.unstable, bootstrap,
    budget, effect: cfg.effect, envelope: cfg.envelope ?? 'validate-first',
    fittedOn: { n: fit.length, unanswered: fit.filter(x => x.q === null).length, accuracy: y.filter(Boolean).length / (y.length || 1), answeredBy: [...new Set(fit.map(x => x.answeredBy).filter((s): s is string => !!s))] },
    frozenAt: now.toISOString(),
  };
}

/** Apply a frozen cut once to the test split, run the gates, route every item, write the ledger. */
export function applyAndRoute(test: readonly Scored[], frozen: Frozen, cfg: PipelineConfig, now: Date): Omit<PipelineReport, 'anchor' | 'name' | 'target' | 'kind' | 'frozen'> {
  const q = test.map(x => x.q ?? 0), y = test.map(x => x.correct === true);
  const outcome = applyGate(frozen.gate, q, y);
  const coverage = test.filter(x => x.q !== null).length / (test.length || 1);
  const prov: GateProvenance = { fittedOn: 'fit-split', gate: frozen.gate, outcome, unstable: frozen.unstable };
  const gates = suite([
    g4Coverage(coverage, cfg.minCoverage),
    g8ThresholdFittedAndHeld({ name: `${cfg.target} accept cut`, fittedOn: 'fit-split', gate: frozen.gate, outcome, unstable: frozen.unstable }),
    g9CalibrationAudited(undefined, false),
  ], { role: 'holdout' });
  const ledger: GateLedgerEntry[] = [];
  const routes: Record<string, number> = {};
  for (const x of test) {
    const accepted = x.q !== null && frozen.gate.hi !== null && x.q >= frozen.gate.hi;
    const verdict: Verdict = accepted && x.verdict !== null ? x.verdict : 'escalate';
    const routed = route(verdict, cfg.effect, prov, cfg.budgets, frozen.envelope);
    routes[routed.route] = (routes[routed.route] ?? 0) + 1;
    ledger.push(ledgerEntry({ stateId: x.id, answeredBy: x.answeredBy ?? 'unanswered', questions: [cfg.target], verdict, routed, effectClass: cfg.effect, budget: frozen.budget, prov, at: now }));
  }
  const accepted = test.filter(x => x.q !== null && frozen.gate.hi !== null && x.q >= frozen.gate.hi);
  return {
    test: {
      n: test.length, coverage, outcome,
      accuracyAll: y.filter(Boolean).length / (y.length || 1),
      accuracyAccepted: accepted.length ? accepted.filter(x => x.correct === true).length / accepted.length : NaN,
      acceptedShare: accepted.length / (test.length || 1),
    },
    gates, routes, ledger,
  };
}

/** The whole workflow on loaded data. Throws on a config that cannot be honoured (no budget for the class, a score target). */
export function pipeline(cfg: PipelineConfig, fitFile: ResultFile, testFile: ResultFile, meta: readonly MetaItem[], now = new Date()): PipelineReport {
  const budget = cfg.budgets.find(b => b.effect === cfg.effect.effect && b.blast === cfg.effect.blast);
  if (!budget) throw new Error(`no error budget declared for ${cfg.effect.effect} / ${cfg.effect.blast}: declare it before fitting (C1, G5); the human classes never get one`);
  const rowsFit = new Map(fitFile.items.map(r => [r.id, r])), rowsTest = new Map(testFile.items.map(r => [r.id, r]));
  const fitMeta = meta.filter(m => m.split === 'fit'), testMeta = meta.filter(m => m.split === 'test');
  if (!fitMeta.length || !testMeta.length) throw new Error('both a fit split and a test split are required (G3: declared before the run)');
  const overlap = fitMeta.filter(m => rowsTest.has(m.id)).length + testMeta.filter(m => rowsFit.has(m.id)).length;
  if (overlap) throw new Error(`${overlap} item id(s) appear in the wrong result file: fit and test must be disjoint (G3)`);
  const kind = kindOf(fitFile.items, cfg.target);
  const fit = fitMeta.map(m => score(rowsFit.get(m.id), m, cfg.target, cfg.stratumField));
  const test = testMeta.map(m => score(rowsTest.get(m.id), m, cfg.target, cfg.stratumField));
  const anchor = anchorChecks(fit, cfg.auditShare, cfg.stratumField);
  const frozen = fitAndFreeze(fit, kind, cfg, budget, now);
  return { name: cfg.name, target: cfg.target, kind, anchor, frozen, ...applyAndRoute(test, frozen, cfg, now) };
}

export function renderReport(r: PipelineReport): string {
  const pct = (x: number) => (Number.isNaN(x) ? 'n/a' : `${(x * 100).toFixed(1)}%`);
  const g = r.frozen.gate;
  const lines = [
    `${r.name} · target ${r.target} (${r.kind}) · ${r.frozen.effect.effect}/${r.frozen.effect.blast} · envelope ${r.frozen.envelope} · pin ${r.frozen.fittedOn.answeredBy.join(',') || '?'}`,
    `anchor (fit n=${r.anchor.n}, unanswered ${r.anchor.unanswered}): accuracy ${pct(r.anchor.accuracy)} · error-detection AUROC ${Number.isNaN(r.anchor.errorAuroc) ? 'n/a' : r.anchor.errorAuroc.toFixed(3)}`,
    `  ${r.anchor.reading}`,
    `  label audit: ${r.anchor.labelAudit.length} lowest-confidence fit items listed (audit their labels before trusting the cut)`,
    ...(r.anchor.perStratum ? Object.entries(r.anchor.perStratum).map(([s, v]) => `  stratum ${s}: n=${v.n} acc ${pct(v.accuracy)} AUROC ${Number.isNaN(v.errorAuroc) ? 'n/a' : v.errorAuroc.toFixed(3)}`) : []),
    `fit: budget ${pct(r.frozen.budget.maxError)} (${r.frozen.budget.why.slice(0, 60)}…) → accept when q ≥ ${g.hi === null ? 'never (no cut certifies the budget at this n)' : g.hi.toFixed(3)} · fit coverage ${pct(g.fit.acceptN / (g.fit.n || 1))} · bound ${pct(g.fit.acceptErrUpper)} · ${r.frozen.unstable ? 'UNSTABLE under resampling' : 'stable'}`,
    `test (n=${r.test.n}): coverage ${pct(r.test.coverage)} · accepted ${pct(r.test.acceptedShare)} at accuracy ${pct(r.test.accuracyAccepted)} (all items ${pct(r.test.accuracyAll)}) · held-out error among accepted ${pct(r.test.outcome.errorRate)} ≤ ${pct(r.frozen.budget.maxError)}? ${r.test.outcome.held ? 'held' : 'BROKEN'}`,
    `gates: ${r.gates.verdict}${r.gates.refusing.length ? ` (${r.gates.refusing.join(', ')})` : ''}${r.gates.warnings.length ? ` warn ${r.gates.warnings.join(', ')}` : ''}`,
    `routes: ${Object.entries(r.routes).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
  ];
  return lines.join('\n');
}
