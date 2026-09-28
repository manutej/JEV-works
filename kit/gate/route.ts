/**
 * ROUTE — from a verdict to a route, under the action's effect class and the gate that produced the verdict.
 *
 * Two disciplines had been living in different repos:
 *   - HermeticOrmus/jev-decision-gate (7be68ad) routes `auto | review | block | escalate_human` from confidence plus a
 *     policy, keeps "questions + thresholds in one reviewable policy", and sends irreversible side effects to a human
 *     "unless a pre-agreed high-confidence policy says otherwise" (hub README, three-lanes.md).
 *   - kit/threshold.ts + G8 (kit/standard-gate.ts): a threshold counts only if it was fitted on the fit split and its
 *     promised error bound held on held-out data; a hand-set cut is refused.
 *
 * This file is where they meet. The rule it encodes:
 *
 *   `auto` is a claim — "this decision is wrong at most maxError of the time" — and a claim needs a fitted, held gate
 *   behind it (G8) whose bound is no looser than the error budget the owner declared for this class of action BEFORE
 *   any data (Ormus C1: a ceiling before spending; G5: declared before the holdout). A hand-set cut can send an item
 *   to review or block; it can never send it to auto, except for an advisory effect, where being wrong costs nothing
 *   irreversible and the route is still marked. An irreversible or high-blast action never routes to auto whatever
 *   the number: it parks for a human (Ormus A4; jev-tape C10; jev-elder C10).
 *
 * Pure: no I/O, no model calls. kit/gate/decide.ts produces the verdict; this file says what may be done with it.
 */
import type { Verdict } from './decide.ts';
import type { Gate, GateOutcome } from '../threshold.ts';

/** Ormus A4: classify every terminal action on reversibility × blast radius. Per action, never per task. */
export type Effect = 'advisory' | 'reversible' | 'irreversible';
export type Blast = 'low' | 'high';
export type EffectClass = { effect: Effect; blast: Blast };

/** The four Ormus routes. Other repos spell them differently; the synonyms are documented, not coded (jev-elder fusion/DECISION-CALIBRATION.md). */
export type Route = 'auto' | 'review' | 'block' | 'escalate_human';

/**
 * The error an owner will live with among auto-decided items of one effect class. Chosen, not derived — so `why` is
 * required and the budget is printed next to the route (Ormus B3, tension 5). Declared before any data (G5).
 */
export type Budget = { effect: Effect; blast: Blast; maxError: number; why: string };

/** Where the cut that produced the verdict came from. Mirrors g8ThresholdFittedAndHeld's input. */
export type GateProvenance =
  | { fittedOn: 'hand-set'; note?: string }
  | { fittedOn: 'fit-split'; gate: Gate; outcome?: GateOutcome; unstable?: boolean };

/** Stable reason codes for a route that is not the verdict's face value. Route codes, not gate codes: they are not in REASON_CODES. */
export const ROUTE_CODES = [
  'route.irreversible', 'route.high-blast',
  'route.hand-set', 'route.bound-broken', 'route.not-applied', 'route.unstable',
  'route.budget-undeclared', 'route.budget-exceeded',
] as const;
export type RouteCode = (typeof ROUTE_CODES)[number];

export type Routed = {
  route: Route;
  /** The route the verdict alone would have given; differs from `route` when a rule intervened. */
  faceValue: Route;
  why: string;
  /** The rule that changed or qualified the route. Absent when the face value stands unqualified. */
  code?: RouteCode;
  /** Codes that did not change the route but must travel with it (e.g. an unstable cut behind an auto). */
  warnings: RouteCode[];
};

/** Verdict → route, before any class or provenance rule. */
export function faceValue(v: Verdict): Route {
  return v === true ? 'auto' : v === false ? 'block' : 'review';
}

const r = (route: Route, faceValueRoute: Route, why: string, code?: RouteCode, warnings: RouteCode[] = []): Routed =>
  ({ route, faceValue: faceValueRoute, why, ...(code ? { code } : {}), warnings });

/**
 * Decide the route for one item.
 *
 * Order of rules (the first that applies decides; later ones only add warnings):
 *   1. irreversible effect or high blast: true/escalate → escalate_human, false → block. Nothing here is automated.
 *   2. verdict false → block; verdict escalate → review. Neither claims an error rate, so neither needs a gate.
 *   3. verdict true, advisory effect → auto; a hand-set or unheld cut is a warning, not a demotion (Ormus tension 1).
 *   4. verdict true, reversible + low blast → auto only if: a budget is declared for the class, the cut was fitted on
 *      the fit split, its bound held on held-out data, and that bound is ≤ the budget. Otherwise review, with the
 *      code naming what is missing. An unstable cut (bootstrapCuts) routes auto with a warning, as G8 warns.
 */
