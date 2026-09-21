/**
 * WINDOWS_100 — a 100-question evaluation set for scoring ONE CANDIDATE
 * RESEARCH WINDOW per call.
 *
 * A "window" is a specific decision site in a codebase where a hardcoded
 * rule, threshold, or regex currently stands in for a judgement, and where a
 * fast typed-decision model might replace it. The state passed per call:
 *
 *   { name, repo, file, functionName, whatItDecides, currentMechanism,
 *     callVolume, downstreamEffect, verifiableByCode, hasLabels, notes }
 *
 * All string or boolean fields. No other state is assumed available.
 *
 * TAXONOMY (P21-shaped): 5 categories × 4 sub-categories × 5 questions.
 *   1 TRACTABILITY — can this be studied at all right now?
 *   2 FIT          — does the judgement match what a typed decision model does well?
 *   3 INCUMBENT    — what is being replaced, and how strong is it?
 *   4 PAYOFF       — what changes if it works?
 *   5 EXPOSURE     — what breaks if it is wrong?
 *
 * HARD CONSTRAINT (../NETER.md P21, ../question-bank/README.md): every
 * question here is answerable from the state object ALONE, literally — no
 * comparison to another window, no counterfactual, no reasoning across time.
 * Judgements that need those are named, not asked — see MOVED_TO_CODE below.
 * Also respected: never ask it to count, total, compare magnitudes, or do
 * arithmetic (P18) — "how many" questions became `score` questions with
 * named ordinal levels instead.
 */

import type { JevQuestion } from '../question-bank/bank.ts';

