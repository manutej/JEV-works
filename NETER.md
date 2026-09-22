# NETER.md — the functional properties of Jev, as established

**Purpose.** One place where Jev's useful properties are recorded with the evidence that
established them, so that building against it stops being a matter of belief. Every entry
carries a status, and the status is the point: a claim with no local measurement behind it is
marked as such even when the vendor and the field agree on it.

**How this file evolves.** Append to the ledger at the bottom on every pass. When a property's
status changes, edit the property in place and record the change in the ledger — never leave two
contradictory rows. When a property is disproved, do not delete it; move it to *Retired* with
what killed it. Iteration 1 is deliberately thin on the accuracy limb, because accuracy cannot
be established without labelled data from a real repo.

**Versions in play.** Field docs describe `jev-1.13.0` and warn that `jev-latest` drifts. Vercel
AI Gateway exposes a single id, `typesafe-ai/jev`, with no visible version pin — **so everything
measured here was measured against an unpinned alias.** That is an open risk, not a footnote.

---

## 1 · The thesis

**Jev is a filter, not an oracle.** It is a zero-shot classifier with a typed interface — a
framing its own CEO accepted publicly. It returns a pick, a level, or a probability; branching,
retries, arithmetic, and side effects stay in your code. Every measured write-up in the field
converged on the same shape: put Jev *in front of* the model you already use, act on its
confident ends, and escalate the middle.

The corollary is the thing to internalise: **the question you ask is the product.** One broad
question underperforms badly. A phishing task scored 62.6% as a single Jev question and 95.1% as
five narrow signals recombined by a logistic regression — while a two-line regex scored 91.8%.
The lift came from the decomposition, and the cheap baseline was nearly as good as the clever
one. Both facts should stay uncomfortable.

---

## 2 · Property registry

Status vocabulary: **measured here** (we ran it) · **corroborated** (independent parties agree,
we have not run it) · **vendor claim** (only the vendor says so) · **contradicted** (our number
disagrees with the claim) · **open** (no evidence either way yet).

