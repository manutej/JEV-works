# LESSONS.md — what went wrong, and the rule it produced

Companion to `NETER.md`. That file records what is true about Jev; this one records what we
got wrong while finding out. Every entry has the same three parts: **what happened**, **why it
happened** (the reasoning error, not just the symptom), and **the rule** — phrased so it can be
checked before the mistake recurs.

Attach a lesson wherever it applies: `NETER.md` properties, `question-bank/bank.ts` sets, and the
tools. A lesson nobody encounters again is a diary entry; a lesson attached to the thing it
governs is a guard.

Newest first within each section.

---

## Building with a decision model

### L26 · Name the SOURCE of a need, not just the need
**Happened.** A routing question asked "would answering require information not present in the
request text?" For `Run \`git status\` in this repo` it answered **TRUE at 0.97** — correctly, you
must look at the repo. The recombination used `1 − P(...)` as "suitable for a local agent", so a
shell task scored **0.03** on that term and `localFitness` limped over its threshold at 0.669.
**Why.** The question conflated two needs with opposite consequences: the **local filesystem**
(exactly what a bash tool is for) and the **public internet** (which a local fleet genuinely
cannot reach). One probability cannot carry two opposite meanings.
**Rule.** When a question feeds a capability decision, it must name **where** the missing
information lives, not merely that some is missing. Re-scoped to `needsInternet`, the same item
answered 0.05 and `localFitness` rose to 0.837 — a 0.17 move, well outside the ±0.11 noise floor.
*Attached to:* `local-ornith/questions.mjs` STAGE1_TRIAGE.

### L25 · Accuracy hides a wrongly-oriented term
**Happened.** The router scored 94% both before and after fixing L26. The headline number was
identical; one term in the aggregate was pointing the wrong way the entire time.
**Why.** A dominant term (`kindAffinity = 1.0` for shell tasks) was rescuing every item that the
broken term dragged down. Accuracy measures the argmax, not the margin.
**Rule.** Print **per-term contributions next to the aggregate**, not just the aggregate and the
verdict. A term that is always overridden is invisible to accuracy and will surface the moment
the dominant term is absent. This is L4 extended from per-question confidence to per-term weight.
*Attached to:* the `RECOMBINE` block in `local-ornith/pipeline.mjs`.

### L24 · Spread for a choice question is key diversity, not top probability
**Happened.** A validator reported `taskKind` as **NO-INFORMATION, spread 0.04**, and it was the
single most informative question in the set — it selected **6 of 6 keys** across the corpus.
**Why.** I reused the boolean spread metric (max − min of the probability) on a choice question.
Jev returns a near-one-hot there, so the top probability is ~1.0 on every item; its spread is
necessarily ~0 and says nothing about discrimination.
**Rule.** For `choice`, measure **how many distinct keys were selected**. For `boolean`/`score`,
measure the range. Never the same statistic for both. (L7 again: the instrument, not the data.)
*Attached to:* the discrimination block in `local-ornith/pipeline.mjs`.

### L23 · A one-hot distribution makes an entropy gate inert
**Happened.** An `entropy(taskKind) > 0.9 → escalate` gate never fired once across 18 items.
Measured max entropy over the whole corpus: **0.24**.
**Why.** Jev returns hard one-hot distributions for well-separated choice criteria —
`{shellOrFile: 1, everything else: 0}`. Normalised entropy is then 0 by construction.
**Rule.** Before relying on an entropy gate, **measure the entropy distribution on your corpus**
and report its maximum. If it never approaches the gate, the gate is dead code and the house rule
"gate on entropy, not top probability" is giving you no protection at all — you need a different
guard, such as verifying the output.
*Attached to:* `MAX_ENTROPY` in `local-ornith/route.mjs`, documented as inert.

### L1 · Never gate on a conjunction of confidences
**Happened.** The first context-triage policy required `min(confidence)` across up to five driver
questions to clear 0.8 before acting. It escalated **94% of items** and reclaimed 2 tokens.
**Why.** With a measured ±0.11 noise floor (`NETER.md` P4), demanding that *every* signal be
decisive is a near-impossible conjunction — one wishy-washy answer vetoes the whole decision. The
field's advice was "five narrow signals plus a logistic regression", and I read it as "five
narrow signals plus five gates".
**Rule.** Decompose into many questions, then recombine into **one aggregate score** and threshold
that. Never AND per-question confidences together.
*Attached to:* every `recombine` field in `bank.ts`; `NETER.md` §3.

