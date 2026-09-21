/**
 * COLORS — the composition algebra for typed-decision answers.
 *
 * A question set plus its recombination rule is an operad: the questions are
 * operations, the recombination composes them. And it is a COLOURED operad —
 * every slot carries a colour, and composition is only defined when the colours
 * match. Coercing one colour into another is legal only where the coercion is
 * licensed by what the value actually means.
 *
 * This is not decoration. It caught a real defect in `triage/triage.ts`:
 *
 *     W.density * (densityScore / 3)      // ← colour violation
 *
 * That divides a Level<4> by 3 to make it commensurate with a Prob so it can be
 * summed into a weighted score. But NETER.md P14 is explicit — score levels are
 * only weakly numerically calibrated, and magnitudes must not be interpolated.
 * The division asserts that the distance from level 1 to 2 equals the distance
 * from 2 to 3, and equals 1/3 of a probability. None of that is licensed. The
 * value is ORDINAL: it can be compared and thresholded, never scaled and added.
 *
 * The three colours, and what each one is:
 *
 *   Prob      a boolean answer. A number in [0,1] meaning P(true). NOT a
 *             confidence — P(true)=0.5 means genuinely torn, not "unsure".
 *   Key<K>    the selected option of a choice over option set K. A LABEL. It has
 *             no magnitude at all; it selects, it cannot be added to anything.
 *   Dist<K>   the distribution over K that accompanies a Key. Optional in the
 *             spec — present from native providers, absent from LLM adapters.
 *   Level<L>  a score answer over L ordered levels. Fractional in [0, L-1], and
 *             ORDINAL: comparable, not scalable.
 *
 * Derived colours — values computed FROM an answer, in code, losslessly:
 *
 *   Entropy   from Dist<K>. A real number in [0,1] once normalised. This is the
 *             measured-good uncertainty signal (P6): it separated garbage from
 *             clean input with a ~6x margin where top-probability failed.
 *   Ordinal   from Level<L>. The result of a comparison — a Prob-free boolean.
 */

// ─────────────────────────────────────────────────────────── the colours

export type Prob = number & { readonly __color?: 'Prob' };
export type Level = number & { readonly __color?: 'Level' };
export type Entropy = number & { readonly __color?: 'Entropy' };

export type Color = 'Prob' | 'Key' | 'Dist' | 'Level' | 'Entropy' | 'Ordinal';

export const OUTPUT_COLOR: Record<'boolean' | 'choice' | 'score', Color[]> = {
  boolean: ['Prob'],
  choice: ['Key', 'Dist'],
  score: ['Level', 'Dist'],
};

/**
 * Which coercions are legal, and why. Anything absent from this table is a
 * composition error even when TypeScript accepts it, because every colour here
 * is structurally a number.
 */
export const LICENSED_COERCIONS: Array<{ from: Color; to: Color; because: string }> = [
  {
    from: 'Dist',
    to: 'Entropy',
    because:
      'Lossless and well-defined: entropy is a function of the whole distribution. The measured ' +
      'uncertainty signal (P6).',
  },
  {
    from: 'Level',
    to: 'Ordinal',
    because:
      'Levels are ordered, so comparison is meaningful even when spacing is not. `level >= 2` is ' +
      'licensed; `level / 3` is not.',
  },
  {
    from: 'Prob',
    to: 'Ordinal',
    because: 'Thresholding a probability is the documented way to use it — subject to the 0.11 noise floor (P4).',
  },
  {
    from: 'Dist',
    to: 'Prob',
    because:
      'Reading one option\'s mass out of a distribution gives a genuine probability. Note it is NOT ' +
      'a confidence, and it does NOT protect against garbage input (P5).',
  },
];

/** Coercions that look reasonable, are commonly written, and are wrong. */
export const FORBIDDEN_COERCIONS: Array<{ from: Color; to: Color; why: string }> = [
  {
    from: 'Level',
    to: 'Prob',
    why:
      'Dividing a level by its maximum asserts equal spacing between levels and commensurability ' +
      'with probability. P14: score levels are weakly calibrated; do not interpolate magnitudes. ' +
      'Threshold the level instead, then weight the resulting boolean.',
  },
  {
    from: 'Key',
    to: 'Prob',
    why: 'A label has no magnitude. Map it through an explicit table to a value you chose deliberately.',
  },
  {
    from: 'Key',
    to: 'Ordinal',
    why:
      'Choice options are unordered by construction. If you need an order, the question should have ' +
      'been a score.',
  },
  {
    from: 'Prob',
    to: 'Level',
    why: 'Rescaling a probability into a rubric position invents precision the rubric never had.',
  },
];

// ─────────────────────────────────────────────── the licensed operations

/** Dist → Entropy. Normalised to [0,1] so sets with different option counts compare. */
export function entropy(dist: Record<string, number> | undefined): Entropy {
  if (!dist) return NaN as Entropy;
  const vs = Object.values(dist).filter(v => v > 0);
  const k = Object.keys(dist).length;
  if (vs.length <= 1 || k <= 1) return 0 as Entropy;
  const h = -vs.reduce((acc, v) => acc + v * Math.log2(v), 0);
  return (h / Math.log2(k)) as Entropy;
}

/** Level → Ordinal. The ONLY licensed way to get a scalar contribution from a score. */
export const atLeast = (level: Level, threshold: number): boolean => level >= threshold;

/**
 * Level → weighted contribution, via an ordinal gate rather than a division.
 * This is the correct replacement for `W.density * (score / 3)`.
 */
export const levelWeight = (level: Level, threshold: number, weight: number): number =>
  atLeast(level, threshold) ? weight : 0;

/** Prob → weighted contribution. Direct: a probability is already a [0,1] scalar. */
export const probWeight = (p: Prob, weight: number): number => p * weight;

/** Key → weighted contribution, only through a table you wrote on purpose. */
export const keyWeight = <K extends string>(key: K, table: Record<K, number>): number =>
  table[key] ?? 0;

// ──────────────────────────────────────────────────────────── the check

export type CompositionStep = { reads: Color; as: Color; where: string };

/**
 * Audit a recombination for colour violations. Call it in a test, not at runtime —
 * the point is to fail the build, not the request.
 */
export function checkComposition(steps: readonly CompositionStep[]): {
  ok: boolean;
  violations: Array<{ step: CompositionStep; why: string }>;
} {
  const violations: Array<{ step: CompositionStep; why: string }> = [];
  for (const step of steps) {
    if (step.reads === step.as) continue;
    const forbidden = FORBIDDEN_COERCIONS.find(f => f.from === step.reads && f.to === step.as);
    if (forbidden) {
      violations.push({ step, why: forbidden.why });
      continue;
    }
    const licensed = LICENSED_COERCIONS.some(l => l.from === step.reads && l.to === step.as);
    if (!licensed) {
      violations.push({
        step,
        why: `Undeclared coercion ${step.reads} → ${step.as}. Add it to LICENSED_COERCIONS with a reason, or stop doing it.`,
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

/**
 * The composition performed by `triage/triage.ts`, declared so it can be audited.
 * Before the fix this contained `{ reads: 'Level', as: 'Prob' }` and failed.
 */
export const TRIAGE_COMPOSITION: readonly CompositionStep[] = [
  { reads: 'Prob', as: 'Prob', where: 'seven literal booleans, weighted and summed' },
  { reads: 'Level', as: 'Ordinal', where: 'density gated at >= 2, then weighted' },
  { reads: 'Prob', as: 'Ordinal', where: 'KEEP_AT / DROP_AT thresholds on the aggregate' },
];