| # | Property | Evidence | Status |
|---|---|---|---|
| P1 | **Batching is effectively free up to about 32 questions, then it is not.** 32 questions cost 0.91× the latency of 1 (245ms vs 269ms p50) and 2.5× the cost; marginal ~17 input tokens per question. But at **100 questions p50 doubled to 495ms**, and the question set itself consumed ~7,500 of the ~8,200 tokens per call — so past a few dozen questions you stop paying P1's free lunch and start paying P2's state-size cost with your own questions. The 32K budget is shared by state AND questions; a large question set is a large state. | our runs at 1–32 and at 100 | **measured here** |
| P2 | **State scales sub-linearly.** 613 tok → 422ms; 24,299 tok → 610ms. 40× state for 1.45× latency. | our run | **measured here** |
| P3 | **The context ceiling is a cliff, not a slope.** ~31K-token state returns `GatewayResponseError` / HTTP 500 / *"Invalid error response format"* — no 413, no typed size error, indistinguishable from provider flakiness. **You must count tokens before the call.** | our run | **measured here** |
| P4 | **The argmax is stable; the probabilities are not.** 20 identical calls: choice never flipped (20/20), but the selected probability moved across a **0.11 band** (sd 0.025) and a 0–3 score moved 0.18. Two thresholds within 0.11 of each other are the same threshold. **Addendum (2026-09-21, A/A n=50 states):** the band is question-shaped: booleans/scores p95 ≤ 0.07, a flat 5-way choice reaches 0.15. Argmax flipped on 2/16 choice states, only where the top-2 margin was ≤ 0.04; no confident answer flipped. | our run, n=20; drift suite A/A n=50 | **measured here** |
| P5 | **It does not abstain.** On inputs with no correct answer — empty string, whitespace, lone emoji, off-topic text — it answered confidently (p 0.82–0.91), all on the same wrong option. A top-probability gate does not protect you. | our run, n=4 cases | **measured here** |
| P6 | **Entropy separates garbage; top-probability nearly does too, if you threshold it near 1.** Held-out half of a pre-registered n=214 corpus (104 clean, 110 garbage, two choice questions): AUC entropy **0.978** [0.953–0.996] vs 1−top-p **0.952** [0.913–0.984] vs a length baseline 0.852. Entropy's edge (+0.026, CI 0.007–0.049) is real but below P4's noise floor, and it is **zero on a 2-option choice** (entropy is then a function of top-p), so it grows only with option count. *Post-hoc, not pre-registered:* what P5 warned about still holds at the *conventional* cut: top-p < 0.8 caught 59% of garbage; entropy ≥ 0.30 caught 84% at the same 3.6% clean cost. The n=10 ranges do not replicate: garbage spans 0.11–1.00, clean 0.00–0.54, with tails overlapping (garbage p5 0.23 < clean p95 0.27). Hardest garbage is plausible-looking: a real state sent to the wrong question (entropy AUC 0.92). "No right answer" exists only when the options have no catch-all. | our run, n=214, pre-registered, fit/test disjoint, jev-1.13.0 (`program/P6-REPORT.md`) | **measured here — original wording falsified (F2)** |
| P7 | **Transient failures are real and the default hides them.** ~1 timeout in 30 calls with `maxRetries: 0`. The SDK default of 2 retries absorbs them silently. Measure with retries off; ship with them on. | our run | **measured here** |
| P23 | **Per-call latency is stable; throughput is not. Do not conflate them.** Instrumented per-call latency on the same workload is **p50 300ms, p95 470ms** — consistent across the day and with P10's 245–274ms. But wall-clock ÷ items ranged from 56ms to 457ms across three runs of the identical script, because a handful of calls stall 30s+ while the pool keeps working. Those stragglers sit above p95 and are invisible in it. So: quote per-call latency from measured per-call timing, quote throughput separately, and report the tail as a max rather than trusting p95. An earlier "8× latency degradation" recorded here was throughput mislabelled as latency. | our runs, n=151 × 3 | **measured here** |
| P8 | **Naive prompt injection failed.** A direct override instruction and a criteria-schema impersonation both lost to message content. **This is not a security property** — the docs give no injection guarantee on state, and bypasses have been reported. | our run, n=2 | **measured here, weak** |
| P9 | **Speed and cost gains are real but an order of magnitude below the slide.** Vendor: 193.6× faster, 444.6× cheaper. User-published medians: **7×** speed-up (n=215) and **30×** cost cut (n=180). Both can be true — the vendor compares against a frontier model writing prose with reasoning. | field aggregation, 12,759 tweets | **corroborated** |
| P10 | **The Gateway hop roughly doubles latency; it does not explain all of the gap to the field.** Field median 76ms (n=333, direct). Same 119-item triage workload, same day, both paths: **direct `api.typesafe.ai` p50 131ms / p95 276ms; Gateway p50 268ms / p95 477ms.** The hop costs ~2×; direct is still ~1.7× the field median (network distance or workload — our states are ~350 tok). Outputs are interchangeable: 117/119 verdicts agree, median \|Δp\| 0.01, max 0.12 — inside P4's noise band. Use direct by default (`lib/jev.ts`). | our run, 119 items × 2 backends, 2026-09-21 | **measured here** |
| P11 | **Confident-when-in-distribution is trustworthy; the mid band is a coin flip.** Two independent benchers found the ends right 90–100% of the time. How *much* traffic sits at the ends varies wildly by task: ~90% of items on Enron-shaped spam, only 3–9% on page routing. | Aman Kumar, Samuel Sacco | **corroborated** |
| P12 | **Whole documents are the weak task.** Vendor's own board: invoices 61.8% vs 79.1% for the best LLM. Page-value 68.6%. Pre-extract, then ask. | vendor board + independent | **corroborated** |
| P13 | **"Cannot hallucinate" is a type guarantee only.** It cannot emit a label you did not declare. It can pick the wrong one, confidently — see P5. Conceded by the vendor on the launch thread. | field + our P5 | **corroborated** |
| P14 | **Noul is not a Choice in disguise.** No separate confidence field; ~0.5 is not "medium yes"; **P(A) + P(¬A) is not 1**. Score levels on 1.13 are only weakly numerically calibrated — **do not interpolate magnitudes.** | official docs via field | **corroborated** |
| P15 | **Text only.** No images, audio, video, or PDF; Base64 does not sneak through — tested independently on 19 Sep with a digital PDF and a PNG, both unread. OCR first. | independent test | **corroborated** |
| P16 | **Choice caps at 255 options.** Beyond that the documented pattern is hierarchical Choice with confidence back-off. | official docs | **vendor claim** |
| P17 | **It reads literally.** Double negatives and implied conditions must be spelled out in the instructions. | official failure-mode list | **vendor claim** |
| P18 | **Never ask it to count or do arithmetic.** Dates, tallies, numeric comparisons belong in code. | official failure-mode list; leads seed 7: `inboundSubstantive` ("real, specific content…") mid-band on 72/73 escalated out-of-ICP leads, a degree judgement that never became decisive (see L35) | **vendor claim, corroborated here for degree judgements** |
| P19 | **CJK accuracy is lower** per the docs; English instructions recommended. Our single Japanese case routed correctly at p=1.00, which contradicts nothing at n=1. | docs + our n=1 | **open** |
| P20 | **Calibration on your own data is unavoidable.** No independent large-scale calibration study exists. Vendor thresholds are not reproduced. | field | **open** |
| P21 | **Relational questions are outside its competence, and it tells you so in the distribution.** Asked nine questions over the same 119 states, per-question confidence orders cleanly by question *type*: literal single-state questions reach the ends (`oneTimeSetupSettled` 82% of items at the ends, mean confidence 0.79), while questions requiring reasoning across a goal and a file manifest do not (`supersededByDurableFile` 26%; **`neededForGoal` 7% of items at the ends, never once exceeding p=0.67**). Diagnostic worth reusing: **run your candidate questions over one corpus and rank them by mean confidence — the ones that never leave the mid band are the ones to move into code.** | our run, 119 items × 9 questions | **measured here** |
| P24 | **Option wording is the dominant lever on Choice accuracy (lead, in-sample only).** Same Jev, same 80 CETI hooks: option descriptions from E1 scored **0.375**; rewritten from E1's unanimous-but-wrong items, **0.725**. `halbert-a-pile` went 0/6 → 5/6 once the description said what the class means (Halbert's A-pile, a personal-looking subject line) instead of its surface ("pile imagery"). Jev chose the same option on 38/39 items across two runs. The held-out comparison is VOID (L31), so this is a lead, not a generalisation claim. | E3 fit runs, n=80, `jev-latest (direct)`; branch feat/e3-blind-test | **measured here, in-sample** |

