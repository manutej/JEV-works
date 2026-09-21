/**
 * FLEET_ROUTING — which member of the open-source + Claude fleet should run a task.
 *
 * Follows the house rules in ../question-bank/bank.ts:
 *   · Every question below is LITERAL — answerable by reading the request text
 *     alone (NETER P21 / LESSONS L3). Anything needing a goal, a repo, or a
 *     counterfactual is in notForJev and computed in code.
 *   · Recombination is ONE aggregate score with ONE threshold. Never a
 *     conjunction of per-question confidences (L1).
 *   · Gate on entropy of the choice, not on top probability.
 */

export const FLEET_ROUTING = {
  context: 'Model routing — pick a fleet member for an incoming task.',
  produces: 'one model id + an escalate flag + the aggregate that decided it',

  questions: {
    // The single most informative signal: what kind of work is being asked for.
    taskKind: {
      type: 'choice',
      instructions: 'What kind of work does this request ask for?',
      criteria: {
        shellOrFile:
          'Run a command, inspect or list files, read or grep a named path, check a version.',
        lookup:
          'Retrieve a fact from the open web or from documentation.',
        localEdit:
          'Change code in a named file or function, where the change is described in the text.',
        explain:
          'Summarise, describe, or explain something already supplied in the text.',
        buildOrDesign:
          'Design, architect, or implement something spanning several files or decisions.',
        debug:
          'Diagnose a failure whose cause is not stated in the text.',
      },
    },

    // Literal: is the instruction complete on its face?
    fullySpecified: {
      type: 'boolean',
      instructions:
        'Does the request state exactly what to do, such that two competent people would produce the same result?',
      criteria: {
        true: 'The action, the target, and the finish condition are all named in the text.',
        false: 'Any of the action, the target, or the finish condition is left open.',
      },
    },

    // Literal: does the text itself name more than one dependent step?
    multiStepByOwnWords: {
      type: 'boolean',
      instructions:
        'Does the text itself describe more than one step that must happen in order?',
      criteria: {
        true: 'The text names a sequence, e.g. "then", "after that", or a numbered list.',
        false: 'The text describes a single action, however large.',
      },
    },

    // Literal: how big is the expected answer? Long answers cost local tok/s.
    outputSize: {
      type: 'score',
      instructions: 'How much output does this request call for?',
      criteria: [
        'A single value, path, or one line.',
        'A short paragraph or a handful of lines.',
        'A page: a function, a file, or a structured explanation.',
        'Many pages across several files or sections.',
      ],
    },

    // Literal: does answering require material not present in the request?
    needsOutsideKnowledge: {
      type: 'boolean',
      instructions:
        'Would answering require information not present in the request text?',
      criteria: {
        true: 'It refers to a codebase, a live service, current events, or external docs.',
        false: 'Everything needed to answer is written in the request.',
      },
    },
  },

  /**
   * Deliberately NOT asked of Jev. Each of these is either arithmetic, a lookup,
   * or genuine reasoning — the three things LESSONS L3 says it will sit mid-band on.
   */
  notForJev: [
    { judgement: 'Does this fit in the local context window?',
      instead: 'Count tokens in code against the served n_ctx. Arithmetic, never a model.' },
    { judgement: 'Is a web search actually available right now?',
      instead: 'Capability table in code — the local fleet has no WebSearch tool at all.' },
    { judgement: 'Are there free slots on the local server?',
      instead: 'GET /slots on llama-server. A fact, not a judgement.' },
    { judgement: 'Is this task too hard for a 3B-active model?',
      instead: 'Not answerable by reading one request. Use the aggregate below, and let ' +
               'the verification step catch failures rather than predicting them.' },
    { judgement: 'Did the local model get this right?',
      instead: 'Run the assertion in code, or escalate the output to Claude for review.' },
  ],

  recombine:
    'localFitness = mean of: P(fullySpecified), 1-P(multiStepByOwnWords), ' +
    '1-P(needsOutsideKnowledge), kindAffinity(taskKind), 1-(outputSize/3). ' +
    'Route local when localFitness >= LOCAL_AT and entropy(taskKind) <= MAX_ENTROPY ' +
    'and the code-side gates (context, tools, slots) all pass. One threshold, one aggregate.',

  status: 'drafted',
};

/** How well each task kind suits a small local model. Hand-set (LESSONS L6). */
export const KIND_AFFINITY = {
  shellOrFile: 1.0,
  explain: 0.8,
  localEdit: 0.6,
  lookup: 0.3,   // local fleet has no web access; code gate usually vetoes anyway
  debug: 0.2,
  buildOrDesign: 0.0,
};
