# Pass 1 — collected findings

Scans run by subagents, kept out of the main thread. Each section names its source scan.
Status: all four scans complete — `scout-jupiter` ✅ · `scout-fable` ✅ · `scout-transcripts` ✅ · `validate-bank` ✅

---

## The two findings that change the plan

**1 · There is no labelled data on this machine.** `CETI/fable-prompts` was the best candidate and
the answer is a blunt no. Every label-like field (`level`, `domain`, `gate_family`, `predicates`,
`trace_features`) is **metadata the generation pipeline assigned to itself while authoring the
record** — not an independent judgement of whether a response was right. `verification_gate` is a
runnable snippet each record wrote to check *its own arithmetic*; it cannot grade another model's
output. No answer key, no distractors, no closed answer space, no recorded disagreement.

Consequence: `NETER.md` **P20 stays open** and no accuracy bar can be stated for any Jev use case
yet. Everything measurable without labels — answerability (P21), confidence spread, latency, cost,
determinism — remains open to us. Everything requiring a ground truth does not. Building a
labelling layer is a separate project, not a step in this one.

The nearest usable primitive is the `verification_gate` idea itself: **an item that carries its own
runnable check.** That generalises — a decision site whose correctness can be verified by code
needs no human labels.

**2 · JUPITER contains no HTML at all.** `find -iname "*.html"` returns empty. No CSS, no snapshot
tests, no accessibility or visual-regression tooling; jest covers `src/**/*.ts` only. So the pass-2
targets — HTML courses, dashboards, graph networks, video explainers — cannot be retrofitted onto
an existing pipeline there, because there is no pipeline. They have to be built, with the decision
layer designed in rather than added.

The one HTML artifact found across both repos is `fable-prompts/dataset/dashboard.html`.

Also noted: several JUPITER npm scripts (`explore:*`, `report:mappings`, `validate:*`, `hekat:*`)
reference `scripts/*.ts` files that **do not exist** — there is no `scripts/` directory. The
documented interface and the actual repo have drifted.

---

## The strongest window: eight hardcoded judgements in JUPITER

Every one of these is currently a constant, a regex, or an if/else chain standing in for a
judgement — which is exactly the decision-site shape worth replacing. Source: `scout-jupiter`.

| # | site | current mechanism |
|---|---|---|
| 1 | `CodeReviewAnalyzer.analyzeCode` — does a rule pass? | regex / `code.includes(': any')` |
| 2 | `SuggestionEngine.assessSymmetry` — symmetric vs asymmetric exchange | ratio thresholds 0.7 / 0.5 |
| 3 | `SuggestionEngine.identifyImpedances` / `assessSeverity` | lookup table + if/else |
| 4 | `SuggestionEngine.generateRecommendation` — implement / research / reject | confidence-threshold branching |
| 5 | `PatternMatcher.findBestMatches` — what counts as a match | similarity threshold filter |
| 6 | `CodeReviewAnalyzer.generateImprovementPlan` — priority order | fixed array: security > architecture > performance > style > tests |
| 7 | `FormativeCodeReview.isReadyForApproval` | zero-actionable-critiques rule |
| 8 | `rankSuggestions` — ordering | score constants +0.2 / +0.1 / −0.3 |

Two properties make this set unusually good to work on. First, **the incumbent is a constant, not a
model** — so the comparison baseline is free and honest, and per the field's phishing result a
two-line regex is a genuinely strong opponent. Second, **most are verifiable by code**: #1, #5, #7
can be checked against the source they judge, which is the `verification_gate` trick and a route
around having no labels.

Sites 2, 3, 4, 6, 8 are **relational or comparative** (symmetry *between* domains, priority
*ordering*, severity *between* two things). P21 predicts those sit in the mid band. Test before
building.

---

## Reusable knowledge-style devices from JUPITER

Carried into how this project documents itself. Source: `scout-jupiter`.

1. **Three-plane validation ledger** (`NOUS.md`) — Issue → Evidence with `file:line` citations →
   Severity (LOW/MED/HIGH/CRITICAL) → mitigation, repeated per plane, closed by an integrated
   assessment and numbered safeguards written as type stubs.
2. **Verbatim scholarly citation blocks** — Research Foundation (numbered sources) → "How
   practitioners describe it" as a blockquote with a page cite → Evidence Base → an explicit
   `[Add YOUR experience here]` slot → formal structure. The empty slot is the good part: it makes
   the missing local evidence visible instead of papering over it.
3. **Status-tagged roadmap ledger** — inline status on headers with dates and a confidence number
   (`✅ COMPLETE (2025-11-30)`, `0.82 confidence`).
4. **Adversarial multi-agent review doc** — sectioned by reviewer persona, every finding ✅/❌/🚨
   tagged with severity and an `Evidence:` sub-line. Already how `interview/critics/` works.
