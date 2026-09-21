/**
 * Context triage with Jev — keep / drop / escalate, never summarize by default.
 *
 * The premise (borrowed from the field, not from the launch slide): compaction
 * destroys verbatim content, and most of what it destroys was cheap to keep.
 * A decision model can instead judge each tool output on its own merits and
 * keep the survivors byte-exact.
 *
 * Three design choices come straight from what practitioners reported working:
 *
 *   1. DECOMPOSE. One broad "should I keep this?" question underperforms. We ask
 *      six narrow, literal Nouls plus one Score, then recombine in code with a
 *      policy we own. The lift is the decomposition, not a cleverer prompt.
 *   2. FAN OUT. All seven questions ride one call against the same state, which
 *      costs about what one question costs.
 *   3. GATE AT THE ENDS. Confident answers get acted on; the middle band is a
 *      coin flip and goes to a cheap text model instead. That is the only place
 *      summarizing is allowed — as an escalation, not a default.
 *
 * The policy is deliberately ASYMMETRIC. Dropping a load-bearing measurement
 * costs a re-run or a wrong conclusion later; keeping a redundant directory
 * listing costs a few hundred tokens. So ties go to KEEP.
 *
 *   node --env-file-if-exists=/path/.env.local triage/triage.ts [items.json]
 */
import { experimental_evaluate as evaluate } from 'ai';
import { levelWeight, probWeight } from '../question-bank/colors.ts';
import { RunLog } from '../lib/telemetry.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { JEV, JEV_ID } from '../lib/jev.ts';

const MODEL = JEV_ID;
const ACT_CONFIDENCE = Number(process.env.ACT_CONFIDENCE ?? 0.8);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

type Item = {
  n: number;
  tool: string;
  call: string;
  chars: number;
  approxTokens: number;
  hadSecret: boolean;
  text: string;
  /** Deterministic containment against the durable corpus (supersede.py). */
  supersededCoverage?: number;
};

// --- the questions ----------------------------------------------------------
// Narrow, literal, and each one answerable from the output alone. None of them
// ask Jev to count or compare magnitudes — the documented failure mode.

const QUESTIONS = {
  hasFinding: {
    type: 'boolean',
    instructions:
      'Does this output contain a measurement, a number, a version, or a concrete result that a later decision could rest on?',
    criteria: {
      true: 'It reports data: timings, counts, versions, test results, prices, error codes, measured values.',
      false: 'It reports no data of its own — only progress, acknowledgement, or restated input.',
    },
  },
  hasIdentifier: {
    type: 'boolean',
    instructions:
      'Does this output contain a file path, identifier, URL, or exact name that would have to be looked up again if this text were discarded?',
  },
  cheaplyRepeatable: {
    type: 'boolean',
    instructions:
      'Could an identical output be produced again just by re-running the same command, with no cost beyond a moment of waiting?',
    criteria: {
      true: 'Deterministic and local: a directory listing, a file read, a type check, a version print.',
      false: 'Reproducing it would need a network call, a paid API request, a long build, or a state that has since changed.',
    },
  },
  snapshotOfMovingState: {
    type: 'boolean',
    instructions:
      'Is this output a snapshot of something that changes over time, so that the text is already potentially stale?',
    criteria: {
      true: 'A queue, a status check, a running process list, an in-progress listing, a live log tail.',
      false: 'A stable fact, a completed result, or content that does not drift.',
    },
  },
  emptyOrError: {
    type: 'boolean',
    instructions:
      'Is this output empty, a refusal, a permission denial, or otherwise free of usable information?',
    criteria: {
      true: 'Nothing usable: blank, "no matches", a denied permission, a bare acknowledgement.',
      false: 'It carries information, including informative failures that explain what went wrong.',
    },
  },
  recordsDecision: {
    type: 'boolean',
    instructions:
      'Does this output record a conclusion, verdict, or judgement, as opposed to raw unprocessed data?',
  },

  // --- the relational questions -------------------------------------------
  // Iteration 1 asked only whether an output was intrinsically valuable, and
  // almost every output is. What decides whether it can go is whether its
  // content has already been promoted somewhere durable, and whether the work
  // ahead still touches it. Both need the goal and the artifact list in state.

  oneTimeSetupSettled: {
    type: 'boolean',
    instructions:
      'Is this output a setup, install, authentication, or configuration step that completed successfully and will not need to be revisited?',
    criteria: {
      true: 'An install that succeeded, a login that completed, a version print, a type check that passed with no errors.',
      false: 'It is not a setup step, or it is a setup step that failed or left something unresolved.',
    },
  },
  density: {
    type: 'score',
    instructions:
      'How much of this text is load-bearing, as opposed to boilerplate, progress noise, or repetition?',
    criteria: [
      'Almost all noise — progress bars, banners, repeated lines.',
      'Mostly noise around one or two useful lines.',
      'Mixed: a substantial useful part inside routine output.',
      'Nearly every line carries information.',
    ],
  },
} as const;