---

## 3 · The policy layer

Jev has no policy. This is the layer every measured write-up ended up building, and it is where
the engineering lives.

**The confidence gate.** Act at the ends, escalate the middle, never treat 0.5 as a decision.
Fit the cut-off on a few hundred of your own labelled items; a borrowed 0.9 is worth less than a
small local measurement. Constrain by P4: cut-offs closer together than 0.11 are indistinguishable.

**Asymmetric costs.** A 0.8 that routes an email is not a 0.8 that merges a PR or spends money.
Set the threshold from the cost of being wrong in that direction, not from a global default.

**Decompose, then recombine.** Narrow literal questions, weights you own, aggregation in code.
Critically — recombine on the **aggregate**, not on a conjunction of per-question confidences.
Requiring every signal to be confident is how a working classifier becomes a machine that
escalates everything (see ledger, iteration 1).

**Always beat a cheap baseline first.** Regex, keyword list, logistic regression on your own
labels. If those clear the bar, a network hop is unjustifiable at any latency.

---

## 4 · Where the primitives actually fit

| Job shape | Primitive | Field evidence |
|---|---|---|
| Routing (inbox, model picker, intent, ticket desk) | one Choice + a Noul gate | heaviest cluster in the field pool |
| Classification (spam, safety, topic, fraud) | Choice, short labels | strong on short text; slips on whole documents |
| Ranking / rubric scoring | Score, then weights in code | 91.5% agreement with a frontier model on 6,003 rubric checks |
| Tool selection / gating | Choice over tools + Noul for safety | 41% fewer approval prompts over 1,013 real calls, 0 unsafe auto-approvals of 94 |
| Context pruning | Nouls, keep/drop over summarize | a shipped library at 4,079★ keeps content verbatim |
| Generation of any kind | **none — wrong tool** | chaining Choices to emit prose is slow and bad |