5. **Principle-violation cross-reference** — name the house principles once, then tag every
   critique against one ("Violation of principle: ABUNDANCE"). Worth adopting: `NETER.md` has
   properties but no named principles to violate.

Devices 1, 3, and 4 are already independently present in `NETER.md` and `LESSONS.md`. Device 2's
explicit-empty-slot and device 5's principle tagging are the two worth adding.

---

## Bank validation (`validate-bank`) — 50 real states across three sets

`DOC_RELEVANCE` (18 states) and `COURSE_QA` (16) came back clean — no MOVE-TO-CODE, no
NO-INFORMATION. `answersTheQuestion` hit the ends on **100%** of states. Both are safe to build
policy on.

`GRAPH_EDGES` (16) failed as predicted: `directional` **0% at the ends**, `statedNotInferred` 6%,
`relationship` only MARGINAL at 38%. Set repaired in `bank.ts` — `directional` removed to a static
table keyed by the relationship label, `statedNotInferred` re-scoped to a text-model call on
surviving edges only, and the set kept `suspect` with a do-not-ship note until `relationship`
itself is sharpened. Full detail: `NETER.md` iteration 4.

Two MARGINAL questions have cheap deterministic replacements worth trying before more model work:
`isRunnableExample` (regex for a fenced code block containing a call or import) and
`teachesOneThing` (heading and code-block counts).

---

## Tool-usage mining (`scout-transcripts`) — 17 transcripts, 544 tool calls

Full report: `../triage/tool-usage-findings.md`. Script: `../triage/mine-tool-usage.py`.

**The local tool-call corpus is far smaller than the file count suggests.** 52 `.jsonl` files exist,
but 30 (`thedotmack`) and 5 (`ornith-cc-test`) contain **zero tool calls** — pure text and thinking.
All 544 calls come from 3 sessions under `-Users-manu/` plus their subagents. And
`-Users-manu-CETI/` holds **no transcripts at all**, only a `memory/` subdirectory — so the "full
conversations" behind `fable-prompts` are not on this machine.

Any classifier validated on this corpus is small-n. Say so whenever a number comes out of it.

**Mass concentrates in `Read`, not `Bash`.** Bash is 70% of calls but 58% of tokens; Read is **8% of
calls and 40% of tokens**. Read is *reliably* bulky (median 1,456, p95 5,131 — consistently large),
while Bash is tiny with a long tail (median 102, p95 1,162).

| tool | calls | tokens |
|---|---|---|
| Bash | 381 | 125,374 |
| Read | 44 | 86,037 |
| Write | 41 | 1,484 |
| SendMessage | 17 | 1,322 |
| ToolSearch | 14 | 14 |

**Duplicate reads are the real waste, and it is deterministic to find.** 9 duplicate groups,
**~21,941 tokens spent on repeats**, of which `Read` is **97%** — and a single file re-read four
times accounts for **15,393 tokens on its own**. Bash/Edit/ToolSearch duplicates are trivial
(<500 tokens each).

This closes open window #4 in `NETER.md` with a clear answer: the prunable mass is not staleness
within a session, it is **the same file read repeatedly, mostly by parallel subagents**. It needs no
model — hash the content and keep one copy. That is a better target than the triage classifier and
it costs nothing to run.

**Failure rate 11.8%** (64/544) on an error-text match. The scan's own caveat is correct and worth
keeping: `Read`'s apparent 43.2% is inflated because the pattern matches the word "error" inside
normal source code, not failed reads.

### `context7` does not appear once — and now we know why

Zero matches for "context7" in any casing across the whole corpus. Only **2 MCP calls total** exist
in local history, both Vercel. Cause, established in two steps:

1. **The `mcp` block in `~/.claude/settings.json` is inert.** The settings schema has no `mcp`
   property; unknown keys are permitted and silently ignored. All 13 servers listed there — including
   context7 — are decorative. `~/.claude.json` has only 2 global `mcpServers` (`raveneye`,
   `raveneye-email`) and no project-scoped ones.
2. **The package name would not resolve anyway.** `@modelcontextprotocol/server-context7` returns
   **404 — it has never existed**. The real package is `@upstash/context7-mcp` (4.1.1).

So context7 has never been callable from Claude Code here. Fix:

```
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

This is the same failure shape as `LESSONS.md` **L13** (a config key in the wrong case failing
silently) — a config that looks authoritative, is syntactically fine, and does nothing. Two
instances in one session is enough to make it a standing check: **after configuring anything,
confirm the observable behaviour changed.**

Consequence for the bank: `DOC_RELEVANCE` was drafted for context7-shaped doc chunks. It stays
useful — the shape is right for any retrieval pre-filter — but it cannot be validated against real
context7 output until the server works.