// --- the policy, in code ----------------------------------------------------

type Verdict = 'KEEP' | 'DROP' | 'ESCALATE';

/** Distance from a coin flip, rescaled to 0 (no information) … 1 (certain). */
const conf = (p: number) => Math.abs(p - 0.5) * 2;

/**
 * Weights over the narrow signals. These are HAND-SET, which means they are a
 * guess: the field's consistent advice is to fit them on a few hundred of your
 * own labelled items, and a borrowed cut-off is worth less than a small local
 * one. They are exposed here so refitting is an edit, not a rewrite.
 *
 * Asymmetry is deliberate and is the whole safety property: KEEP_AT is close to
 * zero so weak evidence retains an item, while DROP_AT sits far out so nothing
 * is discarded without strong, converging evidence.
 */
const W = {
  hasFinding: 0.55,
  recordsDecision: 0.45,
  hasIdentifier: 0.3,
  density: 0.2, // gated at >= DENSE_AT, NOT divided — see colors.ts
  oneTimeSetupSettled: -1.1,
  emptyOrError: -1.4,
  cheaplyRepeatable: -0.5,
  snapshotOfMovingState: -0.4,
  /** Computed in code by supersede.py, not asked of the model. See P21. */
  supersededCoverage: -1.8,
} as const;

const DENSE_AT = Number(process.env.DENSE_AT ?? 2);  // ordinal gate on the density level
const KEEP_AT = Number(process.env.KEEP_AT ?? 0.25);
const DROP_AT = Number(process.env.DROP_AT ?? -0.75);

function decide(a: Record<string, number>, densityScore: number, coverage: number) {
  // One combined score from all seven signals, rather than a conjunction of
  // per-question confidences. A single uncertain answer now moves the score a
  // little instead of vetoing the whole decision.
  // Prob contributions scale directly; the Level contribution goes through an
  // ordinal gate. Dividing densityScore by 3 to make it Prob-shaped asserted
  // equal spacing between rubric levels, which P14 says is not licensed.
  const score =
    W.supersededCoverage * coverage +
    probWeight(a.hasFinding, W.hasFinding) +
    probWeight(a.recordsDecision, W.recordsDecision) +
    probWeight(a.hasIdentifier, W.hasIdentifier) +
    levelWeight(densityScore, DENSE_AT, W.density) +
    probWeight(a.oneTimeSetupSettled, W.oneTimeSetupSettled) +
    probWeight(a.emptyOrError, W.emptyOrError) +
    probWeight(a.cheaplyRepeatable, W.cheaplyRepeatable) +
    probWeight(a.snapshotOfMovingState, W.snapshotOfMovingState);

  // Distance past the nearer threshold, as a rough stand-in for how safe the
  // call is. Reported so the band can be audited, not used as a second gate.
  const certainty =
    score >= KEEP_AT ? Math.min(1, (score - KEEP_AT) / 1.0)
    : score <= DROP_AT ? Math.min(1, (DROP_AT - score) / 1.0)
    : 0;

  let verdict: Verdict =
    score >= KEEP_AT ? 'KEEP' : score <= DROP_AT ? 'DROP' : 'ESCALATE';

  // Two overrides that no score should be able to defeat.
  // A dense output is never silently discarded…
  if (verdict === 'DROP' && densityScore >= 2.5) verdict = 'ESCALATE';
  // …and neither is a real finding whose content appears in no durable file.
  // This is the safety property: unrecorded evidence is never discarded.
  if (verdict === 'DROP' && a.hasFinding >= 0.6 && coverage < 0.5) verdict = 'ESCALATE';

  return { verdict, certainty: +certainty.toFixed(3), score: +score.toFixed(3) };
}