---

## 5 · Open research windows

Each is a question a cheap experiment could close. These feed pass 1.

1. ~~**Is the Gateway hop the 3× latency gap (P10)?**~~ **Answered 2026-09-21:** the hop is ~2× (p50 131 vs 268ms); outputs are interchangeable. See P10.
2. ~~**Does entropy separation (P6) hold at n=200?**~~ **Answered 2026-09-21 (U8):** separation holds (AUC 0.978); the distinctive claim over top-probability does not (+0.026, below noise). See P6.
3. **Does a batch contaminate itself?** If rewording one option description moves answers to the other eleven questions, "fan out freely" has a hidden cost — and every criteria edit needs a regression suite.
4. **Where is the real prunable mass in a transcript?** Iteration 1 says it is not staleness within a session (see ledger). Hypothesis: it is **duplicate reads across parallel subagents** — which Jev cannot see, because it evaluates one state at a time. Needs content hashing in code plus Jev for the near-duplicate judgement.
5. **What does version drift cost?** Instrumented, not yet answered: `program/drift.ts` (weekly, ~$0.004).
   2026-09-21: `jev-latest` resolves to `jev-1.13.0` (50/50 calls), so pinned-vs-latest was an A/A test: no drift.
   A/A noise p95 |Δp| 0.04, max 0.15 (choice); booleans/scores ≤ 0.07. This window closes the first week
   `latestResolvedToChanged` is true. **Caveat:** the "≥3 flips over noise" verdict rule was set *after* a first run
   called this A/A null "drift detected". It was calibrated on today's data, so next week's run is its first honest test.
6. **Does the cheap baseline win on our tasks?** Mixed, decided by paired tests (`program/BASELINE-WINS.md`). **Leads qualified:** old question set, regex wins (92.2% vs 67.8%, McNemar 6 vs 152); **literal questions (Q2, seed 2718, pre-registered): no significant difference**, Jev 88.5% vs regex 91.0%, McNemar 30 vs 45, p = 0.105. Leads segment (old set): regex 94.0% vs 54.8%. **P6 garbage detection: Jev wins**, entropy − length AUC +0.126, paired CI [+0.055, +0.204]. P6 clean classification: naive Bayes 92.7% vs Jev 89.1%, no difference shown. E2: no paired test possible. E3 void. Triage and question bank: no labels. Next: E5 on 2–3 masked targets vs naive Bayes, sized by discordant pairs to ~300 test items (Q4).

---

## Ledger

### Iteration 1 — 2026-09-19

- Established P1–P8 by direct measurement against `typesafe-ai/jev` through Vercel AI Gateway
  (~110 calls, OIDC auth, retries disabled). Raw data: `../jev-playground/experiments/results/`.
- Imported P9–P20 from a four-day field aggregation of 12,759 launch-window posts, kept separate
  from our own measurements by status rather than merged into them.
- **Built `triage/` — Jev as a context-pruning classifier.** Seven narrow questions per tool
  output, recombined in code, three-way keep / drop / escalate. 119 outputs from a live session,
  6.6s, $0.00565 to decide.
- **First policy was wrong and the failure was instructive.** Gating on `min(confidence)` across
  five driver questions escalated 94% of items: with a 0.11 noise floor, requiring every signal
  to be confident is a near-impossible conjunction. Replaced with a weighted aggregate score and
  two asymmetric thresholds. This is P4 and the field's decompose-and-recombine advice colliding
  with a naive implementation — worth remembering as the default mistake.
