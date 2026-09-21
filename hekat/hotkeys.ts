/**
 * HEKAT hotkeys, given declared output and input colours.
 *
 * WHY THIS IS NOT A STRAIGHT MAPPING ONTO `colors.ts`
 *
 * `question-bank/colors.ts` types *judgements*: a `Prob` is P(true), a `Key` is a
 * selected option, a `Level` is a rubric position. HEKAT hotkeys mostly do not
 * produce judgements — `[R] Research` produces findings, `[B] Build` produces
 * code. Coercing those into `Prob` would assert a commensurability that does not
 * exist, which is the exact class of error `colors.ts` was written to catch
 * (L17: a rubric level divided into a probability).
 *
 * So there are two disjoint colour families here, and one genuine bridge:
 *
 *   ARTIFACT colours  — what most hotkeys emit. Opaque to the decision algebra.
 *   DECISION colours  — re-exported from colors.ts. What a judgement emits.
 *   THE BRIDGE        — `[V] Verify`, `[C] Code-review` and `[T] Test` emit
 *                       judgements, so their outputs ARE decision-coloured. Those
 *                       three are exactly the hotkeys a typed-decision call could
 *                       substitute for an agent, and the only ones where
 *                       `checkComposition` has anything to say.
 *
 * Everything below is a declaration, not a discovery. HEKAT's own docs define no
 * types for its hotkeys (`hekat.md` is a prompt template; its TIER 2–4 features
 * are marked unbuilt), so these signatures are proposed, and are marked as such.
 * They are the smallest thing that makes `[R→D→I]` checkable instead of free text.
 */
import type { Color } from '../question-bank/colors.ts';

/** What a hotkey emits when it is not emitting a judgement. */
export type ArtifactColor =
  | 'Query'      // the user's request; the implicit input to every chain
  | 'Findings'   // gathered evidence, unsynthesised
  | 'Spec'       // a design or plan
  | 'Code'       // source that could run
  | 'Report'     // synthesised prose for a human
  | 'Plan';      // an ordering of other operations

/** A hotkey's output is either an artifact or a judgement. */
export type OutColor = { kind: 'artifact'; color: ArtifactColor } | { kind: 'decision'; color: Color };

export const artifact = (color: ArtifactColor): OutColor => ({ kind: 'artifact', color });
export const decision = (color: Color): OutColor => ({ kind: 'decision', color });

export type HotkeySpec = {
  key: string;
  name: string;
  /** What it emits. */
  produces: OutColor;
  /**
   * What it can consume. `[]` means it needs no prior output — a chain may start
   * with it. Artifact names and decision colours may both appear.
   */
  accepts: Array<ArtifactColor | Color>;
  /** True when this is a combinator over other hotkeys, not an operation. */
  combinator?: boolean;
  /**
   * Set when a typed-decision model could plausibly replace the agent, with the
   * question shape it would use. Only meaningful for judgement-producing keys.
   */
  jevSubstitutable?: string;
};

/**
 * The twelve TIER-1 hotkeys, verbatim from `~/.claude/commands/hekat.md`:
 *   [R] Research  [D] Design  [T] Test  [B] Build  [F] Frontend  [I] Implement
 *   [O] Orchestrate  [S] Synthesize  [C] Code-review  [P] Parallel  [V] Verify  [A] Analyze
 */
export const HOTKEYS: Record<string, HotkeySpec> = {
  R: { key: 'R', name: 'Research', produces: artifact('Findings'), accepts: ['Query'] },
  A: { key: 'A', name: 'Analyze', produces: artifact('Report'), accepts: ['Query', 'Findings', 'Code', 'Report'] },
  S: { key: 'S', name: 'Synthesize', produces: artifact('Report'), accepts: ['Findings', 'Report'] },
  D: { key: 'D', name: 'Design', produces: artifact('Spec'), accepts: ['Query', 'Findings', 'Report'] },
  I: { key: 'I', name: 'Implement', produces: artifact('Code'), accepts: ['Spec'] },
  B: { key: 'B', name: 'Build', produces: artifact('Code'), accepts: ['Spec', 'Code'] },
  F: { key: 'F', name: 'Frontend', produces: artifact('Code'), accepts: ['Spec', 'Code'] },
  O: { key: 'O', name: 'Orchestrate', produces: artifact('Plan'), accepts: ['Spec', 'Report'], combinator: true },
  P: { key: 'P', name: 'Parallel', produces: artifact('Plan'), accepts: ['Query'], combinator: true },

  // ── the bridge: these three emit judgements, so they are decision-coloured ──
  T: {
    key: 'T',
    name: 'Test',
    produces: decision('Prob'),
    accepts: ['Code'],
    jevSubstitutable:
      'boolean per assertion — but only where the judgement is readable from the code alone. ' +
      'Running a test suite is code, not a judgement; predicting whether it will pass is a judgement ' +
      'and a much weaker one.',
  },
  V: {
    key: 'V',
    name: 'Verify',
    produces: decision('Prob'),
    accepts: ['Code', 'Spec', 'Report', 'Findings'],
    jevSubstitutable:
      'boolean per named criterion, recombined in code. This is the strongest substitution ' +
      'candidate: literal, single-state, one claim at a time.',
  },
  C: {
    key: 'C',
    name: 'Code-review',
    produces: decision('Level'),
    accepts: ['Code'],
    jevSubstitutable:
      'score over named severity levels, plus booleans per rule. Note the measured constraint: ' +
      'a Level may be thresholded, never divided into a Prob (colors.ts FORBIDDEN_COERCIONS).',
  },
};

/** The three hotkeys whose outputs enter the decision algebra at all. */
export const JUDGEMENT_KEYS = Object.values(HOTKEYS)
  .filter(h => h.produces.kind === 'decision')
  .map(h => h.key);

/**
 * L1–L7 is deliberately NOT modelled here.
 *
 * The corpus carries three mutually incompatible definitions of the same labels:
 *   · `~/.claude/commands/hekat.md` — token-budget and agent-count bands
 *     ("L1: Ultra-Fast (600-1200 tokens), 1 agent" … "L7: Full Ensemble, 7+ agents")
 *   · `JUPITER/docs/HEKAT-INTEGRATION.md` — industry × function combinatorics, routed
 *     by `detectHekatLevel()` on `industries.length` / `functions.length`, no token budget
 *   · `cc2.0/docs/theory/L7-HEKAT-SPECIFICATION-QUERY.md` — declares itself L7 with no
 *     tier definition at all; L7 there means "hard, use the big ensemble"
 *
 * Three formulas, one label. Picking one is a product decision and not mine to make,
 * and encoding a guess would give the tier a type it has not earned. Until one is
 * declared canonical, tiers stay out of the type system.
 */
export const TIER_DEFINITIONS_CONFLICT = {
  hekatMd: 'token budget + agent count',
  jupiterIntegration: 'industries × functions × abstraction flag',
  l7Spec: 'undefined; asserted per-document',
} as const;