// --- run --------------------------------------------------------------------

async function pool<T, R>(xs: readonly T[], n: number, f: (x: T, i: number) => Promise<R>) {
  const out: R[] = new Array(xs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, xs.length) }, async () => {
      for (let i = next++; i < xs.length; i = next++) out[i] = await f(xs[i], i);
    }),
  );
  return out;
}

/** What the work ahead actually is. Supersession is meaningless without it. */
const GOAL = process.env.GOAL ?? `Run three research passes over Jev use cases: (1) use a 100-question
depth-4 instrument to find research windows worth exploring, (2) use the JUPITER repo as the
knowledge-style exemplar for HTML courses, dashboards and graph networks with real UI testing,
(3) find what can actually be optimised in real executions. Separately: keep mapping common MCP
tool outputs, context7 especially. Jev's measured properties are already recorded in NETER.md.`;

/** Files that now hold the session's findings. Anything promoted into one of these is disposable. */
const DURABLE = [
  'JEV-works/NETER.md — every measured Jev property with its evidence and status',
  'jev-playground/experiments/results/*.json — raw data for batch scaling, state scaling, variance, adversarial',
  'jev-playground/interview/jev-adoption-v2.md — the lint-passing depth-4 interview instrument',
  'jev-playground/interview/critics/*.md — the four critic reports, verbatim',
  'jev-playground/interview/critics/CONSENSUS.md — the merged edit ledger',
  'jev-playground/README.md — setup, auth, gotchas',
  'a published findings page — the colour-coded ledger of measurements',
  'JEV-works/triage/triage-result.json — this triage manifest',
];

const itemsPath = process.argv[2] ?? new URL('./items.json', import.meta.url).pathname;
const items: Item[] = JSON.parse(await readFile(itemsPath, 'utf8'));

const log = new RunLog('context-triage');
log.announce({
  model: MODEL,
  items: items.length,
  questions: Object.fromEntries(
    Object.entries(QUESTIONS).map(([n, q]) => [
      n,
      (q as { type: string }).type === 'score'
        ? `score(${((q as { criteria: readonly string[] }).criteria).length})`
        : (q as { type: string }).type,
    ]),
  ),
  stateShape: `{tool, call, output(<=4k chars)} · ${items.reduce((a, i) => a + i.approxTokens, 0).toLocaleString()} tok total`,
  recombination: `weighted aggregate; KEEP >= ${KEEP_AT}, DROP <= ${DROP_AT}; supersession computed in code`,
  thresholdsFitted: false,
  maxRetries: 2,
});

const t0 = performance.now();
let failures = 0;

const results = await pool(items, CONCURRENCY, async item => {
  const callStart = performance.now();
  try {
    const { answers, usage } = await evaluate({
      model: JEV,
      // Only the state the question needs: what was called, and what came back.
      state: {
              tool: item.tool,
        call: item.call,
        output: item.text,
      },
      questions: QUESTIONS,
      maxRetries: 2,
      providerOptions: { gateway: { zeroDataRetention: true } },
    });

    const ms = performance.now() - callStart;
    const p = {
      oneTimeSetupSettled: answers.oneTimeSetupSettled.probability,
      hasFinding: answers.hasFinding.probability,
      hasIdentifier: answers.hasIdentifier.probability,
      cheaplyRepeatable: answers.cheaplyRepeatable.probability,
      snapshotOfMovingState: answers.snapshotOfMovingState.probability,
      emptyOrError: answers.emptyOrError.probability,
      recordsDecision: answers.recordsDecision.probability,
    };
    const { verdict, certainty, score } = decide(p, answers.density.score, item.supersededCoverage ?? 0);
    log.item(`${item.n}:${item.tool}`, {
      verdict, score, ms: Math.round(ms), inputTokens: usage.inputTokens ?? 0,
      coverage: item.supersededCoverage ?? 0,
    });
    return { ...item, text: undefined, p, density: answers.density.score, verdict, certainty, score, inputTokens: usage.inputTokens ?? 0 };
  } catch (error) {
    failures++;
    log.fail(`${item.n}:${item.tool}`, (error as Error).message);
    return { ...item, text: undefined, p: undefined, density: 0, verdict: 'ESCALATE' as Verdict, certainty: 0, score: 0, inputTokens: 0, error: (error as Error).message };
  }
});