- **Negative result, kept deliberately.** With the corrected policy: 96% KEEP, 12 items dropped,
  **101 tokens reclaimed out of 41,678.** Item count and token mass are decoupled — the droppable
  items are tiny acknowledgements while every large output was a measurement or a file write.
  Thresholds were *not* retuned to make this number look better; that would be fitting on the
  data being reported.
- **Mapped tool-output mass across all local transcripts**
- *(see iteration 2 below — the negative result above was caused by the question set, not the corpus)* (`triage/profile-corpora.py`, no API
  calls): 10 sessions ≥2k tokens, ~145k tokens total, 38% in prunable-shaped tools. Two
  observations: `Read` inside parallel subagent sessions reaches 100% prunable share (four critics
  reading the same file is four copies of it), and **there are no context7 outputs anywhere in the
  local history** despite it being a routine call — the transcript history itself looks truncated,
  consistent with this machine deleting `node_modules` and corepack caches mid-session.

### Iteration 2 — 2026-09-19 (same day, prompted by a challenge to iteration 1's conclusion)

The challenge: *"Why would this be the wrong session? We don't necessarily need all those
outputs to go forward."* It was correct, and iteration 1's diagnosis was wrong.

- **The question set was the defect, not the corpus.** Iteration 1 asked only whether an output
  was *intrinsically* valuable — does it hold a measurement, an identifier, a decision. Nearly
  every tool output does, so nearly everything was kept. The question that licenses dropping is
  **relational**: has this been superseded, and does the work ahead still touch it? A successful
  install prints version numbers (a "finding" by the old criteria) and is pure dead weight.
- Added three relational questions — `supersededByDurableFile`, `neededForGoal`,
  `oneTimeSetupSettled` — and put the **forward goal plus a manifest of durable files** into the
  state, since supersession is meaningless without knowing what already exists. Reweighted so
  forward need dominates intrinsic value and supersession is the strongest reason to let go.
- Result moved substantially: score median 0.74 → 0.12, ESCALATE 3% → 18% of token mass, DROP
  12 → 19 items. Correctly disposable things were now found: subagent spawn confirmations, edit
  acknowledgements, a watcher loop.
- **But the reclaim stayed small (528 tokens), and spot-checking revealed why — which is the real
  finding.** Every relational probability sat in the mid band: `neededForGoal` never exceeded
  **0.67** across 119 items, and reached the ends on **7%** of them. The weighted score was
  turning nine coin flips into verdicts that *looked* decisive (score −1.56, +0.57) while no
  single input to it was. Quantified as **P21**.
- **Architectural consequence.** Split the question set by what Jev can actually answer:
  - *Keep in Jev* — literal single-state questions: is this empty, is this a settled setup step,
    how dense is it, does it name an identifier. These reached the ends on 53–82% of items.
  - *Move into code* — supersession is **deterministic**: hash the output's content against the
    durable files and check containment. No model needed, no mid band.
  - *Escalate to a text model* — forward need, which requires reasoning over a goal and
    counterfactual future work. This is the System 2 half, and the vendor says so.
- Reusable diagnostic, generalisable beyond this task: **run candidate questions over one corpus
  and rank them by mean confidence. The ones that never leave the mid band belong in code, not in
  the model.** This is cheaper than labelling and it runs before you have any labels at all.
- Not done: the Sonnet micro-summary pass over the escalate band. Deferred deliberately — after
  P21, the escalate set should first be re-split by moving supersession into deterministic code,
  which will shrink what needs summarising at all.

### Iteration 3 — 2026-09-19 (acting on P21)

- **Moved supersession out of the model and into code** (`triage/supersede.py`): extract
  distinctive tokens — numbers, paths, identifiers, error names — from each output and check
  containment against the durable corpus. Token-level rather than line-level, because a
  measurement written into prose shares no whole lines with the shell output that produced it but
  shares every number. 28 files, 709 distinctive tokens. Result is interpretable in a way the
  model's answer never was: **8 items fully recorded (≥0.9), 70 orphaned (<0.3)**.