export const WINDOWS_100: Record<string, JevQuestion> = {
  // ═══════════════════════════════════════════════════ 1 · TRACTABILITY

  // ── 1.1 measurability without labels
  notesDescribeGroundTruthSource: {
    type: 'boolean',
    instructions:
      'Does notes mention an existing source of correct answers for this decision — a log, an audit, a past record of outcomes — that could serve as ground truth?',
    criteria: {
      true: 'notes names a specific place where correct outcomes are already recorded.',
      false: 'notes says nothing about any existing record of correct outcomes, or hasLabels-style ground truth is not discussed at all.',
    },
  },
  decisionLeavesObservableTrace: {
    type: 'boolean',
    instructions:
      'Does downstreamEffect describe the outcome of this decision as leaving some observable trace (a written record, a state change, an emitted value), rather than vanishing once made?',
  },
  outcomeObservableWithoutHuman: {
    type: 'boolean',
    instructions:
      'Do whatItDecides or downstreamEffect describe an outcome that a machine could observe on its own — a test passing, an error being thrown, a value matching — without a person having to judge it?',
  },
  proxySignalStrength: {
    type: 'score',
    instructions:
      'Reading notes and downstreamEffect together, how strong is the available proxy for whether this decision was made correctly?',
    criteria: [
      'No proxy signal of any kind is mentioned.',
      'An indirect signal is mentioned in passing, with no detail.',
      'A concrete, unlabeled record of past outcomes is described.',
      'A concrete, already-labeled dataset or ground truth is described.',
    ],
  },
  currentMechanismOutputUsableAsWeakLabel: {
    type: 'boolean',
    instructions:
      'Could currentMechanism\'s own past outputs, as described, serve as a rough weak-supervision signal (even an imperfect one) for what the decision should be?',
    criteria: {
      true: 'currentMechanism is described as producing a stored or loggable output that reflects its past decisions.',
      false: 'currentMechanism\'s output is described as transient, or nothing suggests its past decisions are recoverable.',
    },
  },

  // ── 1.2 self-verifiability by code
  decisionHasCheckableInvariant: {
    type: 'boolean',
    instructions:
      'Does whatItDecides describe an invariant or property that code could assert directly — a type check, a schema match, a fixed rule — rather than an open-ended judgement call?',
    criteria: {
      true: 'The decision, as stated, could be checked by a deterministic assertion.',
      false: 'The decision, as stated, requires interpretation that no single assertion could settle.',
    },
  },
  outputIsDiscreteValue: {
    type: 'boolean',
    instructions:
      'Does whatItDecides describe the decision\'s output as one discrete value (a label, a boolean, a level), rather than free text or a continuously varying number?',
  },
  downstreamEffectIsMachineObservable: {
    type: 'boolean',
    instructions:
      'Does downstreamEffect name a consequence a machine could check on its own — a test result, an error code, a logged metric — rather than something only a person would notice?',
    criteria: {
      true: 'downstreamEffect names a specific machine-checkable consequence.',
      false: 'downstreamEffect describes a consequence that only a human reader would perceive, or names nothing specific.',
    },
  },
  mechanismDeterminismLevel: {
    type: 'score',
    instructions: 'How deterministic does currentMechanism read, as described?',
    criteria: [
      'A fully deterministic rule or formula — the same input always gives the same output.',
      'Mostly deterministic, with a small heuristic adjustment described.',
      'A heuristic combination of several signals, without a single deterministic rule.',
      'Described as ultimately a subjective or judgement-based call.',
    ],
  },
  notesNameExistingTestOrAssertion: {
    type: 'boolean',
    instructions: 'Does notes mention an existing test, lint rule, or assertion that already checks the correctness of this decision in some way?',
  },

  // ── 1.3 state availability
  functionNameIsConcrete: {
    type: 'boolean',
    instructions: 'Is functionName a specific, identifiable symbol name, rather than a placeholder, a generic description, or empty?',
    criteria: {
      true: 'functionName names one or more real identifiers a reader could search for in the source.',
      false: 'functionName is blank, or reads as a vague description rather than a symbol.',
    },
  },
  fileIsSingleConcretePath: {
    type: 'boolean',
    instructions: 'Does file identify one concrete file path, rather than a pattern, a directory, or a list of many files?',
    criteria: {
      true: 'file is a single specific path to one file.',
      false: 'file names a directory, a pattern, or more than one file.',
    },
  },
  decisionOutputStatedPlainly: {
    type: 'boolean',
    instructions: 'Does whatItDecides state, in one plain sentence, exactly what output this decision produces?',
  },
  mechanismIsNamedSpecifically: {
    type: 'boolean',
    instructions: 'Does currentMechanism name a specific technique — a regex, a numeric threshold, a lookup table, a rule chain — rather than an unspecified "custom logic" or "some checks"?',
  },
  stateCompletenessForThisWindow: {
    type: 'score',
    instructions: 'Taken together, how much of what is needed to understand this window is present as specifics in the state (rather than as vague description)?',
    criteria: [
      'Almost every field is vague or generic.',
      'Some fields are concrete, but key fields are vague.',
      'Most fields are concrete, with one or two vague spots.',
      'Every field names something specific and checkable.',
    ],
  },

  // ── 1.4 corpus size
  callVolumeIsStated: {
    type: 'boolean',
    instructions: 'Does callVolume name a concrete cadence or frequency for how often this decision runs, rather than being vague or silent about it?',
    criteria: {
      true: 'callVolume states a specific frequency, cadence, or trigger (e.g. "once per request", "nightly batch").',
      false: 'callVolume is empty, or only vaguely gestures at frequency.',
    },
  },
  callVolumeBand: {
    type: 'score',
    instructions: 'Reading callVolume, which frequency band does this decision fall into?',
    criteria: [
      'Rare — runs less than daily, or only on demand.',
      'Regular — runs on a daily-to-hourly cadence.',
      'Frequent — runs many times per hour.',
      'Constant — runs on every request or every call, continuously.',
    ],
  },
  mechanismRecurringAcrossCallSites: {
    type: 'boolean',
    instructions: 'Do whatItDecides or notes state that this same currentMechanism is invoked from more than one call site in the repo, rather than from a single location?',
    criteria: {
      true: 'The text states or clearly implies multiple call sites for this exact mechanism.',
      false: 'The text describes a single call site, or says nothing about how many places call it.',
    },
  },
  sampleCollectionDescribed: {
    type: 'boolean',
    instructions: 'Does notes describe a way to gather many past instances of this decision being made — logged, stored, or printed each time it runs?',
  },
  corpusGrowsPassively: {
    type: 'boolean',
    instructions: 'Do downstreamEffect or notes indicate that new instances of this decision accumulate on their own during normal operation, without special instrumentation being added?',
    criteria: {
      true: 'Normal operation, as described, is already producing new instances to learn from.',
      false: 'Collecting new instances would require adding instrumentation that is not described as already present.',
    },
  },

  // ═══════════════════════════════════════════════════════════ 2 · FIT

  // ── 2.1 answer-space closure
  outputSpaceIsEnumerable: {
    type: 'boolean',
    instructions: 'Does whatItDecides describe a fixed, nameable set of possible outputs (e.g. "approve or deny", "route A, B, or C"), rather than open-ended free text?',
    criteria: {
      true: 'The possible outputs could be listed as a short, closed set.',
      false: 'The output is described as free-form or open-ended, or no set of options is implied.',
    },
  },
  outputIsSingleValue: {
    type: 'boolean',
    instructions: 'Does whatItDecides describe the decision as producing one discrete value per call, rather than a structured result with several parts?',
  },
  optionCountBand: {
    type: 'score',
    instructions: 'Based on how whatItDecides describes the possible outputs, how many named options does the decision appear to choose among?',
    criteria: [
      'Binary — two options.',
      'A few — roughly three to six named options.',
      'Many — more than six named options.',
      'Not enumerable — the output is open-ended rather than a fixed set of options.',
    ],
  },
  sameOutputTypeAcrossCalls: {
    type: 'boolean',
    instructions: 'Does whatItDecides indicate that every call to this decision point returns the same kind of value, rather than switching output shape depending on the input?',
    criteria: {
      true: 'The described output is uniform in kind every time this decision runs.',
      false: 'whatItDecides describes the output shape as varying by case.',
    },
  },
  decisionIsAtomic: {
    type: 'boolean',
    instructions: 'Does whatItDecides describe a single judgement, rather than bundling two separate judgements into one decision (e.g. "decide priority and assignee")?',
    criteria: {
      true: 'whatItDecides names exactly one thing being decided.',
      false: 'whatItDecides names two or more things being decided at once.',
    },
  },

  // ── 2.2 literalness (is it readable from one state?)
  inputsNamedExplicitly: {
    type: 'boolean',
    instructions: 'Do whatItDecides or currentMechanism name the specific inputs the decision reads (a field, a value, a variable), rather than referring to input vaguely as "context" or "the situation"?',
    criteria: {
      true: 'One or more specific inputs are named.',
      false: 'The inputs are described only in vague, unnamed terms.',
    },
  },
  decisionUsesOnlyCurrentInput: {
    type: 'boolean',
    instructions: 'Does whatItDecides indicate the decision is made from the current call\'s input alone, with no stated need for history or prior calls?',
    criteria: {
      true: 'Nothing in whatItDecides or notes implies a need for anything beyond the current input.',
      false: 'whatItDecides or notes state or imply the decision needs information from before this call.',
    },
  },
  requiresCrossItemComparison: {
    type: 'boolean',
    instructions: 'Do whatItDecides or notes state or imply that the decision compares the current item against other items — "relative to peers", "versus the previous version", "the best of several"?',
    criteria: {
      true: 'The decision is described as inherently about a comparison between two or more items.',
      false: 'The decision is described as a property of one item in isolation.',
    },
  },
  requiresCounterfactualReasoning: {
    type: 'boolean',
    instructions: 'Do whatItDecides or notes describe the decision as depending on what would happen under different circumstances, rather than on what is currently true?',
    criteria: {
      true: 'The decision text poses a hypothetical or "what if" condition.',
      false: 'The decision text is about the present state only.',
    },
  },
  decisionDependsOnGoalOrIntent: {
    type: 'boolean',
    instructions: 'Does whatItDecides state that the decision depends on inferring a broader goal or intent beyond what is directly in front of it — for example, whether an action serves a larger, unstated objective?',
    criteria: {
      true: 'whatItDecides explicitly ties the decision to a broader goal or intent.',
      false: 'whatItDecides describes a judgement about the immediate item, with no reference to a larger goal.',
    },
  },

  // ── 2.3 decomposability into narrow questions
  mechanismCombinesMultipleConditions: {
    type: 'boolean',
    instructions: 'Does currentMechanism\'s description combine more than one condition (several if/and clauses, several checks) into a single decision?',
    criteria: {
      true: 'currentMechanism describes two or more distinct conditions being combined.',
      false: 'currentMechanism describes one single condition.',
    },
  },
  subConditionsAreNameable: {
    type: 'boolean',
    instructions: 'Based on how currentMechanism is described, could its separate conditions each be named as their own narrow check?',
  },
  whatItDecidesReadsAsOneQuestion: {
    type: 'boolean',
    instructions: 'Read literally, does whatItDecides pose exactly one question, rather than an "and" or "or" of several questions?',
    criteria: {
      true: 'whatItDecides contains a single question with no "and"/"or" joining separate judgements.',
      false: 'whatItDecides joins two or more separate judgements with "and" or "or".',
    },
  },
  notesSuggestEdgeCases: {
    type: 'boolean',
    instructions: 'Does notes mention any specific edge case or exception that the current mechanism has to handle?',
  },
  edgeCaseCountBand: {
    type: 'score',
    instructions: 'Based on notes, roughly how many distinct edge cases or exceptions are mentioned for this decision?',
    criteria: [
      'None mentioned.',
      'One mentioned.',
      'A few mentioned — roughly two to four.',
      'Many mentioned — five or more.',
    ],
  },

  // ── 2.4 known anti-patterns (counting, arithmetic, comparison, generation)
  mechanismCounts: {
    type: 'boolean',
    instructions: 'Does currentMechanism tally, total, or count occurrences of something as part of making the decision?',
    criteria: {
      true: 'currentMechanism\'s description includes counting or tallying items.',
      false: 'currentMechanism does not describe any counting or tallying step.',
    },
  },
  mechanismDoesArithmetic: {
    type: 'boolean',
    instructions: 'Does currentMechanism perform a numeric calculation — a sum, an average, a ratio, a date computation — as part of making the decision?',
    criteria: {
      true: 'currentMechanism\'s description includes a calculation on numbers or dates.',
      false: 'currentMechanism\'s description includes no calculation.',
    },
  },
  mechanismComparesMagnitudes: {
    type: 'boolean',
    instructions: 'Does currentMechanism compare two measured quantities against each other, beyond checking one value against a single fixed cutoff?',
    criteria: {
      true: 'currentMechanism weighs two or more measured values against one another.',
      false: 'currentMechanism checks at most one value against a single fixed cutoff, or does no magnitude comparison at all.',
    },
  },
  decisionRequiresGeneration: {
    type: 'boolean',
    instructions: 'Does whatItDecides call for producing new free-form text, code, or content, rather than selecting or labeling from a fixed set of outcomes?',
    criteria: {
      true: 'whatItDecides describes creating new content as the output.',
      false: 'whatItDecides describes selecting or labeling as the output.',
    },
  },
  mechanismRequiresRankingOrSorting: {
    type: 'boolean',
    instructions: 'Does currentMechanism rank, sort, or pick a "best of" among several items before arriving at the decision?',
    criteria: {
      true: 'currentMechanism\'s description includes ordering or ranking multiple items.',
      false: 'currentMechanism\'s description includes no ordering or ranking step.',
    },
  },

  // ═══════════════════════════════════════════════════════ 3 · INCUMBENT

  // ── 3.1 what the current mechanism is
  mechanismShape: {
    type: 'choice',
    instructions: 'Which shape best matches how currentMechanism is described?',
    criteria: {
      regex: 'Pattern or string matching, such as a regular expression or substring check.',
      fixedThreshold: 'A single numeric cutoff value the input is checked against.',
      ruleChain: 'A sequence of if/else or switch-style rules.',
      allowlistOrDenylist: 'Membership checked against a fixed list of names or values.',
      other: 'Described, but does not match any of the above shapes.',
    },
  },
  mechanismAgeOrOriginStated: {
    type: 'boolean',
    instructions: 'Does notes or currentMechanism state when or why this mechanism was first put in place?',
    criteria: {
      true: 'A specific origin, reason, or timeframe is given for this mechanism.',
      false: 'No origin or reason is mentioned.',
    },
  },
  mechanismLivesInline: {
    type: 'boolean',
    instructions: 'Do file or currentMechanism indicate the mechanism is written inline inside this one function, rather than defined in a separate shared module?',
    criteria: {
      true: 'The mechanism is described as local to this function.',
      false: 'The mechanism is described as living in a shared or separate module.',
    },
  },
  mechanismHasNamedConstants: {
    type: 'boolean',
    instructions: 'Does currentMechanism reference a specifically named constant or configuration value (e.g. a named threshold variable), rather than only a bare, unnamed number in the logic?',
  },
  mechanismComplexityLevel: {
    type: 'score',
    instructions: 'How complex is currentMechanism, as described?',
    criteria: [
      'A single condition or check.',
      'A short handful of combined conditions.',
      'A large branching structure with many combined conditions.',
    ],
  },

  // ── 3.2 how it fails today
  notesDescribeKnownFailureMode: {
    type: 'boolean',
    instructions: 'Does notes name a specific way this mechanism currently produces the wrong answer?',
    criteria: {
      true: 'notes describes at least one concrete way this mechanism gets it wrong.',
      false: 'notes describes no specific failure, or does not discuss failure at all.',
    },
  },
  failureDirection: {
    type: 'choice',
    instructions: 'Based on notes, which direction does this mechanism\'s failure mode run?',
    criteria: {
      false_positive: 'It is described as firing or triggering when it should not.',
      false_negative: 'It is described as failing to fire when it should.',
      both: 'Both directions of failure are described.',
      not_stated: 'notes does not describe a specific failure direction.',
    },
  },
  workaroundBurdenLevel: {
    type: 'score',
    instructions: 'Based on notes, how much manual workaround does this mechanism\'s failure currently require from a person?',
    criteria: [
      'No manual workaround is described as needed.',
      'A light, occasional manual step is described.',
      'A heavy, recurring manual process is described.',
    ],
  },
  failureIsSilent: {
    type: 'boolean',
    instructions: 'Does notes indicate that a wrong decision from this mechanism produces no visible error, warning, or symptom?',
    criteria: {
      true: 'A wrong decision is described as passing without any visible sign.',
      false: 'A wrong decision is described as surfacing in some visible way, or notes says nothing on this point.',
    },
  },
  failureFrequencyBand: {
    type: 'score',
    instructions: 'Based on notes, how often does this mechanism\'s failure appear to occur?',
    criteria: [
      'No failure is reported.',
      'Rare — occasional mentions of failure.',
      'Common — described as failing regularly.',
      'Constant — described as failing most or all of the time.',
    ],
  },

  // ── 3.3 cheap-baseline strength
  mechanismAlreadyCheap: {
    type: 'boolean',
    instructions: 'Does currentMechanism describe something computationally trivial — a string check, a single comparison — rather than an expensive computation?',
    criteria: {
      true: 'currentMechanism reads as a cheap, simple operation.',
      false: 'currentMechanism reads as, or is described as, computationally heavy.',
    },
  },
  baselineHasBeenTuned: {
    type: 'boolean',
    instructions: 'Does notes state that the current threshold or rule was adjusted based on real data or past experience, rather than chosen arbitrarily?',
  },
  baselineAccuracyDescription: {
    type: 'choice',
    instructions: 'Based on notes, how does the text characterize how often the current mechanism gets the decision right?',
    criteria: {
      works_well: 'Described as working well or being reliable.',
      mixed_results: 'Described as right some of the time, with specific noted gaps.',
      frequently_wrong: 'Described as often or usually wrong.',
      not_stated: 'notes does not characterize the mechanism\'s accuracy.',
    },
  },
  simplerFixAlreadyConsidered: {
    type: 'boolean',
    instructions: 'Does notes mention that a simpler change — adjusting the threshold, adding a case — was already tried or considered for this mechanism?',
  },
  baselineWasCopiedFromElsewhere: {
    type: 'boolean',
    instructions: 'Does notes state that this mechanism was copied or adapted from another part of the codebase or another project?',
    criteria: {
      true: 'notes states or clearly implies the mechanism originated elsewhere and was copied in.',
      false: 'notes says nothing about the mechanism\'s origin being copied from elsewhere.',
    },
  },

  // ── 3.4 whether anyone would notice a change
  decisionVisibilityScope: {
    type: 'choice',
    instructions: 'Based on downstreamEffect, who would notice if this decision\'s output changed?',
    criteria: {
      external_user: 'The outcome is described as visible to an end user or customer.',
      internal_team_only: 'The outcome is described as visible only to an internal team, not external users.',
      downstream_systems_only: 'The outcome is described as feeding only other automated systems, with no human audience named.',
      not_stated: 'downstreamEffect does not say who would notice.',
    },
  },
  changeWouldRequireApproval: {
    type: 'boolean',
    instructions: 'Does notes mention that changing this mechanism would need sign-off, review, or coordination with other people?',
    criteria: {
      true: 'notes names a specific approval or coordination requirement.',
      false: 'notes mentions no such requirement.',
    },
  },
  decisionHasExistingMonitoring: {
    type: 'boolean',
    instructions: 'Do notes or downstreamEffect mention that this decision\'s outcomes are already tracked, logged, or shown on a dashboard somewhere?',
    criteria: {
      true: 'A specific existing monitoring or logging mechanism is named.',
      false: 'No existing monitoring is mentioned.',
    },
  },
  mechanismIsDocumentedElsewhere: {
    type: 'boolean',
    instructions: 'Does notes state that this mechanism\'s behavior is written down in a doc, comment, or spec that others might read?',
  },
  noticeabilityBand: {
    type: 'score',
    instructions: 'Based on downstreamEffect and notes together, how noticeable would a change to this decision be?',
    criteria: [
      'Would likely go unnoticed by anyone.',
      'Would be noticed only by dedicated monitoring or a deliberate check.',
      'Would be noticed by the immediate team in the course of normal work.',
      'Would be immediately visible to end users.',
    ],
  },

  // ══════════════════════════════════════════════════════════ 4 · PAYOFF

  // ── 4.1 volume and frequency
  volumeTrendStatedAsGrowing: {
    type: 'boolean',
    instructions: 'Does notes state that call volume for this decision is increasing over time?',
    criteria: {
      true: 'notes explicitly says volume is growing.',
      false: 'notes says volume is stable, declining, or says nothing about a trend.',
    },
  },
  decisionRunsOnHotPath: {
    type: 'boolean',
    instructions: 'Do whatItDecides or downstreamEffect describe this decision as running on a frequently executed path (e.g. every request, every save), rather than a rare or admin-only path?',
    criteria: {
      true: 'The decision is placed on a path described as frequently executed.',
      false: 'The decision is placed on a path described as rare, occasional, or admin-only.',
    },
  },
  volumeImpactBand: {
    type: 'score',
    instructions: 'Reading callVolume, how much of the system\'s overall activity does this decision touch?',
    criteria: [
      'A narrow, occasional path.',
      'A regular but bounded feature.',
      'A widely used feature.',
      'A core path that nearly everything touches.',
    ],
  },
  improvementScalesWithVolume: {
    type: 'boolean',
    instructions: 'Does downstreamEffect indicate that a better decision here would have an effect proportional to how often it runs, rather than a fixed, one-time benefit?',
    criteria: {
      true: 'The benefit is described as compounding with each call.',
      false: 'The benefit is described as fixed regardless of call frequency, or nothing is said about this.',
    },
  },
  volumeCadencePattern: {
    type: 'choice',
    instructions: 'Based on notes and callVolume, what pattern does call volume follow?',
    criteria: {
      steady: 'Volume is described as roughly constant over time.',
      seasonal_or_bursty: 'Volume is described as concentrated in bursts or specific periods.',
      rare_or_ad_hoc: 'Volume is described as occasional and irregular, with no steady pattern.',
      not_stated: 'No pattern for volume over time is described.',
    },
  },

  // ── 4.2 latency or cost relief
  mechanismRunsSynchronously: {
    type: 'boolean',
    instructions: 'Do currentMechanism or downstreamEffect indicate this decision blocks the caller while it runs, rather than happening in the background?',
  },
  mechanismIsOnCriticalPath: {
    type: 'boolean',
    instructions: 'Does downstreamEffect state that the outcome of this decision gates or delays a later step?',
    criteria: {
      true: 'A later step is described as waiting on or being gated by this decision.',
      false: 'No later step is described as waiting on this decision.',
    },
  },
  currentMechanismHasKnownCost: {
    type: 'boolean',
    instructions: 'Does notes mention that the current mechanism itself is slow, expensive, or resource-intensive to run?',
  },
  fasterDecisionWouldRelieveBottleneck: {
    type: 'boolean',
    instructions: 'Do notes or downstreamEffect suggest this decision point has been identified as a bottleneck or hot spot in the system?',
    criteria: {
      true: 'notes or downstreamEffect explicitly name this point as a bottleneck.',
      false: 'No such identification is made.',
    },
  },
  costReliefBand: {
    type: 'score',
    instructions: 'Based on notes and downstreamEffect, how much latency or cost relief would a faster decision here plausibly bring?',
    criteria: [
      'Negligible — the decision is already described as cheap.',
      'Moderate — it adds noticeable but non-blocking overhead.',
      'Significant — it is described as a known slow or costly step.',
    ],
  },

  // ── 4.3 capability genuinely unlocked
  currentMechanismCannotHandleCase: {
    type: 'boolean',
    instructions: 'Does notes describe a case the current mechanism is structurally unable to handle — not just wrong on sometimes, but with no rule covering it at all?',
    criteria: {
      true: 'notes names a case with no existing rule to cover it.',
      false: 'notes describes only cases the mechanism handles incorrectly, or names no uncovered case.',
    },
  },
  richerJudgmentWouldChangeOutcome: {
    type: 'boolean',
    instructions: 'Does notes suggest that a more nuanced judgement, in place of the current fixed rule, would produce a different and better outcome on cases already known?',
  },
  capabilityIsNetNewOrRestoring: {
    type: 'choice',
    instructions: 'Based on notes, does the improvement described represent a capability the system has never had, one that regressed and would be restored, or something more incremental?',
    criteria: {
      new_capability: 'Described as something the system could not do before at all.',
      restores_lost_capability: 'Described as recovering something that used to work but no longer does.',
      incremental_improvement_only: 'Described only as a modest improvement on an existing capability.',
      not_stated: 'notes does not characterize the improvement this way.',
    },
  },
  blockingSeverityLevel: {
    type: 'score',
    instructions: 'Based on notes, how much is currently blocked specifically because of this mechanism\'s limits?',
    criteria: [
      'Nothing is described as blocked.',
      'A minor feature or edge case is described as limited.',
      'A significant feature is described as entirely blocked.',
    ],
  },
  improvementIsQualityNotSpeed: {
    type: 'boolean',
    instructions: 'Does notes frame the potential improvement as making better decisions, as opposed to making the same decisions faster or cheaper?',
    criteria: {
      true: 'notes frames the benefit in terms of decision quality.',
      false: 'notes frames the benefit in terms of speed or cost, or does not frame a benefit at all.',
    },
  },

  // ── 4.4 reuse across other sites
  mechanismPatternNamedAsCommon: {
    type: 'boolean',
    instructions: 'Does notes state that this same kind of mechanism (a regex, a threshold, a rule chain) also appears elsewhere in the repo?',
    criteria: {
      true: 'notes names another location using the same kind of mechanism.',
      false: 'notes names no other location, or does not address this.',
    },
  },
  reuseScopeBand: {
    type: 'choice',
    instructions: 'Based on notes, how broadly could a fix to this mechanism be reused elsewhere?',
    criteria: {
      single_site_only: 'Described as specific to this one site, with no mention of reuse.',
      few_similar_sites: 'A couple of similar sites are mentioned.',
      common_pattern_in_repo: 'Described as a common pattern across this repo.',
      cross_repo_pattern: 'Described as a pattern seen across more than one repo.',
    },
  },
  fixTransferabilityLevel: {
    type: 'score',
    instructions: 'Based on whatItDecides and notes, how transferable would a fix to this mechanism likely be to other sites?',
    criteria: [
      'Highly specific to this file\'s particular business logic.',
      'Could generalize with moderate rework.',
      'Already framed in generic terms in the text.',
      'Sounds like a drop-in utility usable elsewhere as-is.',
    ],
  },
  domainGeneralityLevel: {
    type: 'score',
    instructions: 'How general is the underlying judgement described in whatItDecides, independent of this specific project?',
    criteria: [
      'A fully project-specific business rule.',
      'Mostly project-specific, with a general core.',
      'Mostly general, with minor project-specific details.',
      'A fully general domain judgement that could apply anywhere.',
    ],
  },
  sharedUtilityMaturity: {
    type: 'score',
    instructions: 'Based on file and notes, does this mechanism already live in shared infrastructure, or is it standalone?',
    criteria: [
      'No shared utility exists; the logic is local to this one function.',
      'An ad hoc shared helper is described as already existing.',
      'A well-established shared utility is described as already existing.',
    ],
  },

  // ═════════════════════════════════════════════════════════ 5 · EXPOSURE

  // ── 5.1 reversibility
  decisionOutputIsPersisted: {
    type: 'boolean',
    instructions: 'Does downstreamEffect state that this decision\'s output gets written or stored somewhere durable?',
    criteria: {
      true: 'downstreamEffect names a durable place the output is written to.',
      false: 'downstreamEffect describes no durable storage of the output.',
    },
  },
  decisionCanBeOverriddenLater: {
    type: 'boolean',
    instructions: 'Do notes or downstreamEffect mention a way to override or correct this decision after it has been made?',
  },
  decisionTriggersIrreversibleAction: {
    type: 'boolean',
    instructions: 'Does downstreamEffect describe an action that cannot be undone once taken — a delete, a send, a charge?',
    criteria: {
      true: 'downstreamEffect names an action with no described way back.',
      false: 'downstreamEffect names no such irreversible action, or describes the action as undoable.',
    },
  },
  reversalEffortLevel: {
    type: 'choice',
    instructions: 'Based on downstreamEffect and notes, how easily could a wrong decision here be undone?',
    criteria: {
      automatic_no_trace: 'Reversible freely, leaving no lasting trace.',
      reversible_with_followup_action: 'Reversible, but only with a specific follow-up action.',
      reversible_with_manual_effort: 'Reversible only with real manual effort.',
      not_reversible: 'Described as not reversible once acted on.',
    },
  },
  reversibilityStatedExplicitness: {
    type: 'score',
    instructions: 'How explicitly does the state address whether this decision is reversible?',
    criteria: [
      'Not mentioned at all.',
      'Implied indirectly, without being stated outright.',
      'Stated explicitly and directly.',
    ],
  },

  // ── 5.2 blast radius
  effectIsScopedToSingleItem: {
    type: 'boolean',
    instructions: 'Does downstreamEffect describe the consequence as limited to the one item or request being decided?',
  },
  effectPropagatesDownstream: {
    type: 'boolean',
    instructions: 'Does downstreamEffect state that the outcome feeds into further automated steps beyond this one?',
    criteria: {
      true: 'downstreamEffect names at least one further automated step that depends on this outcome.',
      false: 'downstreamEffect describes the outcome as terminal, with nothing further depending on it.',
    },
  },
  effectReachesExternalParty: {
    type: 'boolean',
    instructions: 'Does downstreamEffect state that the consequence is visible to or affects someone outside the immediate system — a customer, another team, a third party?',
    criteria: {
      true: 'A party outside the immediate system is named as affected.',
      false: 'No external party is named as affected.',
    },
  },
  effectInvolvesMoneyOrData: {
    type: 'boolean',
    instructions: 'Does downstreamEffect mention money, billing, or data leaving the system as a consequence of this decision?',
    criteria: {
      true: 'Money, billing, or outbound data is named as a consequence.',
      false: 'No such consequence is named.',
    },
  },
  blastRadiusBand: {
    type: 'score',
    instructions: 'Based on downstreamEffect, how far does a wrong decision here reach?',
    criteria: [
      'One local value or scratch state.',
      'One record or one user\'s data.',
      'A shared resource that multiple users depend on.',
      'Production, money, or data leaving the system.',
    ],
  },

  // ── 5.3 detectability of a wrong answer
  wrongAnswerProducesVisibleError: {
    type: 'boolean',
    instructions: 'Do downstreamEffect or notes state that a wrong decision here throws an error or produces a visible failure?',
    criteria: {
      true: 'A specific visible error or failure is described as the result of a wrong decision.',
      false: 'No visible error or failure is described.',
    },
  },
  wrongAnswerLooksLikeSuccess: {
    type: 'boolean',
    instructions: 'Does notes indicate a wrong decision here would look like a normal, successful outcome, with no visible symptom?',
    criteria: {
      true: 'notes states or implies a wrong decision is indistinguishable from a correct one at the time.',
      false: 'notes describes some way a wrong decision would look different from a correct one.',
    },
  },
  existingAlertingCoversThis: {
    type: 'boolean',
    instructions: 'Does notes mention an existing alert, test, or monitor that would catch a wrong decision here?',
    criteria: {
      true: 'A specific existing alert, test, or monitor is named.',
      false: 'No such alert, test, or monitor is named.',
    },
  },
  wrongAnswerDiscoveredDownstream: {
    type: 'boolean',
    instructions: 'Does notes state that mistakes here are typically discovered only later, in a different part of the system, rather than at the moment they happen?',
  },
  detectionTimingBand: {
    type: 'choice',
    instructions: 'Based on notes and downstreamEffect, when would a wrong decision here typically be noticed?',
    criteria: {
      immediately_at_call_time: 'Noticed immediately, at the moment the decision is made.',
      soon_in_normal_operation: 'Noticed soon after, in the course of normal operation.',
      only_with_deliberate_inspection: 'Noticed only if someone deliberately looks for it.',
      effectively_invisible: 'Described as effectively invisible without dedicated auditing.',
    },
  },

  // ── 5.4 whether a human is already in the loop
  humanInvolvementLevel: {
    type: 'choice',
    instructions: 'Based on currentMechanism and downstreamEffect, how involved is a person in this decision today?',
    criteria: {
      full_manual_review_every_time: 'A person reviews or approves this decision\'s output every time.',
      exception_only_review: 'A person is involved only when something unusual is flagged.',
      fully_automated_no_human: 'The decision acts immediately with no human step at all.',
      not_stated: 'The level of human involvement is not described.',
    },
  },
  removingHumanIsExplicitGoal: {
    type: 'boolean',
    instructions: 'Does notes state that reducing or removing the human step is a stated goal for this window?',
    criteria: {
      true: 'notes explicitly names removing or reducing human involvement as a goal.',
      false: 'notes does not name this as a goal.',
    },
  },
  humanReviewIsBottleneck: {
    type: 'boolean',
    instructions: 'Does notes mention that the current human-in-the-loop step is slow or a source of delay?',
    criteria: {
      true: 'notes explicitly describes the human step as slow or a delay.',
      false: 'notes does not describe the human step this way.',
    },
  },
  reviewerFeedbackIsRecorded: {
    type: 'boolean',
    instructions: 'Does notes mention that when a person reviews or overrides this decision, that correction gets recorded anywhere?',
  },
  reviewEffortLevel: {
    type: 'score',
    instructions: 'Based on notes, how much effort does a human review of this decision typically take?',
    criteria: ['A quick glance.', 'A moderate review.', 'A thorough, expert-level review.'],
  },
};