### L2 · Intrinsic-value questions keep everything
**Happened.** Asking "does this output contain a measurement / identifier / decision?" kept 96% of
tool outputs. Nearly every output contains one of those.
**Why.** I asked whether something *has* value, when the decision needed whether it is *still
needed*. A successful install prints version numbers — a "measurement" by that test, and pure
dead weight.
**Rule.** For any keep/drop decision, at least one question must be **relational** — superseded?
still needed? already covered? A question set made only of intrinsic-value questions cannot
discriminate, however well-written each question is.
*Attached to:* `CONTEXT_TRIAGE` in `bank.ts`.

### L3 · …but relational questions are not the model's to answer
**Happened.** Having added the relational questions, they never left the mid band.
`neededForGoal` reached the ends on **7%** of 119 items and never exceeded p=0.67.
**Why.** "Would discarding this change what happens next?" requires reasoning over a goal, a file
manifest, and counterfactual future work. That is System 2. The model reads one state, literally.
**Rule.** Split the question set three ways before writing any policy: **literal** → the model;
**deterministic** → code; **requires reasoning** → a text model, on the escalate band only.
Moving supersession into code produced **24× the reclaim** at zero model cost.
*Attached to:* `NETER.md` P21; every `notForJev` list in `bank.ts`.

### L4 · An aggregate can launder coin flips into confident-looking verdicts
**Happened.** Iteration 2's weighted score produced verdicts reading −1.56 and +0.57 — decisive
numbers — while every single probability feeding them sat between 0.13 and 0.69.
**Why.** Summing ten mid-band inputs yields a number with a clear sign. The sign is an artifact of
the weights, not evidence from the model.
**Rule.** Always report **per-question confidence alongside the aggregate**. If no input reached
the ends, the verdict is a guess wearing a decimal point. This is the mirror image of L1: L1 is
too strict, L4 is what happens when you over-correct.
*Attached to:* `measure-confidence.ts`, which exists to make L4 visible.

### L5 · A confident question can still be useless
**Happened.** Building the validator surfaced a defect class I had not been looking for: a
question answered confidently but *identically* on every state.
**Why.** Confidence measures whether the model knows; spread measures whether the question
discriminates. They are independent, and accuracy metrics hide the second one entirely.
**Rule.** Check **spread** as well as confidence. Spread < 0.08 means the question is answered
before it is asked — cut it or rewrite it.
*Attached to:* the `NO-INFORMATION` verdict in `measure-confidence.ts`.

### L6 · Do not tune thresholds until the number looks better
**Happened.** Iteration 1 reclaimed 101 of 41,678 tokens. Retuning `KEEP_AT`/`DROP_AT` would have
produced a satisfying percentage in about a minute.
**Why.** That is fitting on the data being reported. The number would have been real and
meaningless — it would have described the thresholds, not the corpus.
**Rule.** When a result disappoints, change the **instrument or the question**, never the
threshold. Thresholds get fitted on data you have set aside and are not reporting.
*Attached to:* `NETER.md` P20; the `KEEP_AT`/`DROP_AT` comments in `triage.ts`.

### L7 · Suspect the instrument before the data
**Happened.** Iteration 1's poor reclaim led me to conclude "this session is the wrong corpus."
Challenged on it, the real cause turned out to be my question set (L2), and the same corpus later
yielded 41 dropped items.
**Why.** Blaming the data is the cheaper explanation and it feels like rigour. It is the one that
ends inquiry.
**Rule.** When a measurement is disappointing, exhaust instrument explanations first — the
questions, the recombination, the corpus *preparation* — before concluding the data is wrong.

### L8 · Measure more than once — and do not call throughput "latency"
**Happened.** I reported "57ms per call" in the morning and "**457ms** per call" on the third run as
an 8× latency degradation, and built a rate-limiting narrative on it. Both figures were
**wall-clock ÷ item count** under 6-way concurrency. That is throughput. When `lib/telemetry.ts`
started timing each call individually, real latency came back **p50 300ms, p95 470ms** — stable all
day.
**Why the throughput number moved anyway.** A few calls stall 30s or more while the other five
workers keep going. Those stragglers dominate wall clock but sit above p95, so they are invisible in
the percentile everyone quotes.
**Compounding error.** My first attempt at per-call timing silently measured elapsed-since-run-start
instead, because the patch inserting the inner start marker never matched. It produced a plausible
p50 of 6,352ms. It was caught only by checking that `sum(latencies) / concurrency` ≈ wall clock — it
did not, by 7×.
**Rule.** Time each call individually and say which number is which. Sanity-check any latency set
against wall clock and concurrency before reporting it. Report the tail as a max, because p95 hides
the stragglers that actually set your throughput.
*Attached to:* `NETER.md` P23, P1, P2, P10.

