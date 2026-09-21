/**
 * The confidence/spread/verdict logic, as importable functions.
 *
 * Extracted from `measure-confidence.ts`, which was a CLI script with top-level
 * argv parsing and `process.exit` — so importing it executed the whole CLI as a
 * side effect. An agent building `leads/evaluate.ts` hit exactly that and
 * duplicated the maths instead, correctly and with a comment saying so. That is
 * the right call when the alternative is a side effect, and the wrong outcome:
 * two copies of a threshold that must agree.
 *
 * Rule this encodes: logic worth reusing does not live in a file that runs on
 * import. Pure functions here; argv and exit codes stay in the CLI.
 */

/** Distance from a coin flip, rescaled to 0 (no information) … 1 (certain). */
export const conf = (p: number) => Math.abs(p - 0.5) * 2;

export const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export const sd = (xs: readonly number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
};

/** A reading of one question on one state. Exactly one field is populated. */
export type Reading = { p?: number; level?: number; key?: string; entropy?: number };

export type Verdict =
  | 'JEV-SAFE'
  | 'MARGINAL'
  | 'MOVE-TO-CODE'
  | 'NO-INFORMATION'
  | 'INSUFFICIENT-DATA';

export type QuestionSummary = {
  question: string;
  kind: 'boolean' | 'choice' | 'score';
  meanConf: number;
  atEnds: number;
  /**
   * Discrimination. For boolean/score this is the dispersion of the value. For
   * CHOICE it is key diversity — distinct keys selected / options available.
   * Using the boolean metric on a choice is wrong: the model returns near-one-hot
   * distributions, so the top probability is ~1.0 on every item and its dispersion
   * is ~0 regardless of how well the question discriminates.
   */
  spread: number;
  verdict: Verdict;
  /** choice only: how many distinct keys were selected, and out of how many. */
  keysUsed?: number;
  optionCount?: number;
  /**
   * choice only: the entropy distribution actually observed. Report the MAX before
   * relying on any entropy gate — if the corpus never approaches the threshold,
   * the gate is dead code and provides no protection at all.
   */
  entropyMax?: number;
  entropyMean?: number;
};

/** Thresholds, in one place, so the CLI and any evaluator cannot drift apart. */
export const THRESHOLDS = {
  /** Below this spread the question is answered before it is asked. */
  noInformationSpread: 0.08,
  /** A probability this close to 0 or 1 counts as decisive. */
  endBand: 0.15,
  /** Fraction of states that must be decisive to be safe to build on. */
  safeAtEnds: 0.5,
  /** Below this fraction the question never decides anything. */
  moveToCodeAtEnds: 0.25,
  /**
   * Minimum observations before ANY verdict is issued. Without this, NaN
   * comparisons all evaluate false and the function returns its last branch —
   * so zero data silently reported as the best possible verdict.
   */
  minObservations: 8,
} as const;

/**
 * Order matters: a question can be confident AND useless, so the
 * no-information check runs before the decisiveness checks.
 */
export function verdictFor(atEnds: number, spread: number, n: number): Verdict {
  // Guard FIRST. A verdict is a claim about a question, and n=0 supports none.
  if (!Number.isFinite(atEnds) || !Number.isFinite(spread)) return 'INSUFFICIENT-DATA';
  if (n < THRESHOLDS.minObservations) return 'INSUFFICIENT-DATA';
  if (spread < THRESHOLDS.noInformationSpread) return 'NO-INFORMATION';
  if (atEnds < THRESHOLDS.moveToCodeAtEnds) return 'MOVE-TO-CODE';
  if (atEnds < THRESHOLDS.safeAtEnds) return 'MARGINAL';
  return 'JEV-SAFE';
}