const summary = log.done();
const ms = summary.p50;

// --- report -----------------------------------------------------------------

const by = (v: Verdict) => results.filter(r => r.verdict === v);
const toks = (rs: typeof results) => rs.reduce((s, r) => s + r.approxTokens, 0);
const total = toks(results);

const rows = (['KEEP', 'DROP', 'ESCALATE'] as Verdict[]).map(v => ({
  verdict: v,
  items: by(v).length,
  tokens: toks(by(v)).toLocaleString(),
  share: `${Math.round((toks(by(v)) / total) * 100)}%`,
}));

const w = [10, 6, 9, 6];
console.log(['verdict', 'items', 'tokens', 'share'].map((h, i) => h.padEnd(w[i])).join(' '));
console.log(w.map(n => '─'.repeat(n)).join(' '));
for (const r of rows) {
  console.log([r.verdict, String(r.items), r.tokens, r.share].map((c, i) => c.padEnd(w[i])).join(' '));
}

const dropped = toks(by('DROP'));
const inputTokens = results.reduce((s, r) => s + (r.inputTokens ?? 0), 0);

console.log(`\nreclaimed outright        ${dropped.toLocaleString()} tokens (${Math.round((dropped / total) * 100)}% of tool output)`);
console.log(`sent to a text model      ${by('ESCALATE').length} items / ${toks(by('ESCALATE')).toLocaleString()} tokens`);
console.log(`kept byte-exact           ${by('KEEP').length} items / ${toks(by('KEEP')).toLocaleString()} tokens`);
console.log(`\ncost of deciding          ${inputTokens.toLocaleString()} input tokens = $${((inputTokens * 0.042) / 1e6).toFixed(5)}`);
console.log(`wall clock                ${ms}ms for ${items.length} items (${Math.round(ms / items.length)}ms each, ${CONCURRENCY} concurrent)`);
if (failures) console.log(`failed                    ${failures} (defaulted to ESCALATE — never silently dropped)`);

// What got dropped, by tool — the sanity check that matters most.
const byTool = new Map<string, { drop: number; keep: number; esc: number }>();
for (const r of results) {
  const e = byTool.get(r.tool) ?? { drop: 0, keep: 0, esc: 0 };
  if (r.verdict === 'DROP') e.drop++;
  else if (r.verdict === 'KEEP') e.keep++;
  else e.esc++;
  byTool.set(r.tool, e);
}
console.log('\nby tool (keep / escalate / drop):');
for (const [tool, e] of [...byTool].sort((a, b) => b[1].keep + b[1].drop + b[1].esc - (a[1].keep + a[1].drop + a[1].esc))) {
  console.log(`  ${tool.padEnd(34)} ${String(e.keep).padStart(3)} / ${String(e.esc).padStart(3)} / ${String(e.drop).padStart(3)}`);
}

const scores = results.map(r => r.score).sort((a, b) => a - b);
const at = (q: number) => scores[Math.floor((scores.length - 1) * q)].toFixed(2);
console.log(`\nscore distribution        min ${at(0)} · p25 ${at(0.25)} · median ${at(0.5)} · p75 ${at(0.75)} · max ${at(1)}`);
console.log(`thresholds in force       KEEP >= ${KEEP_AT} · DROP <= ${DROP_AT}  (hand-set; refit on labelled items)`);

const out = new URL('./triage-result.json', import.meta.url).pathname;
await writeFile(out, JSON.stringify({ model: MODEL, ACT_CONFIDENCE, ms, inputTokens, rows, results }, null, 2) + '\n');
console.log(`\nfull manifest → ${out}`);
console.log('Nothing was deleted. This is a manifest; applying it is a separate, reversible step.');