### L9 · The transport is part of the measurement
**Happened.** Our p50 of 245–274ms sits ~3× above the field's 76ms median.
**Why.** We measure through Vercel AI Gateway; the field figures are mostly direct. Neither number
is wrong; they measure different paths.
**Rule.** State the transport with every latency figure. Never compare your number to a published
one without checking you are timing the same hops.
*Attached to:* `NETER.md` P10, still open.

---

## Working in this environment

### L28 · Killing a subagent's parent does not free the server slot
**Happened.** A cancelled 3-way fan-out left **45 orphaned `claude` processes** holding 3 of the
llama-server's 4 slots. The next task appeared to hang for 2m43s; it was queued behind zombies,
not slow.
**Why.** `pkill` on the launcher killed the wrapper, not the in-flight HTTP generations, and the
server has no idea its client is gone.
**Rule.** After cancelling any local fan-out, check `GET /slots` for `is_processing` and reap
strays before drawing any conclusion about speed. A "slow model" is a slot-occupancy question
until proven otherwise.

### L27 · Measure the harness, not just the model
**Happened.** Running a trivial task ("how many .mjs files?") through Claude Code against a local
model sent **37,000–53,000 prompt tokens** — system prompt, 21 tool definitions, hooks, skill
listing — to produce a one-digit answer. A direct tool loop did the same task in **426**.
**Why.** I benchmarked tokens/second and context size, which are model properties, and never
measured what the *wrapper* puts in front of the model. On a hosted frontier model that overhead
is invisible; against local inference it is ~100× the payload.
**Rule.** For any local-model integration, measure **prompt tokens per unit of useful work**
before optimising generation speed. Read it off the server (`/slots` → `prompt_n`), not from the
client's own accounting.

### L10 · Verify a subagent's surprising claim before acting on it
**Happened.** An agent reported `node_modules` had vanished mid-run. I checked independently
before reinstalling. It was right — but the check cost one command and would have caught a
confabulation.
**Rule.** When a subagent reports something surprising about the environment, verify with one
cheap command before acting. Cost of checking: one call. Cost of not checking: acting on fiction.

### L11 · This machine deletes node caches mid-session
**Happened.** Twice. `jev-playground/node_modules` disappeared between two consecutive commands,
and later corepack's cached pnpm binary (`~/.cache/node/corepack/v1/pnpm/12.4.2/bin/pnpm.cjs`)
was gone too. Lockfiles and `.env.local` survived both times.
**Why.** Unknown — a cleanup tool, a cache reclaimer, or another session. Not caused by anything
run here.
**Rule.** Keep lockfiles committed so recovery is exact (`--frozen-lockfile`). When a module
resolution error appears mid-session, check whether the directory exists before debugging the
code. Have a fallback package manager ready — npm worked when corepack's pnpm did not.

### L12 · `> file 2>&1` corrupts the file
**Happened.** `python3 extract.py "$T" > items2.json 2>&1 | tail -1` put the stderr summary line
*inside* the JSON, producing a parse error at line 892.
**Why.** `>` redirects stdout to the file, then `2>&1` points stderr at the same place.
**Rule.** When capturing structured output, send stderr somewhere else: `> out.json 2>/dev/null`
or `2>err.log`. Never merge streams into a file you will parse.

### L13 · A config key in the wrong case fails silently
**Happened.** `~/.claude/settings.json` carried `"output_style": "explanatory"`. The schema key is
`outputStyle`. It had never taken effect, and nothing reported an error.
**Why.** Unknown keys are permitted by the schema (`additionalProperties`), so a typo is
indistinguishable from an intentional extra field.
**Rule.** After setting any config value, verify the key against the schema and confirm the
observable behaviour changed. "I set it" is not "it is in effect."

