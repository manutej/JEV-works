/**
 * Deterministic recombination. Jev answers the questions; everything that
 * decides an action lives here, in code you can unit-test without a network
 * call (the shape copied from ../../jev-playground/route-ticket.ts).
 */
import { KIND_AFFINITY } from './bank.mjs';

// ── Hand-set thresholds. LESSONS L6: these are NOT fitted on the golden set.
//    They are declared up front and reported as hand-set every time.
export const LOCAL_AT = 0.62;      // aggregate at/above this -> local fleet
export const MAX_ENTROPY = 0.9;    // normalised entropy of taskKind above this -> escalate
export const HARD_AT = 0.30;       // aggregate at/below this -> Opus rather than Sonnet

export const FLEET = {
  ORNITH_35B: 'ornith-35b',
  ORNITH_9B: 'ornith-1.5-9b',
  SONNET: 'sonnet',
  SONNET_1M: 'sonnet[1m]',
  OPUS: 'opus',
};

/** Normalised Shannon entropy of a probability map. 0 = decisive, 1 = flat. */
export function entropy(probs) {
  const vals = Object.values(probs ?? {}).filter((p) => p > 0);
  if (vals.length <= 1) return 0;
  const h = -vals.reduce((s, p) => s + p * Math.log(p), 0);
  return h / Math.log(vals.length);
}

/**
 * One aggregate, per LESSONS L1. Never ANDs per-question confidences.
 * Every term is oriented so that higher = better suited to a small local model.
 */
export function localFitness(answers) {
  const p = (q) => answers[q]?.probability ?? 0.5;
  const kind = answers.taskKind?.choice;
  const terms = {
    fullySpecified: p('fullySpecified'),
    notMultiStep: 1 - p('multiStepByOwnWords'),
    noInternetNeeded: 1 - p('needsInternet'),
    kindAffinity: KIND_AFFINITY[kind] ?? 0.3,
    smallOutput: 1 - (answers.outputSize?.score ?? 1.5) / 3,
  };
  const score = Object.values(terms).reduce((a, b) => a + b, 0) / Object.keys(terms).length;
  return { score, terms };
}

/**
 * @param answers  Jev output
 * @param facts    code-side truths: {estTokens, localCtx, needsWeb, needsVision, slotsFree}
 */
export function route(answers, facts) {
  const { score, terms } = localFitness(answers);
  const h = entropy(answers.taskKind?.probabilities);
  const kind = answers.taskKind?.choice;

  // L4: the aggregate is only reportable next to its inputs.
  const confidences = Object.fromEntries(
    Object.entries(answers).map(([k, v]) => [
      k, v.probability ?? v.score ?? v.probabilities?.[v.choice] ?? null,
    ]),
  );
  const weakest = Math.min(...Object.values(terms));
  const base = { score: +score.toFixed(3), entropy: +h.toFixed(3), kind, terms, confidences,
                 thresholdsAreHandSet: true };

  const out = (model, reason, escalate = false) => ({ ...base, model, reason, escalate });

  // ── Code-side vetoes first. These are facts, not judgements, and they win.
  if (facts.needsVision) {
    return out(FLEET.ORNITH_9B, 'vision required; 9B is the only local model with an mmproj');
  }
  if (facts.estTokens > facts.localCtx) {
    return out(FLEET.SONNET_1M,
      `${facts.estTokens} tok exceeds local window ${facts.localCtx}`, true);
  }
  if (facts.needsWeb) {
    return out(FLEET.SONNET, 'needs web access; local fleet has no search tool', true);
  }

  // ── Then the model's judgement, as one aggregate against one threshold.
  if (h > MAX_ENTROPY) {
    return out(FLEET.SONNET, `task kind undecided (entropy ${h.toFixed(2)})`, true);
  }
  if (score >= LOCAL_AT) {
    const why = `localFitness ${score.toFixed(2)} >= ${LOCAL_AT} (hand-set), kind=${kind}`;
    return out(FLEET.ORNITH_35B, facts.slotsFree > 0 ? why : `${why}; queued, no free slot`);
  }
  if (score <= HARD_AT) {
    return out(FLEET.OPUS, `localFitness ${score.toFixed(2)} <= ${HARD_AT} (hand-set)`, true);
  }
  return out(FLEET.SONNET,
    `localFitness ${score.toFixed(2)} below ${LOCAL_AT} (hand-set); weakest term ${weakest.toFixed(2)}`,
    true);
}

// ──────────────────────────────────────────── stage 3: artifact quality

export const END_HI = 0.85;
export const END_LO = 0.15;

/**
 * Grade an artifact. Gates on the END a probability sits at (../leads/pipeline.ts):
 * a 0.51 is not a decision. Anything that lands mid-band on every signal is
 * returned as 'review' rather than guessed at.
 */
export function grade(answers) {
  const kind = answers.contentKind?.choice;
  const kindP = answers.contentKind?.probabilities?.[kind] ?? 0;
  const templated = answers.looksTemplated?.probability ?? 0.5;
  const substance = answers.substance?.score ?? 1.5;

  const reasons = [];
  if (kind === 'placeholder' && kindP >= END_HI) reasons.push(`contentKind=placeholder @ ${kindP.toFixed(2)}`);
  if (substance <= 1) reasons.push(`substance ${substance.toFixed(2)} <= 1`);
  if (templated >= END_HI) reasons.push(`looksTemplated @ ${templated.toFixed(2)} (TRUE end)`);

  if (reasons.length) return { verdict: 'rebuild', reasons, substance };
  // Nothing fired at an end, and nothing was decisively good either.
  if (substance >= 2 && templated <= END_LO) {
    return { verdict: 'keep', reasons: [`substance ${substance.toFixed(2)}, not templated`], substance };
  }
  return { verdict: 'review', reasons: ['no signal reached an end'], substance };
}