- Removed both relational questions from the Jev call. Reclaim per iteration, same corpus:

  | iteration | policy | dropped |
  |---|---|---|
  | 1 | gate on `min(confidence)` across drivers | 2 items / 2 tokens |
  | 2 | relational questions asked of Jev | 19 items / 528 tokens |
  | 3 | supersession computed deterministically | **41 items / 2,423 tokens** |

  24× iteration 2 at zero added model cost. All 15 `Write` acknowledgements, all 6 agent spawns,
  all 6 `ToolSearch`, both `Edit` acks, 9 `Bash`. The remaining 84% of mass sits in escalate,
  which is the honest place for it — forward need is a text-model judgement.
- **Built the question bank** (`question-bank/`): nine sets by context, each naming its relational
  judgements and the code that replaces them. `CONTEXT_TRIAGE` is measured; `GRAPH_EDGES` is
  marked *suspect* in advance because relationship judgements are relational by construction.
- **Turned P21 into a reusable tool** (`question-bank/measure-confidence.ts`). Rank any question
  set by confidence over any corpus, no labels required. It reports two defects needing opposite
  fixes: `MOVE-TO-CODE` (never decisive) and `NO-INFORMATION` (decisive but always the same
  answer, spread < 0.08 — the one that hides from every accuracy metric).
- **The tool found a defect in its own measured set on first run.** `cheaplyRepeatable`: 17% at
  the ends, mean confidence 0.427. It was reading output text to answer a question the tool
  *name* already settles. Moved to `notForJev`. 24 states validated in 1,415ms.

### Iteration 4 — 2026-09-19 (a pre-registered prediction, tested)

`GRAPH_EDGES` was written into the question bank marked **`suspect`**, with the reason stated in
advance: relationship judgements are relational by construction, so P21 predicts they will not
reach the ends. Three other sets were marked `drafted` with no such prediction. All were then run
through `measure-confidence.ts` against real states by an agent that was told the marking but not
told what to conclude.

| set | states | outcome |
|---|---|---|
| `DOC_RELEVANCE` | 18 | 3 JEV-SAFE, 2 MARGINAL, **0 failures**. `answersTheQuestion` reached the ends on **100%** of states (mean confidence 0.881) |
| `COURSE_QA` | 16 | 3 JEV-SAFE, 1 MARGINAL, **0 failures** |
| `GRAPH_EDGES` | 16 | **2 of 3 questions MOVE-TO-CODE**, the third only MARGINAL |

The prediction held. `directional` — *"would the relationship be false if the two items were
swapped?"* — reached the ends on **0% of 16 pairs**, mean confidence 0.208, the worst result
recorded anywhere in this project. `statedNotInferred` reached 6%. Meanwhile the two sets with no
adverse prediction produced no failures at all.

**This upgrades P21 from a description to a usable prior.** It was derived from one corpus in
iteration 2; here it was stated in advance about a different set, on different data, and the
measurement agreed. Questions can be triaged by *shape* before any data exists — if a question asks
about a relation, a comparison, or a counterfactual, expect the mid band and plan the code path.

**The fix for `directional` is the more general lesson.** Directionality is a property of the
relationship *label*, not of the pair: `depends_on` is directional, `contradicts` is symmetric. So
it was never a question at all — it is a lookup keyed by an answer the model already gave. Before
moving a failed question to a text model, check whether it is a **function of another answer**, in
which case it costs nothing.

Also recorded: `GRAPH_EDGES` ran 3 questions × 16 states in **1.1s** against 33.2s for the
doc-chunk sets, whose states are 800–1500 characters each. Consistent with P2 — state size drives
latency, question count does not.