### L14 · When a channel drops messages, change transport
**Happened.** Four subagents completed and went idle without their reports reaching me. Three
requests over the message channel produced nothing.
**Why.** Unclear — the relay delivered idle notifications but not bodies. Later agents on the same
channel delivered fine.
**Rule.** After two failed attempts on one channel, switch mechanism rather than retrying. Having
them write to files worked immediately, and left the reports on disk as a durable artifact — which
was better than the original plan anyway.

---

## About the collaboration

### L15 · A pushback is usually information, not a request to defend
**Happened.** "Why would this be the wrong session? We don't necessarily need all those outputs to
go forward." I had just concluded the opposite. The correction was right and produced L2, L3, and
the 24× improvement.
**Rule.** When challenged on a conclusion, re-derive it from scratch rather than restating the
reasoning that produced it. The fastest route to the real cause was to take the objection
literally and ask what question I *should* have asked.

### L16 · Say what was not done
**Happened.** Several deliverables were deliberately deferred — the Sonnet summary pass, eight
unvalidated question sets, the whole of pass 1.
**Rule.** Name deferrals explicitly, with the reason, in the same report as the completed work.
A report that lists only what was finished invites the reader to assume the rest is done.

### L17 · Type the composition, not just the answers
**Happened.** `triage.ts` computed `W.density * (densityScore / 3)` — dividing a 0–3 rubric level
by 3 so it could be summed into a weighted score alongside probabilities. It typechecked, ran, and
contributed to every verdict across four iterations.
**Why.** Every answer colour is structurally a `number`, so TypeScript cannot tell a probability
from a rubric level, and nothing in the SDK objects. The error is semantic: the division asserts
that the gap from level 1→2 equals 2→3, and that both equal a third of a probability. `NETER.md`
P14 had already told me score levels are weakly calibrated and magnitudes must not be interpolated
— I had written that property down myself and then violated it one file away.
**Rule.** Declare each answer's **colour** and each recombination step's coercion, then check them.
A `Level` may be compared and thresholded, never scaled and added. A `Key` has no magnitude at all
and may only enter arithmetic through a table you wrote deliberately. `Dist → Entropy` is the one
genuinely free and lossless conversion, which is why the entropy gate works where the
top-probability gate fails.
*Attached to:* `NETER.md` P22; `question-bank/colors.ts`, whose `checkComposition` fails the build
on this exact mistake.

### L18 · A filter tuned for the wrong regime hides the best data
**Happened.** The masked-modelling scanner set `TEXT_MIN_CHARS = 60` to decide whether a column
carried "judgeable prose". It excluded every short-text target — including the marketing-hook
corpus that turned out to be the single best labelled task on the machine.
**Why.** I imported an intuition from document classification, where more text is more signal. For
this model the opposite holds: short labels are the documented strength and whole documents are the
documented weak task. The filter encoded the wrong regime.
**Rule.** When writing a filter that decides what data is eligible, state which regime it assumes
and check that assumption against what the model is actually good at. Also: URL columns are long
without being judgeable, so length alone never establishes that a field carries meaning.

### L19 · A planted control is worth more than a passing anchor
**Happened.** The 100-question window scorer passed both calibration anchors — known-good
`context-triage` (1.065) beat known-bad `graph-edge-typing` (0.623) — and then ranked
`duplicate-read-dedup` **first**, at 1.139. That window was planted as a control with the note
"SHOULD SCORE LOW ON FIT — a deterministic hash already solves it completely."
**Why.** The composite was `TRACTABILITY + FIT + PAYOFF − INCUMBENT − EXPOSURE`. A fully-solved
deterministic problem scores *maximally* on tractability (it is trivially tractable — it is already
done) and *minimally* on exposure (it is exact). Nothing in the formula asks **whether a judgement
is required at all**, so the instrument rewarded a problem that does not need the model.
**Rule.** Anchors prove an instrument can *separate* two known points. Only a control with a
*predicted direction* proves it measures the right thing. Plant at least one item you expect to
score badly for a specific stated reason, and treat it winning as a defect in the instrument rather
than a surprise about the item.
*Attached to:* `pass1/candidate-windows.json`, whose notes carry the predictions.

