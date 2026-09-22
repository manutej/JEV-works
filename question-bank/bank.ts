/**
 * QUESTION BANK — reusable Jev question sets, by context.
 *
 * The question is the product. These are starting points that already respect
 * what Jev can answer, so you spend your time on thresholds and weights rather
 * than rediscovering the same failure modes.
 *
 * THE RULE THAT ORGANISES THIS FILE (see NETER.md P21):
 *   LITERAL questions — answerable from the state in front of it, by reading —
 *   get confident answers. RELATIONAL questions — requiring reasoning across a
 *   goal, a history, or a counterfactual — sit in the mid band forever and
 *   should be computed in code or escalated to a text model. Every set below
 *   marks which is which, and names the code that replaces the relational ones.
 *
 * HOUSE RULES baked into every set here:
 *   · Narrow and literal. One judgement per question, no double-barrels.
 *   · Never ask it to count, total, compare magnitudes, or do date arithmetic.
 *   · Decompose, then recombine on the AGGREGATE — never on a conjunction of
 *     per-question confidences, which escalates everything.
 *   · Send only the state the question needs. Accuracy falls as irrelevant
 *     detail grows.
 *   · Fan out freely: questions are nearly free, state is the scarce resource.
 *   · Gate on entropy, not top probability — it answers garbage confidently.
 */