| P22 | **Answer types are composition colours with a SIGN, and coercing between them is mostly illegal.** Polarity is part of the colour: a rollup that averages a cost sub-score with benefit sub-scores is inverted, not merely noisy — measured when the FIT category anti-correlated with answerability because anti-patterns (a cost) was averaged with closure and literalness (benefits). A question set plus its recombination is a coloured operad: `boolean → Prob`, `choice → Key + Dist`, `score → Level`, and composition is defined only where the colours match. Licensed: `Dist → Entropy` (lossless, and the measured-good uncertainty signal), `Level → Ordinal` (levels are ordered), `Prob → Ordinal` (thresholding, subject to the 0.11 floor). **Forbidden: `Level → Prob`** — dividing a score by its maximum asserts equal spacing between rubric levels and commensurability with probability, which P14 denies. Also forbidden: `Key → Prob` or `Key → Ordinal`, since a label has no magnitude and choice options are unordered by construction. Encoded with a build-time checker in `question-bank/colors.ts`. | our own bug, caught by the framing | **measured here** |
| P24 | **Consensus does not manufacture gold labels.** Five model-diverse labellers (`gpt-5.6-luna`, `deepseek-v4-pro`, `qwen3.7-plus`, `llama-4-maverick`, `claude-haiku-4.5`), zero errors, on 80 human-labelled marketing hooks over 9 classes. Unanimous agreement was reached on **26/80 items (32.5%)** and those unanimous labels were **73.1% accurate** — roughly one in four unanimous labels is wrong. Unanimity is *informative* (73% against 29% for 4/5, a gap of 0.445, far above the noise floor) but it is not gold, and a benchmark built on it inherits a 27% error rate. | our run, n=80 × 5 labellers | **measured here** |
| P25 | **Model diversity does not eliminate correlated error, and 4-of-5 agreement is the danger zone.** Accuracy by agreement bucket was non-monotonic: 5/5 **73.1%** (n=26), 4/5 **28.6%** (n=21), 3/5 **41.2%** (n=17), ≤2/5 **43.8%** (n=16). The 4/5 bucket is the *worst* — worse than total disagreement. The mechanism: when four of five families converge on a wrong label they are sharing a bias the human taxonomy does not, and near-unanimity launders it into apparent confidence. Five different architectures are still trained on overlapping text. **Treat near-unanimous-but-not-unanimous as a red flag, not as a near-miss.** | our run, n=80 | **measured here** |
| P26 | **Entropy tracks category ambiguity, but as a graded signal rather than a separator.** Against labeller agreement on the same 80 items: Spearman **ρ = −0.574**, AUC of entropy predicting disagreement **0.786**, median entropy **0.189** for unanimous items against **0.427** for split ones — a gap of 0.238, well above the 0.11 noise floor. The interquartile ranges do intersect (unanimous [0.056, 0.367], split [0.357, 0.553]), so entropy ranks ambiguity well and thresholds it badly. Usable for prioritising review queues; not usable as a clean hard/easy gate. | our run, n=80 | **measured here** |
| P27 | **On a real 9-class text task it did not meaningfully beat a keyword matcher.** Marketing hooks by copywriting formula: Jev **33.75%**, keyword matcher **31.25%**, majority class **26.25%**. A 2.5-point margin at n=80 is inside sampling noise. The field's phishing precedent (regex 91.8% against 62.6% for one broad question) predicted exactly this, and it is the same lesson as the leads baseline at 91.7%: **one broad question over many classes is the shape that loses.** Whether decomposition into concept probes recovers it is E4, and is now the programme's load-bearing question. | our run, n=80 | **measured here** |
| P28 | **A five-model consensus plurality was no better than the best single labeller.** Individual accuracy on the same 80 items, 9 classes: `claude-haiku-4.5` **50.0%**, `llama-4-maverick` 46.25%, `gpt-5.6-luna` 43.75%, `deepseek-v4-pro` 41.25%, `qwen3.7-plus` 41.25%. Plurality vote across all five: **48.75%** — *below* the best single model. So the ensemble bought nothing but 5× the cost and 5× the latency. Combined with P24 (unanimous labels only 73% accurate), consensus distillation is not a labelling method on this task; it is a way to find items worth a human's attention. | our run, n=80 × 5 | **measured here** |
| P29 | **When every strong model lands at 41–50% on a 9-class task, suspect the labels before concluding the models are weak.** Five independent families clustered tightly (41.25–50.0%) against a 26.25% majority-class floor, and agreed unanimously on only 32.5% of items. Two explanations fit equally well and have not been separated: the models are bad at the concept, *or* the human taxonomy is under-determined and neighbouring classes genuinely overlap. Tight clustering of otherwise-dissimilar models is evidence for the second. The corpus carries a `swapTestPass` field that is `false` on 5 of 80 — a label-quality signal that has not been used. **Validating the labels is now upstream of validating the model.** | our run, n=80 | **open** |