### L20 · Never average sub-scores of opposite polarity
**Happened.** The FIT category anti-correlated with directly measured answerability.
`jupiter-symmetry` — relational by construction, the shape P21 says must fail — scored the
**highest** FIT (0.51) and the highest literalness (0.47). `course-section-qa`, measured at 3-of-4
JEV-SAFE on real states, scored near the **bottom** (0.26).
**Why.** FIT averaged four sub-categories: closure, literalness and decomposability are *benefits*
(high is good) while anti-patterns is a *cost* (high is bad). Averaging them treats a cost as a
benefit. `doc-chunk-relevance` and `course-section-qa` both scored 0.04 on anti-patterns —
excellent — and the mean read it as weakness.
**Why it is the same mistake as L17.** Both add quantities that are not commensurable. L17 summed a
rubric level with a probability; this summed a cost with a benefit. The colour discipline needs a
sign as well as a type.
**Rule.** Every sub-score carries a declared **polarity** alongside its colour. Roll up with the
sign applied, never with a bare mean. A rollup whose inputs have mixed polarity is not a weaker
signal — it is an inverted one.
*Attached to:* `NETER.md` P22, extended; the rollup in `pass1/score-windows.ts`.

### L21 · A convenience symlink can silently amputate a sibling project
**Happened.** An agent fixed a missing `node_modules` by symlinking
`jev-playground/node_modules -> JEV-works/node_modules`. It reported the fix honestly and tsc
passed. But the two projects have different dependency sets: the symlink silently removed `zod` and
`vitest` from `jev-playground`, which would have broken its four passing tests and one experiment.
**Why.** The symlink made the *importing* project work, which is what the agent was checking. The
damage was to a project it was not looking at, and nothing failed loudly.
**Rule.** Never share a `node_modules` between projects with different manifests. When a dependency
directory is missing, reinstall from that project's own lockfile. And when an agent reports fixing
an environment problem, check what its fix did to everything *else* — that is the class of damage
that does not announce itself.

### L22 · The recurring failure of this whole session: silence that looks like an answer
**Three instances in one day, same shape.**

1. `"output_style": "explanatory"` in `settings.json` — the schema key is `outputStyle`. Unknown keys
   are permitted, so a typo is indistinguishable from an intentional extra field. It had never taken
   effect and nothing said so.
2. `context7` configured as `@modelcontextprotocol/server-context7` — a package that returns 404 and
   has never existed. Zero calls in 544, and no error anywhere to explain the absence.
3. Refactoring `measure-confidence.ts` onto shared logic, I renamed a reading field `score` → `level`
   and missed one construction site. The score path produced `NaN`, which flowed into a verdict of
   **NO-INFORMATION** — a specific, plausible, *wrong* answer where the correct one was MARGINAL.
   Nothing threw.

**Why this keeps happening.** Every one of these systems is permissive by design — extra config keys
are allowed, absent MCP servers are not errors, and `NaN` is a number. Permissiveness converts a
mistake into a plausible output instead of a failure. And a plausible output is *worse* than a crash,
because it gets reported, recorded, and built upon.

**Rule.** After any change to a config, a name, or a field, verify the **observable behaviour**
changed — not that the edit was applied. Where a previous measurement exists, re-run it and check
parity against the known noise floor. Where none exists, construct the smallest check that would
fail if the change did nothing. "I set it" is not "it is in effect", and "it ran" is not "it is
right".

This is the same epistemics the project applies to the model — never trust a confident-looking
number without asking what would have produced it if the mechanism were broken — turned back on the
tooling that produces the numbers.

### L29 · A falsification criterion can be wrong in a way that hides a real finding
**Happened.** E2's hypothesis said entropy must rise as agreement falls, "falsified if |ρ| < 0.3 **or
the distributions overlap substantially**". The run came back ρ = **−0.574**, AUC **0.786**, medians
0.189 against 0.427 — a strong, correctly-signed, well-separated result. It was recorded as
FALSIFIED because the interquartile ranges intersect over a **0.01-wide sliver** (0.357–0.367).
**Why.** I wrote "substantially" and the runner operationalised it as "intersect at all", which is
far stricter than I meant. The agent applied my criterion faithfully; the criterion was the defect.
**What I did not do.** Rewrite the criterion and call it a pass. `PROGRAM.md` says hypotheses are
written before the run and not edited afterwards, and quietly loosening one after seeing the data is
the cleanest way to turn an experiment into a formality.
**Rule.** Operationalise every falsification criterion *numerically* before the run — "IQR overlap
exceeds 50% of the narrower IQR", not "overlap substantially". When a criterion turns out to be
badly posed, record that as a finding alongside the substantive numbers and leave the original
verdict standing. The finding here is real and stands on ρ and AUC: entropy **ranks** ambiguity well
and **thresholds** it badly.