export function route(verdict: Verdict, cls: EffectClass, prov: GateProvenance, budgets: readonly Budget[] = []): Routed {
  const fv = faceValue(verdict);
  if (cls.effect === 'irreversible' || cls.blast === 'high') {
    const code: RouteCode = cls.effect === 'irreversible' ? 'route.irreversible' : 'route.high-blast';
    if (verdict === false) return r('block', fv, `${describe(cls)}: verdict false, nothing happens; a human may still reopen it`, code);
    return r('escalate_human', fv, `${describe(cls)}: a human stands at this boundary whatever the number (A4, C10)`, code);
  }
  if (verdict === false) return r('block', fv, 'verdict false: not doing the action claims no error rate');
  if (verdict === 'escalate') return r('review', fv, 'verdict escalate: the middle goes to review');

  // verdict === true from here on
  if (cls.effect === 'advisory') {
    if (prov.fittedOn === 'hand-set') return r('auto', fv, 'advisory effect on a hand-set cut: allowed, marked (being wrong costs nothing irreversible)', undefined, ['route.hand-set']);
    if (!prov.outcome) return r('auto', fv, 'advisory effect on a fitted cut never applied to held-out data: allowed, marked', undefined, ['route.not-applied']);
    if (!prov.outcome.held) return r('auto', fv, 'advisory effect on a cut whose bound broke on held-out data: allowed, marked', undefined, ['route.bound-broken']);
    return r('auto', fv, 'advisory effect on a fitted, held cut', undefined, prov.unstable ? ['route.unstable'] : []);
  }

  // reversible + low blast: the only class where the machine may commit, and only on a claim it can back.
  const budget = budgets.find(b => b.effect === cls.effect && b.blast === cls.blast);
  if (!budget) return r('review', fv, `${describe(cls)}: no error budget declared for this class; declare it before any item is auto-decided (C1, G5)`, 'route.budget-undeclared');
  if (prov.fittedOn === 'hand-set') return r('review', fv, `${describe(cls)}: the cut is hand-set; auto needs a cut fitted on the fit split (G8.hand-set)`, 'route.hand-set');
  if (!prov.outcome) return r('review', fv, `${describe(cls)}: the fitted cut was never applied to held-out data; auto needs the bound to have held (G8)`, 'route.not-applied');
  if (!prov.outcome.held) return r('review', fv, `${describe(cls)}: held-out error ${pct(prov.outcome.errorRate)} broke the promised ${pct(prov.gate.maxError)} (G8.bound-broken)`, 'route.bound-broken');
  if (prov.gate.maxError > budget.maxError + 1e-12) return r('review', fv, `${describe(cls)}: the cut certifies error ≤ ${pct(prov.gate.maxError)}, looser than the class budget ${pct(budget.maxError)} (${budget.why})`, 'route.budget-exceeded');
  return r('auto', fv, `${describe(cls)}: fitted cut, bound held at ${pct(prov.outcome.errorRate)} ≤ budget ${pct(budget.maxError)}${prov.unstable ? '; cut unstable under resampling' : ''}`, undefined, prov.unstable ? ['route.unstable'] : []);
}

const describe = (c: EffectClass) => `${c.effect} effect, ${c.blast} blast`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Validate a budgets file: every row typed, maxError in (0, 1), `why` present, one row per class. All errors at once. */
export function checkBudgets(x: unknown, at = 'budgets'): { value?: Budget[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(x)) return { errors: [`${at}: must be an array of {effect, blast, maxError, why}`] };
  const seen = new Set<string>();
  const out: Budget[] = [];
  x.forEach((b: any, i) => {
    const p = `${at}[${i}]`;
    if (!b || typeof b !== 'object') { errors.push(`${p}: must be an object`); return; }
    if (!['advisory', 'reversible', 'irreversible'].includes(b.effect)) errors.push(`${p}.effect: advisory | reversible | irreversible`);
    if (!['low', 'high'].includes(b.blast)) errors.push(`${p}.blast: low | high`);
    if (!(typeof b.maxError === 'number' && b.maxError > 0 && b.maxError < 1)) errors.push(`${p}.maxError: a number in (0, 1)`);
    if (!(typeof b.why === 'string' && b.why.trim())) errors.push(`${p}.why: say why this budget was chosen (it is chosen, not derived)`);
    if (b.effect === 'irreversible' || b.blast === 'high') errors.push(`${p}: no budget can buy an auto route for ${b.effect} effect / ${b.blast} blast; that class parks for a human`);
    const k = `${b.effect}/${b.blast}`;
    if (seen.has(k)) errors.push(`${p}: a second budget for ${k}`); seen.add(k);
    if (!errors.some(e => e.startsWith(p))) out.push({ effect: b.effect, blast: b.blast, maxError: b.maxError, why: b.why });
  });
  return errors.length ? { errors } : { value: out, errors };
}

/**
 * One line of the gate ledger (Ormus: "prefer a dated ledger of gate decisions over chat-only magic"; jev-tape:
 * Temporal Event History; jev-elder C11: log always). The full batch travels, not only the route.
 */
export type GateLedgerEntry = {
  at: string;
  stateId: string;
  /** The model that answered, verbatim (L36). A ledger line without it cannot be re-qualified after drift. */
  answeredBy: string;
  questions: string[];
  verdict: Verdict;
  routed: Routed;
  effectClass: EffectClass;
  budget?: Budget;
  gate: { fittedOn: GateProvenance['fittedOn']; hi?: number | null; lo?: number | null; maxError?: number; held?: boolean };
};

/** Build the ledger line; refuses to build one that could not be re-qualified later. */
export function ledgerEntry(x: Omit<GateLedgerEntry, 'at' | 'gate'> & { prov: GateProvenance; at?: Date }): GateLedgerEntry {
  if (!x.answeredBy.trim()) throw new Error('ledgerEntry: answeredBy is required (L36: record the model that answered)');
  if (!x.stateId.trim()) throw new Error('ledgerEntry: stateId is required (Ormus batch checklist: all questions share one snapshot id)');
  if (!x.questions.length) throw new Error('ledgerEntry: at least one question');
  const gate = x.prov.fittedOn === 'hand-set'
    ? { fittedOn: 'hand-set' as const }
    : { fittedOn: 'fit-split' as const, hi: x.prov.gate.hi, lo: x.prov.gate.lo, maxError: x.prov.gate.maxError, held: x.prov.outcome?.held };
  const { prov: _p, at, ...rest } = x;
  return { at: (at ?? new Date()).toISOString(), ...rest, gate };
}