// ═══════════════════════════════════════════════════════════ registry

export const TAXONOMY: Record<string, string[]> = {
  '1.1': [
    'notesDescribeGroundTruthSource',
    'decisionLeavesObservableTrace',
    'outcomeObservableWithoutHuman',
    'proxySignalStrength',
    'currentMechanismOutputUsableAsWeakLabel',
  ],
  '1.2': [
    'decisionHasCheckableInvariant',
    'outputIsDiscreteValue',
    'downstreamEffectIsMachineObservable',
    'mechanismDeterminismLevel',
    'notesNameExistingTestOrAssertion',
  ],
  '1.3': [
    'functionNameIsConcrete',
    'fileIsSingleConcretePath',
    'decisionOutputStatedPlainly',
    'mechanismIsNamedSpecifically',
    'stateCompletenessForThisWindow',
  ],
  '1.4': [
    'callVolumeIsStated',
    'callVolumeBand',
    'mechanismRecurringAcrossCallSites',
    'sampleCollectionDescribed',
    'corpusGrowsPassively',
  ],
  '2.1': [
    'outputSpaceIsEnumerable',
    'outputIsSingleValue',
    'optionCountBand',
    'sameOutputTypeAcrossCalls',
    'decisionIsAtomic',
  ],
  '2.2': [
    'inputsNamedExplicitly',
    'decisionUsesOnlyCurrentInput',
    'requiresCrossItemComparison',
    'requiresCounterfactualReasoning',
    'decisionDependsOnGoalOrIntent',
  ],
  '2.3': [
    'mechanismCombinesMultipleConditions',
    'subConditionsAreNameable',
    'whatItDecidesReadsAsOneQuestion',
    'notesSuggestEdgeCases',
    'edgeCaseCountBand',
  ],
  '2.4': [
    'mechanismCounts',
    'mechanismDoesArithmetic',
    'mechanismComparesMagnitudes',
    'decisionRequiresGeneration',
    'mechanismRequiresRankingOrSorting',
  ],
  '3.1': [
    'mechanismShape',
    'mechanismAgeOrOriginStated',
    'mechanismLivesInline',
    'mechanismHasNamedConstants',
    'mechanismComplexityLevel',
  ],
  '3.2': [
    'notesDescribeKnownFailureMode',
    'failureDirection',
    'workaroundBurdenLevel',
    'failureIsSilent',
    'failureFrequencyBand',
  ],
  '3.3': [
    'mechanismAlreadyCheap',
    'baselineHasBeenTuned',
    'baselineAccuracyDescription',
    'simplerFixAlreadyConsidered',
    'baselineWasCopiedFromElsewhere',
  ],
  '3.4': [
    'decisionVisibilityScope',
    'changeWouldRequireApproval',
    'decisionHasExistingMonitoring',
    'mechanismIsDocumentedElsewhere',
    'noticeabilityBand',
  ],
  '4.1': [
    'volumeTrendStatedAsGrowing',
    'decisionRunsOnHotPath',
    'volumeImpactBand',
    'improvementScalesWithVolume',
    'volumeCadencePattern',
  ],
  '4.2': [
    'mechanismRunsSynchronously',
    'mechanismIsOnCriticalPath',
    'currentMechanismHasKnownCost',
    'fasterDecisionWouldRelieveBottleneck',
    'costReliefBand',
  ],
  '4.3': [
    'currentMechanismCannotHandleCase',
    'richerJudgmentWouldChangeOutcome',
    'capabilityIsNetNewOrRestoring',
    'blockingSeverityLevel',
    'improvementIsQualityNotSpeed',
  ],
  '4.4': [
    'mechanismPatternNamedAsCommon',
    'reuseScopeBand',
    'fixTransferabilityLevel',
    'domainGeneralityLevel',
    'sharedUtilityMaturity',
  ],
  '5.1': [
    'decisionOutputIsPersisted',
    'decisionCanBeOverriddenLater',
    'decisionTriggersIrreversibleAction',
    'reversalEffortLevel',
    'reversibilityStatedExplicitness',
  ],
  '5.2': [
    'effectIsScopedToSingleItem',
    'effectPropagatesDownstream',
    'effectReachesExternalParty',
    'effectInvolvesMoneyOrData',
    'blastRadiusBand',
  ],
  '5.3': [
    'wrongAnswerProducesVisibleError',
    'wrongAnswerLooksLikeSuccess',
    'existingAlertingCoversThis',
    'wrongAnswerDiscoveredDownstream',
    'detectionTimingBand',
  ],
  '5.4': [
    'humanInvolvementLevel',
    'removingHumanIsExplicitGoal',
    'humanReviewIsBottleneck',
    'reviewerFeedbackIsRecorded',
    'reviewEffortLevel',
  ],
};