export type JevQuestion =
  | { type: 'boolean'; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type QuestionSet = {
  /** What job this set is for. */
  context: string;
  /** What you get out, once recombined in code. */
  produces: string;
  /** Jev-answerable questions. All literal. */
  questions: Record<string, JevQuestion>;
  /** Judgements this set deliberately does NOT ask Jev, and what to do instead. */
  notForJev: Array<{ judgement: string; instead: string }>;
  /** How to turn the answers into the output. */
  recombine: string;
  /** Status of the set itself. */
  status: 'measured' | 'drafted' | 'suspect';
};

// ───────────────────────────────────────────────────────────── routing

export const ROUTING: QuestionSet = {
  context: 'Routing — inbox, ticket desk, intent, which-model, which-queue.',
  produces: 'one destination + an auto-route/review flag',
  questions: {
    destination: {
      type: 'choice',
      instructions: 'Which queue should own this message?',
      // Replace these with YOUR queues. Keep descriptions disjoint; overlapping
      // descriptions are the most common cause of a flat distribution.
      criteria: {
        billing: 'Charges, invoices, refunds, plan changes.',
        technical: 'Errors, outages, integration and API problems.',
        account: 'Login, access, permissions, seats.',
        other: 'Fits none of the above.',
      },
    },
    actionable: {
      type: 'boolean',
      instructions: 'Is there enough here to act on without asking a clarifying question first?',
    },
    urgentByOwnWords: {
      type: 'boolean',
      instructions: 'Does the message itself state a deadline, an outage, or money at risk?',
      criteria: {
        true: 'The text names a time limit, a stoppage, or a financial consequence.',
        false: 'No such claim is made in the text, whatever the tone.',
      },
    },
  },
  notForJev: [
    { judgement: 'Is this the same issue as an open ticket?', instead: 'Embedding or key match in code, against your ticket store.' },
    { judgement: 'Has this customer contacted us before?', instead: 'A database lookup. Never a model.' },
    { judgement: 'How long has this been waiting?', instead: 'Arithmetic on timestamps, in code.' },
  ],
  recombine:
    'Auto-route when entropy(destination) is low AND actionable is at an end. Otherwise human queue. ' +
    'urgentByOwnWords raises priority but never changes the destination.',
  status: 'drafted',
};

// ──────────────────────────────────────────────────────── classification

export const CLASSIFICATION: QuestionSet = {
  context: 'Classification of short text — spam, safety, topic, sentiment, fraud signals.',
  produces: 'a label + a confidence band',
  questions: {
    label: {
      type: 'choice',
      instructions: 'Which single category best describes this text?',
      criteria: { /* your labels — keep under 255, keep them disjoint */ } as Record<string, string>,
    },
    onTopic: {
      type: 'boolean',
      instructions: 'Is this text about the subject the categories describe at all?',
      criteria: {
        true: 'It concerns the domain the labels come from.',
        false: 'It is off-topic, empty, or unrelated to any of them.',
      },
    },
  },
  notForJev: [
    { judgement: 'Is this a near-duplicate of something already classified?', instead: 'Hashing or embeddings in code.' },
    { judgement: 'Whole-document classification.', instead: 'Pre-extract the relevant span, then ask. Long input is the documented weak task.' },
  ],
  recombine:
    'onTopic is the abstain gate and must be checked FIRST — a low onTopic with a confident label ' +
    'is the signature failure (it answers garbage confidently). Only then read label.',
  status: 'drafted',
};

// ────────────────────────────────────────────────────── rubric scoring

export const RUBRIC: QuestionSet = {
  context: 'Rubric and quality scoring — answers, résumés, submissions, generated sections.',
  produces: 'per-criterion levels, combined by weights you own',
  questions: {
    completeness: {
      type: 'score',
      instructions: 'How completely does this cover what was asked?',
      criteria: [
        'Does not address the request.',
        'Addresses part of it, with obvious gaps.',
        'Addresses all of it, thinly in places.',
        'Addresses all of it with substance throughout.',
      ],
    },
    supported: {
      type: 'score',
      instructions: 'How well are the claims here supported by evidence present in the text itself?',
      criteria: [
        'Assertions with nothing behind them.',
        'Some support, mostly gestured at.',
        'Most claims carry a specific referent.',
        'Every claim names its evidence.',
      ],
    },
    containsUnsupportedNumber: {
      type: 'boolean',
      instructions: 'Does this text state a figure or statistic without saying where it came from?',
    },
  },
  notForJev: [
    { judgement: 'Is this number correct?', instead: 'Check it in code against the source. It cannot do arithmetic or verify facts.' },
    { judgement: 'Is this better than the previous version?', instead: 'Score both separately and compare in code. It sees one state at a time.' },
    { judgement: 'Interpolating score magnitudes.', instead: 'Treat levels as ordinal. Score calibration is weak; a 1.5 is not "halfway".' },
  ],
  recombine:
    'Weighted sum with weights fitted on your own graded examples. Read the level distribution, ' +
    'not just the scalar — a mid score from a split distribution means disagreement, not mediocrity.',
  status: 'drafted',
};

// ───────────────────────────────────────────────────────── tool gating

export const TOOL_GATE: QuestionSet = {
  context: 'Tool gating — deciding whether a tool call needs human approval. The measured pattern: 41% fewer prompts over 1,013 real calls, 0 unsafe auto-approvals of 94.',
  produces: 'auto-approve / prompt / refuse',
  questions: {
    mutatesState: {
      type: 'boolean',
      instructions: 'Would running this change anything outside the process — files, records, remote state?',
      criteria: {
        true: 'It writes, deletes, deploys, sends, or modifies something.',
        false: 'It only reads or computes.',
      },
    },
    reversible: {
      type: 'boolean',
      instructions: 'If this turns out to be wrong, could the change be undone without losing anything?',
    },
    spendsOrSends: {
      type: 'boolean',
      instructions: 'Does this spend money, or send data to a party outside this machine?',
    },
    blastRadius: {
      type: 'score',
      instructions: 'How much is affected if this call does the wrong thing?',
      criteria: [
        'One local file or a scratch value.',
        'A working directory or one record.',
        'A shared resource others depend on.',
        'Production, money, or data that leaves.',
      ],
    },
  },
  notForJev: [
    { judgement: 'Is this command on the allowlist?', instead: 'Exact matching in code. Deterministic, auditable, free.' },
    { judgement: 'Did the user already approve something like this?', instead: 'Session state lookup in code.' },
    { judgement: 'Is this command injection-safe?', instead: 'A parser, not a classifier. It offers no injection guarantee.' },
  ],
  recombine:
    'Refuse outright on spendsOrSends AND NOT reversible. Prompt when blastRadius >= 2. Auto-approve ' +
    'only when mutatesState is confidently false. Gate hardest where being wrong is irreversible — ' +
    'a 0.8 that reads a file is not a 0.8 that deploys.',
  status: 'drafted',
};

// ───────────────────────────────────────────────────── context triage

export const CONTEXT_TRIAGE: QuestionSet = {
  context: 'Context triage — keep verbatim / drop / escalate, instead of summarising everything. This set is MEASURED: 119 outputs, iteration 3 of ../triage/.',
  produces: 'a per-output disposition manifest',
  questions: {
    hasFinding: {
      type: 'boolean',
      instructions:
        'Does this output contain a measurement, a number, a version, or a concrete result that a later decision could rest on?',
      criteria: {
        true: 'It reports data: timings, counts, versions, test results, prices, error codes.',
        false: 'It reports no data of its own — only progress, acknowledgement, or restated input.',
      },
    },
    oneTimeSetupSettled: {
      type: 'boolean',
      instructions:
        'Is this a setup, install, authentication, or configuration step that completed successfully and will not need revisiting?',
      criteria: {
        true: 'An install that succeeded, a login that completed, a type check that passed clean.',
        false: 'Not a setup step, or one that failed or left something unresolved.',
      },
    },
    emptyOrError: {
      type: 'boolean',
      instructions: 'Is this output empty, a refusal, a denial, or otherwise free of usable information?',
    },
    density: {
      type: 'score',
      instructions: 'How much of this text is load-bearing, rather than boilerplate or progress noise?',
      criteria: [
        'Almost all noise.',
        'Mostly noise around one or two useful lines.',
        'Mixed: a substantial useful part inside routine output.',
        'Nearly every line carries information.',
      ],
    },
  },
  notForJev: [
    {
      judgement: 'Has this content already been recorded in a durable file? (supersession)',
      instead:
        'DETERMINISTIC containment in code — extract distinctive tokens (numbers, paths, identifiers) ' +
        'and check them against the durable corpus. See ../triage/supersede.py. Asked as a question it ' +
        'never exceeded p=0.78; computed in code it produced 24x the reclaim at zero cost.',
    },
    {
      judgement: 'Could this output be cheaply re-run? (regenerability)',
      instead:
        'A lookup on the TOOL NAME, in code. Read/Glob/Grep/local Bash are regenerable; WebFetch, ' +
        'a paid API call, or an agent spawn are not. Found by measure-confidence.ts on this very set: ' +
        '17% at the ends, mean confidence 0.427 — it was reading the text to answer a question the ' +
        'metadata already settles.',
    },
    {
      judgement: 'Would discarding this change what happens next? (forward need)',
      instead:
        'A text model, on the escalate band only. Reached the ends on 7% of items and never exceeded ' +
        'p=0.67 — the clearest measured case of a question that belongs elsewhere.',
    },
  ],
  recombine:
    'Weighted aggregate, asymmetric thresholds (easy to keep, hard to drop). Never drop a finding whose ' +
    'content appears in no durable file — that is the safety property. Escalate, never silently discard.',
  status: 'measured',
};

// ──────────────────────────────────────────────── retrieved-doc relevance

export const DOC_RELEVANCE: QuestionSet = {
  context:
    'Retrieved-documentation relevance — a pre-filter in front of doc chunks from context7, a search, or a crawl, before they enter a prompt.',
  produces: 'per-chunk admit / discard',
  questions: {
    answersTheQuestion: {
      type: 'boolean',
      instructions:
        'Does this chunk contain the specific information the stated question asks for, rather than merely being about the same topic?',
      criteria: {
        true: 'The answer is present in this text.',
        false: 'Same subject area, but the specific answer is not here.',
      },
    },
    isApiSurface: {
      type: 'boolean',
      instructions: 'Does this chunk define a callable surface — a signature, parameters, types, or return shape?',
    },
    isRunnableExample: {
      type: 'boolean',
      instructions: 'Does this chunk contain code that could be run or copied as-is?',
    },
    versionRisk: {
      type: 'boolean',
      instructions: 'Does this text refer to a version, deprecation, or migration, so that it might describe behaviour that has since changed?',
    },
    specificity: {
      type: 'score',
      instructions: 'How specific is this text about how to actually do the thing?',
      criteria: [
        'Marketing or conceptual overview.',
        'Explains the idea without the mechanics.',
        'Gives the mechanics in prose.',
        'Gives exact names, signatures, or code.',
      ],
    },
  },
  notForJev: [
    { judgement: 'Is this chunk a duplicate of another chunk?', instead: 'Hashing or embeddings in code — it evaluates one state at a time.' },
    { judgement: 'Which of these 20 chunks is best?', instead: 'Score each separately, rank in code. There is no cross-item comparison.' },
    { judgement: 'Is this documentation current?', instead: 'Compare against the installed package version in code. versionRisk only flags that a version is mentioned.' },
  ],
  // KNOWN HOLE (P34, OC gate 2026-09-22): the second branch never checks relevance, so an off-topic chunk
  // that contains code is admitted. Proposed fix in program/OC-REPORT.md; not applied until re-frozen and re-gated.
  recombine:
    'Admit on answersTheQuestion, or on (isApiSurface OR isRunnableExample) with specificity >= 2. ' +
    'Route versionRisk chunks to a version check rather than discarding them. Rank admitted chunks ' +
    'by specificity in code.',
  status: 'drafted',
};

// ───────────────────────────────────────────── generated-course QA

export const COURSE_QA: QuestionSet = {
  context: 'Quality gate on generated teaching content — a course section, an explainer beat, a walkthrough step.',
  produces: 'ship / revise / regenerate, per section',
  questions: {
    teachesOneThing: {
      type: 'boolean',
      instructions: 'Does this section teach a single idea, rather than several at once?',
    },
    assumesUndefinedTerm: {
      type: 'boolean',
      instructions: 'Does this text use a technical term that it never defines and that a beginner would not know?',
    },
    hasConcreteExample: {
      type: 'boolean',
      instructions: 'Does this section include a specific example, rather than only a general description?',
    },
    plainLanguage: {
      type: 'score',
      instructions: 'How understandable is this to someone who does not write code?',
      criteria: [
        'Unreadable without the codebase in front of you.',
        'Needs programming background.',
        'Mostly plain, with occasional jargon.',
        'Plain throughout; jargon is always unpacked.',
      ],
    },
  },
  notForJev: [
    { judgement: 'Is this explanation factually right about the code?', instead: 'A text model with the source in context, or a test. It cannot verify against a codebase.' },
    { judgement: 'Does this follow from the previous section?', instead: 'Cross-section coherence needs the whole sequence — score pairs explicitly or use a text model.' },
  ],
  recombine:
    'Regenerate on assumesUndefinedTerm at an end. Revise when plainLanguage <= 1 or hasConcreteExample is ' +
    'confidently false. Ship otherwise. Run it over every section in one batch per section — the questions are free.',
  status: 'drafted',
};

// ──────────────────────────────────────────── dashboard surfacing

export const DASHBOARD_SURFACING: QuestionSet = {
  context: 'Deciding what a dashboard surfaces — which of many incoming items earns a tile, a badge, or an alert.',
  produces: 'surface / fold / suppress, plus a severity band',
  questions: {
    needsAHuman: {
      type: 'boolean',
      instructions: 'Does this item require a person to do something, as opposed to being informational?',
    },
    selfResolving: {
      type: 'boolean',
      instructions: 'Does this describe something that will clear on its own without intervention?',
    },
    severity: {
      type: 'score',
      instructions: 'How bad is the described situation for the people who depend on this system?',
      criteria: ['Cosmetic.', 'Degraded, workaround exists.', 'Blocking.', 'Data or money at risk.'],
    },
    namesTheCause: {
      type: 'boolean',
      instructions: 'Does this item state what caused the problem, rather than only its symptom?',
    },
  },
  notForJev: [
    { judgement: 'Is this the same alert as the last 40?', instead: 'Deduplication in code — grouping key, then count.' },
    { judgement: 'Is this trending worse?', instead: 'Arithmetic over a time series, in code.' },
    { judgement: 'How many are there?', instead: 'Counting. Never ask it to count.' },
  ],
  recombine:
    'Suppress when selfResolving is confidently true and severity <= 1. Surface when needsAHuman is at an end. ' +
    'namesTheCause decides whether the tile shows a cause line or a "needs triage" chip.',
  status: 'drafted',
};

// ──────────────────────────────────────────── graph edge typing (suspect)

export const GRAPH_EDGES: QuestionSet = {
  context:
    'Typing edges and nodes in a graph or knowledge network. MARKED SUSPECT: relationship judgements are ' +
    'inherently relational, and P21 says those sit in the mid band. Test before trusting.',
  produces: 'an edge type per candidate pair, with a review flag',
  questions: {
    relationship: {
      type: 'choice',
      instructions:
        'Reading the two items in the state, which relationship does the FIRST have to the SECOND?',
      criteria: {
        depends_on: 'The first cannot work or make sense without the second.',
        specialises: 'The first is a narrower case of the second.',
        contradicts: 'They cannot both be true or both be done.',
        mentions: 'The first merely refers to the second.',
        unrelated: 'No meaningful relationship.',
      },
    },
  },
  notForJev: [
    {
      judgement: 'Is the relationship directional — would it be false if the two items were swapped?',
      instead:
        'A STATIC TABLE keyed by the relationship label, because directionality is a property of the ' +
        'label and not of the pair: depends_on → directional, specialises → directional, mentions → ' +
        'directional, contradicts → symmetric, unrelated → n/a. Measured at **0% at the ends** across ' +
        '16 pairs, mean confidence 0.208 — the worst result in the whole bank. It asks for a ' +
        'counterfactual ("if these were swapped"), which cannot be read off one state.',
    },
    {
      judgement: 'Is this relationship stated explicitly, or did you infer it?',
      instead:
        'A text-model call, and ONLY on edges that already cleared the relationship question\'s ' +
        'confident band. Asking it of every candidate pair is what drove it to 6% at the ends. ' +
        'Provenance-of-a-claim is P21 shape.',
    },
    { judgement: 'Does this edge create a cycle?', instead: 'Graph traversal in code.' },
    { judgement: 'Is this edge redundant given the others?', instead: 'Transitive reduction in code. It sees one pair at a time.' },
    { judgement: 'Which of these 50 candidate edges are real?', instead: 'One call per pair, then threshold. No cross-pair comparison exists.' },
  ],
  recombine:
    'DO NOT SHIP AS-IS. Measured 2026-09-19 on 16 real pairs: `relationship` is only MARGINAL (38% at ' +
    'the ends, mean confidence 0.465) and both of its former gating questions failed outright. Until ' +
    'the relationship question itself is sharpened — disjoint criteria, or a narrower relation set — ' +
    'this set accepts almost nothing cleanly. Treat a confident `relationship` as a candidate, derive ' +
    'direction from the static table, and escalate provenance to a text model.',
  status: 'suspect',
};

// ───────────────────────────────────────────────────────── registry

export const BANK = {
  ROUTING,
  CLASSIFICATION,
  RUBRIC,
  TOOL_GATE,
  CONTEXT_TRIAGE,
  DOC_RELEVANCE,
  COURSE_QA,
  DASHBOARD_SURFACING,
  GRAPH_EDGES,
} as const;

export type BankKey = keyof typeof BANK;