### Iteration 3 — 2026-09-21

- **Direct TypeSafe backend added** (`lib/jev-direct.ts`): an AI SDK `EvaluationModelV4` over
  `POST api.typesafe.ai/v1/systemone`, so every `evaluate()` call site is unchanged. Only wire
  difference: SDK `boolean` ⇄ TypeSafe `noul` (`{noul: p}` → `{probability: p}`). Confidence lands in
  `providerMetadata.typesafe.confidence` — the same key the Gateway already uses.
- **`lib/jev.ts` is now the only place a backend is named.** Six scripts ported. Direct when
  `TYPESAFE_API_KEY` is set; the OIDC 12h expiry no longer stops runs.
- **Resolved P10** (was *contradicted / unexplained*): the hop is ~2× latency; outputs agree within
  P4's noise. Two KEEP→ESCALATE flips, both near threshold.
- **Leads pipeline re-run (session b4f08e, feat/leads-pipeline).** Three instrument bugs fixed (name collisions,
  name-only dedup, all-confident admission gate: L35). Pre-registered on fresh seed 7, n=600, `jev-latest (direct)`,
  resolved version **not captured** (L36): verdict rate 69.7% vs ≥95% required → **FAIL**. Jev 67.8% over all
  leads vs regex **92.2%** (Δ −24.4 pts); 97.4% on its own verdicts. The regex bar is seed-dependent
  (91.7% was on the broken corpus; 93.2% on fixed seed 42). Seed 7 is spent. Same-seed coverage: old gate 19.3% → new 69.7%.
  A pre-merge review found a 4th bug (substring dedup, 22adbbc); the seed-7 mapping is unchanged. Merged: main 0cefc2d. Summary: `program/results/leads-u5-summary.md`.
- **Drift suite (U6, `program/drift.ts`).** 150 direct calls, $0.004. `jev-latest` ≡ `jev-1.13.0` today. The P4 band is
  question-shaped (addendum). Verdict rule tightened after a false positive on the A/A null; disclosed in DRIFT.md and window 5.
- **E3 blind test: VOID.** The "holdout" was the fit set's approved subset (L31, which already warned of this and was
  bypassed by the orchestrator's brief). As-run numbers are kept, not reported as results: Jev 0.744 vs keyword 0.897
  on the in-sample 39. What survives is P24 (option wording). E4 inherits the defect. Branch `feat/e3-blind-test`,
  review dashboard `program/e3-review.html` there.
- **P6 at n=214 (U8, pre-registered, fit/test disjoint).** Entropy AUC 0.978 vs 1−top-p 0.952 vs length baseline 0.852.
  Falsified on F2: entropy's edge over top-p (+0.026) is below the pre-registered 0.05, and it is zero on 2-option questions.
  Wrong-question states are the hardest garbage. `program/P6-REPORT.md`.
- **Leads Q2: literal questions (session b4f08e, pre-registered seed 2718, n=600, `jev-1.13.0 (direct)`).** Verdict rate 97.3%
  (≥ 95%: **PASS**). Over all leads, Jev 88.5% vs regex 91.0%, exact McNemar 30 vs 45, **p = 0.105: no difference shown**. The
  pre-registered prediction ("Jev below regex, p < 0.05") was wrong, and that is recorded as such. The whole remaining gap is adversarial
  rows: Jev escalates 12/30 injections and is right on every one it decides. Overlap with seeds 42/7: 0 full records. Seed 2718 spent.
  Branch feat/leads-literal-questions (49dd854), not merged.