/**
 * Judgements this set deliberately does NOT ask Jev — relational,
 * comparative, or arithmetic by construction (P21) — and what replaces them.
 */
export const MOVED_TO_CODE: Array<{ judgement: string; instead: string }> = [
  {
    judgement: 'Is this window more promising than another candidate window?',
    instead:
      'Score every window independently against WINDOWS_100 and rank by the recombined aggregate in code. There is no cross-item comparison in a single call — see GRAPH_EDGES\' "which of these 50 candidate edges are real?" failure mode.',
  },
  {
    judgement: 'How many call sites in the repo use this same mechanism?',
    instead: 'A deterministic grep or AST scan across the codebase, in code. Never ask it to count (P18).',
  },
  {
    judgement: 'Has call volume for this decision grown or shrunk over time?',
    instead: 'Arithmetic over a logged time series, in code, if such logs exist. A trend is a computation, not a read.',
  },
  {
    judgement: 'Is this window worth doing once engineering cost is weighed against payoff?',
    instead:
      'A cost-benefit formula in code over the PAYOFF and EXPOSURE category scores, with weights fitted on a small set of human-labeled example windows — the recombine step, never the model itself.',
  },
  {
    judgement: 'Is this the same underlying decision as another window already scored in this batch?',
    instead: 'Deduplicate on the (repo, file, functionName) key in code before scoring, or hash-compare whatItDecides text.',
  },
  {
    judgement: "Would fixing this window conflict or create a dependency cycle with fixing another window?",
    instead: 'Graph construction and cycle/topological-order checks in code, exactly as GRAPH_EDGES prescribes for "does this edge create a cycle?".',
  },
  {
    judgement: "Is the current mechanism's real-world accuracy above or below a field baseline for this kind of check?",
    instead:
      'Compute the mechanism\'s actual historical accuracy from logs or a labeled sample in code, then compare the two numbers directly — not a model\'s impression of "how well" from prose.',
  },
  {
    judgement: 'Should this window be tackled before or after other windows in the same file or repo?',
    instead: 'Sequencing/topological ordering in code once dependency edges between windows are known, not asked per-window.',
  },
  {
    judgement: 'Has anyone already tried this exact fix before, and did it fail?',
    instead: 'Search git blame, commit history, or the issue tracker in code; escalate to a text model with that retrieved history only if code search cannot resolve it. This is a counterfactual-over-time judgement, P21\'s core exclusion.',
  },
  {
    judgement: 'Do notes and whatItDecides actually agree with each other, or does one field contradict the other?',
    instead:
      'The tempting move: ask a boolean "is this internally consistent?". It reads two fields of the SAME state, so it looks literal, but it is really asking the model to hold two texts in tension and adjudicate between them — closer to the provenance judgement GRAPH_EDGES had to escalate. A deterministic keyword-overlap check in code catches gross mismatches; anything subtler goes to a text model, not a boolean.',
  },
  {
    judgement: 'What weight should each of the five categories get in the final composite score?',
    instead:
      "Fit weights in code by regressing against a small set of human-labeled example windows, per NETER.md's \"decompose, then recombine on the aggregate\" — never ask the model to weigh its own answers.",
  },
  {
    judgement: 'Is verifiableByCode actually true, or does this window only look verifiable from the description?',
    instead:
      'Run the existing test suite or a static verifier against the named file/function in code. The model cannot execute the codebase it is being told about, so asking it to double-check a claim about executability is asking it to guess.',
  },
];