/** Summarise one question across all states. */
export function summariseQuestion(
  question: string,
  kind: 'boolean' | 'choice' | 'score',
  readings: readonly Reading[],
  levels?: number,
  optionCount?: number,
): QuestionSummary {
  if (kind === 'choice') {
    const keys = readings.map(r => r.key).filter((k): k is string => typeof k === 'string');
    const hs = readings.map(r => r.entropy).filter((h): h is number => Number.isFinite(h));
    const distinct = new Set(keys).size;
    const options = optionCount ?? Math.max(distinct, 2);
    // Discrimination is key diversity. A question that selects one key on every
    // item tells you nothing, however confidently it selects it.
    const spread = keys.length ? distinct / options : NaN;
    // Decisiveness is low entropy, i.e. a concentrated distribution.
    const atEnds = hs.length ? hs.filter(h => h < 0.15).length / hs.length : NaN;
    return {
      question,
      kind,
      meanConf: hs.length ? 1 - mean(hs) : NaN,
      atEnds,
      spread,
      keysUsed: distinct,
      optionCount: options,
      entropyMax: hs.length ? Math.max(...hs) : undefined,
      entropyMean: hs.length ? +mean(hs).toFixed(4) : undefined,
      verdict:
        !keys.length ? 'INSUFFICIENT-DATA'
        : keys.length < THRESHOLDS.minObservations ? 'INSUFFICIENT-DATA'
        : distinct <= 1 ? 'NO-INFORMATION'
        : atEnds < THRESHOLDS.moveToCodeAtEnds ? 'MOVE-TO-CODE'
        : atEnds < THRESHOLDS.safeAtEnds ? 'MARGINAL'
        : 'JEV-SAFE',
    };
  }

  if (kind === 'score') {
    const vals = readings.map(r => r.level).filter((v): v is number => Number.isFinite(v));
    // A score's "decisiveness" is how close it sits to a rubric level rather
    // than between two. A persistently mid value means the rubric does not
    // separate — the ordinal equivalent of a mid-band probability.
    const distToLevel = vals.map(v => 1 - Math.abs(v - Math.round(v)) * 2);
    return {
      question,
      kind,
      meanConf: vals.length ? mean(distToLevel) : NaN,
      atEnds: vals.length ? vals.filter(v => Math.abs(v - Math.round(v)) < 0.15).length / vals.length : NaN,
      spread: vals.length ? sd(vals) / Math.max(1, (levels ?? 4) - 1) : NaN,
      verdict: verdictFor(
        vals.length ? vals.filter(v => Math.abs(v - Math.round(v)) < 0.15).length / vals.length : NaN,
        vals.length ? sd(vals) / Math.max(1, (levels ?? 4) - 1) : NaN,
        vals.length,
      ),
    };
  }

  const ps = readings.map(r => r.p).filter((v): v is number => Number.isFinite(v));
  const atEnds = ps.length
    ? ps.filter(p => p >= 1 - THRESHOLDS.endBand || p <= THRESHOLDS.endBand).length / ps.length
    : NaN;
  const spread = ps.length ? sd(ps) : NaN;
  return {
    question,
    kind,
    meanConf: ps.length ? mean(ps.map(conf)) : NaN,
    atEnds,
    spread,
    verdict: verdictFor(atEnds, spread, ps.length),
  };
}

/** Summarise a whole set, sorted most-decisive first. */
export function summariseSet(
  perQuestion: Record<string, { kind: 'boolean' | 'choice' | 'score'; levels?: number; optionCount?: number; readings: Reading[] }>,
): QuestionSummary[] {
  return Object.entries(perQuestion)
    .map(([q, v]) => summariseQuestion(q, v.kind, v.readings, v.levels, v.optionCount))
    .sort((a, b) => b.atEnds - a.atEnds);
}

export const defects = (rows: readonly QuestionSummary[]) => ({
  moveToCode: rows.filter(r => r.verdict === 'MOVE-TO-CODE'),
  noInformation: rows.filter(r => r.verdict === 'NO-INFORMATION'),
  /** Not a defect in the question — a defect in the run that produced it. */
  insufficientData: rows.filter(r => r.verdict === 'INSUFFICIENT-DATA'),
});

/** Render the standard table. Kept here so every caller prints it identically. */
export function renderTable(rows: readonly QuestionSummary[]): string {
  const w = [26, 8, 10, 9, 8, 16];
  const head = ['question', 'kind', 'mean conf', 'at ends', 'spread', 'verdict'];
  const lines = [
    head.map((h, i) => h.padEnd(w[i])).join(' '),
    w.map(n => '─'.repeat(n)).join(' '),
  ];
  for (const r of rows) {
    lines.push(
      [
        r.question.slice(0, 26),
        r.kind,
        Number.isFinite(r.meanConf) ? r.meanConf.toFixed(3) : '—',
        Number.isFinite(r.atEnds) ? `${Math.round(r.atEnds * 100)}%` : '—',
        Number.isFinite(r.spread)
          ? r.kind === 'choice' ? `${r.keysUsed}/${r.optionCount} keys` : r.spread.toFixed(3)
          : '—',
        r.verdict + (r.kind === 'choice' && r.entropyMax !== undefined && r.entropyMax < 0.3
          ? `  (max H ${r.entropyMax.toFixed(2)} — entropy gate inert)` : ''),
      ].map((c, i) => String(c).padEnd(w[i])).join(' '),
    );
  }
  return lines.join('\n');
}