### L30 · Near-unanimity is more dangerous than disagreement
**Happened.** Accuracy by labeller agreement was non-monotonic: 5/5 → 73%, **4/5 → 29%**, 3/5 → 41%,
≤2/5 → 44%. The 4-of-5 bucket was the worst in the run.
**Why.** Four of five models converging on a wrong answer means they share a bias the human taxonomy
does not. Total disagreement at least signals "this item is hard". Near-unanimity signals confidence
while being wrong more often than a coin flip over 9 classes would manage by luck.
**The part that surprised me.** I chose five *different* model families specifically to break
correlated error, and argued in this session that clones would be weaker evidence. Diversity across
architectures was not enough — they still share training data.
**Rule.** Do not treat an agreement count as monotone evidence. Measure accuracy per bucket and look
at the shape. Near-unanimous-minus-one is a flag for a shared blind spot, not a nearly-good label.

### L31 · Check that a holdout is actually held out
**Happened.** E3 was designed to fit on `ceti-silver-hooks.json` (80 items) and blind-validate on
`ceti-silver-hooks-approved.json` (39 items), described in `PROGRAM.md` as "same schema, never
inspected until the run". One command before running it showed all 39 ids are a **subset of the same
80**, with **zero** label disagreements — the second file is just `status == 'approved'` filtered
from the first.
**Why I nearly ran it.** Two files, same schema, one named "approved" — it looked like a curated
second sample. I inferred independence from file separation, which is not evidence of anything.
**What it would have produced.** A holdout score measured on training data, reported as
generalisation, with a reassuringly small fit-to-holdout drop *because there is no drop possible*.
That is worse than no experiment.
**Rule.** Before trusting any holdout, check the **intersection of identifiers** with the fit set and
confirm the labels were assigned independently. A separate file is not a separate sample. If no
independent sample exists, split one yourself and say the n is halved — a thin honest holdout beats a
fat fake one.
*Attached to:* `program/PROGRAM.md` E3, now void as written.
**Recurred, 2026-09-21.** E3 was run anyway, by the orchestrator's own agent team, and came back VOID
(39/39 ids and texts of the "holdout" are the fit set's `status=approved` rows; re-verified independently).
The lesson did not stop it because it lived only here. `PROGRAM.md` still said "never inspected until the
run", and the orchestrator's brief, copying PROGRAM, **forbade opening the holdout before the run**,
which is the one action this lesson requires. A lesson that exists only in prose loses to the next
prompt that contradicts it.
**Rule, sharpened.** A disjointness check (id and normalised-text hash intersection, printing only the
overlap *count*) is not inspection and must run before a holdout is declared. It belongs in code that
blocks the run: `evals/` guardrail (eval-system brief). And fix the source document when a lesson
contradicts it: correcting PROGRAM.md is part of learning the lesson.


### L32 · An ensemble that matches its best member is not an ensemble
**Happened.** Five model families voting by plurality scored **48.75%**; the best single member
scored **50.0%**. The consensus cost 5× the calls and 5× the latency to do slightly worse than one
model on its own.
**Why.** Averaging helps when errors are independent. These models cluster at 41–50% and share a
blind spot (see the 4-of-5 bucket at 28.6%), so the vote mostly re-expresses a common bias with a
veneer of agreement.
**Rule.** Always report **per-member accuracy alongside the ensemble's**. If the ensemble does not
beat its best member by more than the noise floor, it is not aggregating information — and the honest
move is to use the one good model and spend the saved budget on validating the labels instead.

### L33 · Asserted structure is not checked structure
**Happened.** The HEKAT corpus is written in categorical vocabulary — a monoidal-functor law
(`F(OBSERVE) = category-master ⊗ systems-thinking ⊗ abstraction-principles`), a Kleisli-flavoured
chain notation (`[R>=>D>=>I]`), tiers labelled with complexity levels, and a coherence threshold
("Categorical coherence: ≥0.95"). None of it is enforced anywhere: no build-time check, no runtime
check, no declared types on the operations being composed. `[I→R]` — implement from nothing, then
research — was not merely permitted, it was unnoticeable.
**Why it is worth a lesson.** The vocabulary reads as rigour, so it suppresses the question "what
would catch this if it were wrong?" A `⊗` in prose and a `⊗` with a checker behind it look identical
on the page and behave completely differently. The same corpus thresholds a quantity ("≥0.95")
without declaring its type, which is precisely how the forbidden `Level → Prob` division sneaks in.
**Also worth noting.** `fp-ts` was a dependency with exactly one importing file, imported by zero
others — a functional-programming bridge nobody crossed, sitting beside hand-rolled `Either` and
`Monad`. Same pattern: the apparatus is present, the constraint is not.
**Rule.** For any claimed algebraic structure, ask what fails and when. If the answer is not "the
build" or "the request", the structure is decoration. Declaring the types is the cheap half; the
checker is what makes them real — and a checker that only warns is one step from decoration too.
*Attached to:* `hekat/check-chain.ts`, which is the missing checker; `hekat/FINDINGS.md`.

### L34 · Three definitions of one label is a product decision, not a modelling problem
**Happened.** L1–L7 is defined three incompatible ways across the corpus: token-budget-plus-agent-
count (`hekat.md`), industries × functions (`HEKAT-INTEGRATION.md`), and undefined-but-asserted
(`L7-HEKAT-SPECIFICATION-QUERY.md`). All three use the same labels.
**What I nearly did.** Picked the one that mapped most neatly onto operadic arity and encoded it.
That would have silently made one document canonical and given the tier a type derived from my
convenience rather than from anyone's intent.
**Rule.** When a term carries conflicting definitions across sources, record the conflict as data
and leave it out of the type system until someone with authority picks one. An invented
reconciliation is worse than an acknowledged gap, because it looks settled.
*Attached to:* `TIER_DEFINITIONS_CONFLICT` in `hekat/hotkeys.ts`.

### L35 · The all-confident gate came back in a new place
**Happened.** After the leads dedup bug was fixed, stage 1 still admitted almost nothing: the gate required
*every* boolean to be confident-true, and `isRealBusiness` sat mid-band on 503/540 items, so 454 were escalated,
including every clean in-ICP lead. The seed-42 eval then printed "jev 100% vs regex 93.2%", at **14.3% coverage**. On the **same seed-7 corpus**, the old gate gave **19.3%** coverage and the new gate **69.7%**. (Do not compare seed 42's 14.3% with seed 7's 69.7%: different corpora.)
**Why.** It is the same conjunction that escalated 94% of triage items in iteration 1 (the `min(confidence)`
gate). A rule learned in one module is not inherited by the next module that someone writes from scratch.
**Rule.** Treat any AND-of-confidences gate as a bug until shown otherwise. A signal that is rarely decisive
may *reject* but must not *block admission*. And never report accuracy without coverage: 97.4% on its own
verdicts was 67.8% over all leads.
*Attached to:* leads/ commit 6159e75 on main (the pre-registration; 651db1f before rebase); `program/results/leads-u5-summary.md`.

### L36 · Record the version that answered, not the alias you asked for
**Happened.** The seed-7 leads run recorded `model: "jev-latest (direct)"`. A later message asserted it had run
on `jev-1.13.0`, which was unchecked and then retracted: `pipeline.ts` never saved the response `model` field, so the
resolved version of that run is unrecoverable.
**Why.** `jev-latest` resolves server-side and will change. A result pinned to an alias cannot be diffed against a
later run, which is exactly what version-drift work (NETER window 5) needs.
**Rule.** Save `answeredBy(result)` (lib/jev.ts) next to `JEV_ID` in every result file. Ship on the pinned
`jev-1.13.0`, the direct default since feat/jev-selector.
*Attached to:* `lib/jev.ts` `answeredBy`; leads fix owned by feat/leads-pipeline.

### L37 · A noise filter that also judges intent blocks valid low-intent leads
**Happened.** Stage 1 asked `inboundSubstantive` ("real, specific content…"), which mixes "is this noise?" with "does
this person mean business?". It sat mid-band on 72/73 escalated out-of-ICP leads at seed 7. Replacing it with literal
questions moved leads from "regex wins by 24 pts" to "no difference shown" (seed 2718, McNemar p = 0.105).
**Rule.** Split noise from intent across stages. Stage 1 asks literal, noise-only questions; intent is judged later.
It corroborates P18: degree judgements never become decisive.
*Attached to:* feat/leads-literal-questions 49dd854; `leads/HANDOFF.md`.

### L38 · For adversarial rows, the scoring policy is the result
**Happened.** After Q2, the entire Jev-vs-regex gap is 12 injection rows that Jev escalated rather than answered.
Escalation is scored as wrong. Scored as correct, the gap closes or reverses.
**Rule.** Decide in writing, before any re-score, whether "escalate" on an adversarial input counts as right,
wrong, or excluded. Changing it after seeing results is fitting the scorer to the data.
*Attached to:* leads Q2 (seed 2718); a policy decision for Manu.

### L39 · A routing threshold tuned on in-sample scores defers to the memoriser
**Happened.** E3-K's hybrid (Jev if top-p ≥ τ, else a fold-fitted keyword model) chose τ on the training folds, where
the keyword model scored 97–100% because it had just memorised them; held out it scored 25–44%. τ went to 0.85 and the
hybrid (60.0%) lost to Jev alone (72.5%). The flaw was in the pre-registered design, and it is recorded as a finding;
τ was not re-fitted after the fact.
**Rule.** When a threshold routes between two systems, score *both* out-of-fold (nested CV) before tuning it. Otherwise
the system that memorises wins the tuning and loses the test.
*Attached to:* `feat/e3-blind-test` `program/E3-KFOLD-REPORT.md`.

### L40 · A fresh seed from the same templates is a new draw of records, not of wording
**Happened.** The leads paraphrase holdout p6029 passed the record-level disjointness rule (0 full-record overlap with any
fit seed), yet 565/600 of its messages appeared verbatim in the dev seed the reject rule was tuned on. The headline win
(p = 2.5e-4) came entirely from seen wording; on the 35 novel messages there was no difference.
**Rule.** Check disjointness at the unit the model actually reads (message text, not record id), against every seed
used for fitting, and report seen vs novel separately. Refuse a holdout above 20% seen unless explicitly accepted.
*Attached to:* leads c5dc972 (splits.json, pipeline refusal, seen/novel scoring); L31.

### L41 · A pooled headline can disagree with its strata, in either direction
**Happened.** Leads p6029's pooled "Jev better" (p = 2.5e-4) hides "Jev significantly worse on real buyers". Leads 2718's
pooled "no difference" hides "Jev significantly worse on injections". Both were caught only when the leads claim was
decomposed into strata and the composed answer was required to agree with the collapsed one (operadic consistency applied
to the *claim*, not just to the questions).
**Rule.** Gate a headline on its composed strata (seen/novel, and every category). If any stratum disagrees with the pooled
direction, the headline does not ship; report the stratum.
*Attached to:* leads/claim-gate.ts (61ceba6), leads/EVAL-TREE.md.

### L42 · Audit the evaluator before trusting its verdict
**Happened.** The first `judgeCalibration` rejected calibration when the calibration slope fell outside a fixed
[0.8, 1.25] band. Audited by simulation on data calibrated *by construction*, it called calibrated data miscalibrated
**80% of the time at n=40, 54% at n=100, 36% at n=150**. It looked rigorous and would have forced every small cookbook
to "recalibrate" on noise. Switching to CI-based checks (the slope's CI must exclude 1) fixed the small-n bias; three
evaluators each at α=0.05 then false-alarmed ~10% combined, and a Bonferroni correction brought it to 2–4.5% at every
n ≥ 100, with power 100% on a known distortion. Below n≈100 the power is < 80%, so the kit now says "too few items to
judge" instead of issuing a verdict.
**Rule.** Every evaluator that gates a decision is itself audited on synthetic data with a known answer, at the n you
actually have: false-alarm rate ≤ its α, power reported. An evaluator without an audit is a hand-set threshold in disguise.
*Attached to:* `kit/threshold.ts` (`auditCalibrationEvaluator`), `program/calib-audit.ts`, test "passes its own audit".

### L43 · The edge you fear is not the edge that breaks
**Happened.** Each question tree declared a `high_risk_edge` before the OC run: the least literal leaf, by the author's
judgement. In 2 of 3 trees it never flipped the root. The real failures were a mid-node asking something unverifiable
from one record ("is there a *real* company", answered no on all 150) and a composition rule with a relevance hole
(the same hole already sitting in `bank.ts` DOC_RELEVANCE, unnoticed since it was drafted).
**Rule.** Declare the suspected edge (it costs nothing), but let the full collapse set localise the failure. Also OC-gate
the lab's existing `recombine` rules, not just new trees: a composition rule is a question too.
*Attached to:* `.toq/*/toq.yaml` (frozen), `program/OC-REPORT.md`.

