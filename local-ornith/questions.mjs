/**
 * Three stages, in the shape of ../leads/questions.ts.
 *
 * Stage 1 decides WHERE a task runs. Stage 2 decides WHAT it needs loaded
 * (the token-consumption lever). Stage 3 grades an artifact that came back.
 *
 * Every question is LITERAL — answerable by reading the state in front of it
 * (NETER P21 / LESSONS L3). Anything greppable, countable, or cross-record is
 * in notForJev and lives in code-gates.mjs. The single most common way to waste
 * a Jev call is to ask it something `grep` already knows.
 */

// ───────────────────────────────────────────── stage 1 — where does this run

export const STAGE1_TRIAGE = {
  context: 'Route a task to a fleet member.',
  produces: 'taskKind + the three signals that feed localFitness',
  questions: {
    taskKind: {
      type: 'choice',
      instructions: 'What kind of work does this request ask for?',
      criteria: {
        shellOrFile: 'Run a command, inspect or list files, read or grep a named path, check a version.',
        lookup: 'Retrieve a fact from the open web or from documentation.',
        localEdit: 'Change code in a named file or function, where the change is described in the text.',
        explain: 'Summarise, describe, or explain something already supplied in the text.',
        buildOrDesign: 'Design, architect, or implement something spanning several files or decisions.',
        debug: 'Diagnose a failure whose cause is not stated in the text.',
      },
    },
    fullySpecified: {
      type: 'boolean',
      instructions: 'Does the request state exactly what to do, such that two competent people would produce the same result?',
      criteria: {
        true: 'The action, the target, and the finish condition are all named in the text.',
        false: 'Any of the action, the target, or the finish condition is left open.',
      },
    },
    multiStepByOwnWords: {
      type: 'boolean',
      instructions: 'Does the text itself describe more than one step that must happen in order?',
      criteria: {
        true: 'The text names a sequence, e.g. "then", "after that", or a numbered list.',
        false: 'The text describes a single action, however large.',
      },
    },
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
    // LESSONS L2 (local): the first version asked "needs information not in the
    // request?" and answered TRUE at 0.97 for `git status` - correctly, since you
    // must look at the repo. But that penalised exactly the filesystem access a
    // local bash agent is FOR. The question must name the SOURCE, not the mere
    // fact of needing a lookup.
    needsInternet: {
      type: 'boolean',
      instructions: 'Would answering require the public internet or an external online service?',
      criteria: {
        true: 'It needs a web page, a remote API, current events, or documentation not stored on this machine.',
        false: 'Everything needed is in the request or already on this machine, including its files and repos.',
      },
    },
  },
  notForJev: [
    { judgement: 'Does this fit the local context window?', instead: 'Token count vs served n_ctx. Arithmetic.' },
    { judgement: 'Are slots free right now?', instead: 'GET /slots. A fact.' },
    { judgement: 'Is this too hard for a 3B-active model?', instead: 'Not readable from one request. Use the aggregate, then verify the output.' },
  ],
  recombine: 'localFitness = mean of five oriented terms; one threshold. Never a conjunction (L1).',
  status: 'measured',
};

// ──────────────────────────────── stage 2 — what must be loaded (token lever)

export const STAGE2_CAPABILITY = {
  context: 'Decide which tools and which specialist skill a task actually needs.',
  produces: 'tool class + whether to load a skill, and which one',
  questions: {
    toolClass: {
      type: 'choice',
      instructions: 'What kind of tool access does this task require?',
      criteria: {
        shell: 'Running commands, inspecting the filesystem, checking processes.',
        fileEdit: 'Writing or modifying files on disk.',
        web: 'Fetching a page or searching the internet.',
        vision: 'Looking at an image, screenshot, or rendered page.',
        none: 'Can be answered from the text alone, with no tools.',
      },
    },
    needsSpecialistSkill: {
      type: 'boolean',
      instructions: 'Does this task call for specialist domain knowledge beyond ordinary competent engineering?',
      criteria: {
        true: 'It names a craft with its own conventions - visual design, data visualisation, typography, accessibility, security review.',
        false: 'Ordinary engineering judgement is enough.',
      },
    },
    skillDomain: {
      type: 'choice',
      instructions: 'Which specialist domain does this task sit in?',
      criteria: {
        design: 'Visual design, layout, typography, colour, brand.',
        dataviz: 'Charts, graphs, dashboards, encoding data visually.',
        docs: 'Writing documentation, explanations, or teaching material.',
        testing: 'Tests, coverage, assertions, test strategy.',
        infra: 'Deployment, containers, CI, cloud configuration.',
        none: 'No specialist domain applies.',
      },
    },
  },
  notForJev: [
    { judgement: 'Which skills exist on this machine?', instead: 'Read the skills directory. A listing.' },
    { judgement: 'How many tokens does that skill cost to load?', instead: 'wc on the SKILL.md. Arithmetic.' },
    { judgement: 'Has this skill helped before on similar tasks?', instead: 'A log lookup, never a model.' },
  ],
  recombine:
    'Load a skill only when needsSpecialistSkill sits at the TRUE end (>= END_HI) AND ' +
    'skillDomain entropy is low. A mid-band answer means do not load - the default of ' +
    'loading nothing is cheap and correct more often than not.',
  status: 'drafted',
};

// ───────────────────────────── stage 3 — grade an artifact that came back

export const STAGE3_ARTIFACT = {
  context: 'Grade a produced HTML artifact found in a conversation history.',
  produces: 'a quality verdict + whether it needs a rebuild by a stronger model',
  questions: {
    contentKind: {
      type: 'choice',
      instructions: 'What kind of content fills this page?',
      criteria: {
        real: 'Specific, concrete content about an actual subject, with real numbers or names.',
        placeholder: 'Lorem ipsum, TODO markers, "Item 1 / Item 2", or obviously invented filler.',
        mixed: 'A real subject, but substantial stretches of filler or repeated stub content.',
      },
    },
    statesItsPurpose: {
      type: 'boolean',
      instructions: 'Does the visible text on the page say what the page is for?',
      criteria: {
        true: 'A heading or intro states the subject and the point of the page.',
        false: 'The reader must infer the purpose from fragments.',
      },
    },
    looksTemplated: {
      type: 'boolean',
      instructions: 'Does this read as a generic template rather than something made for this subject?',
      criteria: {
        true: 'Generic section names and boilerplate that would suit any topic unchanged.',
        false: 'Structure and wording are specific to the subject.',
      },
    },
    substance: {
      type: 'score',
      instructions: 'How much genuine informational substance does the page carry?',
      criteria: [
        'Effectively empty - a shell.',
        'A heading and a sentence or two.',
        'A developed page with several real sections.',
        'Dense, with data, detail, and structure throughout.',
      ],
    },
  },
  notForJev: [
    { judgement: 'Does it have a dark-mode block?', instead: 'grep prefers-color-scheme. Never a model.' },
    { judgement: 'Does it load a disallowed CDN?', instead: 'Regex over script/link src against the allowlist.' },
    { judgement: 'How big is it?', instead: 'Byte count.' },
    { judgement: 'Is it responsive at phone width?', instead: 'Render it, or grep the viewport meta and media queries.' },
    { judgement: 'Does the JavaScript actually work?', instead: 'Execute it. A model reading source cannot tell you this.' },
  ],
  recombine:
    'rebuild when contentKind is placeholder, OR substance <= 1, OR looksTemplated sits at ' +
    'the TRUE end. Grade on ENDS (0.15 / 0.85), never on which side of 0.5 a probability falls.',
  status: 'drafted',
};
