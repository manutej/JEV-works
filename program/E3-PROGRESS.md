# E3 progress — blind test: fit on consensus, validate on untouched real labels

Work unit **U7** (META-PLAN §4). Branch `feat/e3-blind-test`, worktree `/Users/manu/JEV-works-wt/e3`.
Hypothesis and falsifier are PROGRAM.md's, quoted verbatim, not edited:

> *Hypothesis.* Holdout accuracy drops less than 5 points from fit, and beats the baseline.
> *Falsified if* the drop exceeds 5 points (overfitting to the fit set) or the baseline wins.

## Human approval (verbatim)

Manu (human-of-record), 2026-09-21, answering "Pre-approve the one-shot holdout run?":

> "Run evaluation upon the questions and move forward with consensus but also create an html dashboard for manual review. NO stopping, keep going in the meantime and track the logs and results and assumptions."

Read as: the U7 HUMAN gate (META-PLAN §4) is passed for **one** holdout run, after the question set and
thresholds are frozen and committed. Not approval for a second run, a push, or any deletion (I10, I11).

## Holdout custody (I2)

Recorded 2026-09-21T21:24:05Z, before any E3 code existed. Only these two facts were read:

| file | sha256 | items |
|---|---|---|
| `ceti-silver-hooks-approved.json` (HOLDOUT) | `3948c5b38d1b48efdfc745021ea03fc689039a2ae2143161e3852b6e52a099c1` | 39 |
| `ceti-silver-hooks.json` (FIT) | `16b9efe1cfbea781b3b83d2f9e68dc4b7d88bd42c3c4f69ada89ae95b41fbf7b` | 80 |

The count was taken with a one-liner that parses the file and prints only `.length`. No field, text or label
was printed, grepped or inspected. The holdout run re-hashes the file and refuses to run on a mismatch.

## SolutionSketch

**What E1's consensus revealed.** Five labellers were 49% right overall and only 73% right when unanimous.
Reading the 80 fit items against their labels shows *why*: several option descriptions did not describe the
human taxonomy at all. The labellers were not noisy; they were faithfully answering the wrong question.

| class (n on fit) | E1 consensus correct | what the labels actually mean (from the 80) |
|---|---|---|
| halbert-a-pile (6) | 0/6, 3 unanimous-wrong | not "pile imagery" — Halbert's *A-pile*: a lowercase, personal-looking subject line about a shared item ("that clause on page 12") |
| adjective-good (5) | 0/5 | the offer named as a characterful thing ("The lazy proposal-reader", "Furnished room") |
| receipt (4) | 1/4 | proof by comparison or credential (a competitor's price, Fortune 500, citations), not only literal quotes |
| damaging-admission (5) | 2/5 | also risk-reversal that concedes it might fail ("if week one flops, you walk") |
| deprivation-moment (21) | 12/21 | a felt scene of current pain (11pm desk, Sunday rewrite); "you" questions go here, lost 5 to call-out |
| number-outcome-time (15) | 10/15 | any figure-led payload: before→after ("6 hr → 90 min"), price, seats, deadline |
| call-out (12) | 8/12 | "For X:", a [NAME] greeting, or us-vs-them positioning ("They demo cats. You need…") |
| how-to-without (7) | 4/7 | also "Stop X. Get Y." swaps; lost 2 to mistakes |
| mistakes (5) | 2/5 | warnings, including FOMO ("people who moved early are already gone") |

**Approach.**
1. Question variants (all over the same 9 keys, one Jev `choice`):
   `v1` = E1/E2's descriptions unchanged (control, re-run same-day on the same backend);
   `v2` = descriptions rewritten from the table above (mechanism + form, no label names);
   `v3` = `v2` plus disambiguation rules in `instructions` for the confusions E1 exposed.
2. Run each variant on the 80. **Selection rule (declared now):** highest fit accuracy; tie → higher macro
   recall; tie → the earlier (simpler) variant. The chosen variant is the primary E3 system.
3. **Threshold (secondary system only):** a hybrid that falls back to the fitted keyword baseline when Jev's
   top probability is below τ. τ is grid-searched on the 80 over {0, 0.2, 0.25, …, 0.9}; tie → smallest τ.
   The verdict uses the primary system, never the hybrid — declared before the run so a hybrid that wins on
   holdout cannot be promoted after the fact.
4. **Keyword baseline** (`program/e3-keyword-baseline.ts`): regex rules written by reading the 80, first
   match wins, fallback = fit-set majority class. Its fit accuracy is in-sample and flattering by
   construction; the holdout number is the honest one. E1's unfitted baseline and majority-class are
   reported alongside.
5. **Freeze:** write the chosen question set, τ, and the git hash of the committed code into
   `results/e3-blind.json`, commit. The holdout mode refuses to run if (a) the file sha256 differs,
   (b) a holdout section already exists (one-shot), (c) the E3 code differs from the frozen commit.
6. **Holdout:** 39 Jev calls, once. Score, write results, build `program/e3-review.html`.

**Key decisions, traced.**
- Fitted keyword baseline, not E1's → ground rule 1 / I1 and PROGRAM's "keyword baseline built on the same 80".
- Holdout hashed + counted only, run guard in code → I2 / ground rule 2.
- Per-class recall carries `insufficientData` when the holdout class n < 8; no per-class verdict from it → I3.
- Win/loss vs baseline uses the 0.11 floor → I6 / P4 (see Assumption A3 for how the 5-point drop rule sits with it).
- Primary system declared before the run; hybrid is secondary → ground rule 2 (no post-hoc selection).
- Losses reported as the result → I5.
- `npx tsc --noEmit` before each commit → I7. Key only via `source ~/.zshrc`, never echoed → I8.
- No registry edits (NETER/LESSONS/README/llms.txt); proposal at the bottom of this file → I9 / U9 is sole writer.
- Nothing pushed → I11.

**Rejected alternatives.**
- *Use E1's plurality vote as the training label* ("fit on consensus" read literally). Rejected: E1 showed the
  consensus is 49% wrong against real labels; fitting to it would import that error. The consensus is used
  for what it is good at — diagnosing which option descriptions are broken.
- *Per-class prior offsets fitted on the 80* (9 free parameters, 4–21 items per class). Rejected as
  overfit-by-construction at this n.
- *Concept probes (boolean per mechanism)*. That is E4; mixing it in would confound E3.
- *More than 3 description variants / iterating until fit accuracy is high.* Each extra selection step
  inflates the fit number; 3 is enough to show whether rewriting descriptions matters.

## Assumptions (taken as they arose)

- **A1** The holdout has the same schema (`id,text,formula,…`) and a label set within the 9 fit classes.
  Cannot be checked before the run without inspecting it. The run checks it and records any out-of-set
  label as a finding; out-of-set items count as wrong for every system (no system can predict them).
- **A2** Some holdout texts might also appear in the fit set ("approved" may be a subset). The run counts
  exact-text overlaps and reports them; the primary metric stays on all 39 as pre-registered, with a
  de-duplicated secondary.
- **A3** *The hypothesis as written is finer than the lab's own noise floor.* "Drop < 5 points" is 0.05,
  below P4's 0.11, and at n=39 one item is 2.6 points. Applied as written (drop > 0.05 → falsified); a
  bootstrap 95% CI on the drop is reported so the reader can see how much of it is sampling noise.
  Recorded as a finding, not a rewrite.
- **A4** "Beats the baseline" / "the baseline wins" read through P4: Jev wins if acc − baseline ≥ 0.11,
  the baseline wins if baseline − acc ≥ 0.11, anything between is a tie. A tie means the hypothesis is
  *not supported* but the "baseline wins" falsifier did not fire; both are reported.
- **A5** "Fit→holdout drop" = primary-system accuracy on the 80 minus on the 39.
- **A6** The baseline for the falsifier is the E3 fitted keyword baseline (PROGRAM: "a keyword baseline
  built on the same 80").
- **A7** The run uses the direct backend, concurrency 4, maxRetries 2 (leads run shares the rate limit).

## Log

- 2026-09-21 21:24Z holdout sha256 + count recorded; SolutionSketch written.
- 2026-09-21 code committed `0afc3dd` (runner, variants, fitted keyword baseline). tsc green.
- 2026-09-21 fitted keyword baseline on the 80: **0.8625 in-sample** (69/80). Rules were written by reading
  the labelled fit set, so this number is expected to be inflated; stopped at 11 misses rather than
  memorising individual lines.
- 2026-09-21 fit runs on the 80 (`jev-latest (direct)`, concurrency 4, 0 rate-limit retries):
  v1 (E1 wording) **0.375** / macro 0.336 · v2 (consensus-informed) **0.725** / macro 0.761 · v3 (v2 + rules) 0.6875 / 0.707.
  Rewriting the option descriptions from E1's failures nearly doubled fit accuracy; adding explicit
  disambiguation rules did not help further. E1 keyword 0.3125, majority 0.2625.
- **A8** One v2 fit call (h76) failed with the SDK's "did not select a highest-probability option" — the
  direct API rounds to 2dp, so a top-probability tie is rejected by `evaluate()` core. Counted as a wrong
  answer (never dropped), same rule on the holdout. Not patched: the fix would touch frozen code for one item.
- **A9** `costFromUsage` needs gateway credentials that this direct-backend run doesn't have, so `cost.totalUsd`
  is NaN; the RunLog estimate (input tokens × $0.042/M) is in each `telemetry.dollars` (~$0.003 per 80 calls).
- 2026-09-21 freeze: **v2 selected** (rule: fit accuracy). Hybrid τ fitted = 0.85 (fit 0.8375 — at that τ
  it mostly defers to the in-sample keyword rules; secondary only). Frozen against commit `0afc3dd`.
- 2026-09-21 **holdout run, once** (commit `2d26727`, as written by the runner): Jev v2 **0.7436** (29/39),
  macro 0.727 · fitted keyword **0.8974** (35/39) · hybrid τ=0.85 0.8205 · E1 keyword 0.2821 · majority 0.2308.
  Drop fit→holdout **−0.019** (CI95 −0.18…+0.15). Jev − keyword **−0.154** (CI95 −0.33…0.00). 0 errors,
  0 rate-limit retries, 39/39 in 2 s. As-run falsifier fired: baseline wins (Δ ≤ −0.11); drop rule did not fire.

## ⚠ ESCALATION — the holdout is a subset of the fit set; E3 is VOID as a blind test

The run's own overlap diagnostic (A2) reported **39/39** holdout texts present in the fit set. Checked after
the run (the look was already spent): `ceti-silver-hooks-approved.json` is exactly the 39 `status: "approved"`
rows of `ceti-silver-hooks.json` — same ids, identical text, identical labels (the other 41 are `killed`).

Consequences:
- There was never an untouched holdout. PROGRAM.md's E3 premise ("blind-validate on … never inspected")
  was false at pre-registration; I2 was honoured procedurally (hash + count only), but the file itself was
  already inside the fit data, and both the v2 descriptions and the keyword rules were written by reading it.
- The as-run numbers therefore compare two **in-sample** systems. The regex, with ~20 hand-written patterns,
  memorises the 80 harder (86%/90%) than nine option descriptions do (73%/74%). That is not evidence about
  which transfers to unseen hooks. The −0.019 "drop" is just the approved subset being slightly easier.
- The pre-registered hypothesis is **not edited**. `results/e3-blind.json` keeps every as-run number and
  the as-run headline (`headlineAsRun`); a `validity` block (added after the run by `program/e3-validity.ts`,
  commit `6cfb271`) marks the result VOID.
- Smallest reversible path taken: record + continue (Manu: "NO stopping"). No second run was attempted —
  there is nothing unseen to run on.

What survives (all in-sample, all fitting-disclosed):
- **Option wording is the dominant lever.** Same model, same 80, same backend: E1's wording 0.375 → the
  consensus-informed wording 0.725. The 0/6 and 0/5 classes (halbert-a-pile, adjective-good) went to 5/6
  and 4/5. E1's "unanimous but wrong" items were a *description bug*, not labeller noise.
- **Jev is repeatable:** 38/39 identical choices between the fit run and the holdout run on the same items.
- Fitting-free comparison (the only clean one here): Jev v1 0.375 vs E1's unfitted keyword 0.3125 on the 80 —
  Δ 0.06, below the 0.11 floor: a tie.

To actually test E3: a labelled set disjoint from the 80 — e.g. hooks authored after 2026-09-21 — and a
**blind disjointness check before the run**: hash each normalised text in both files and print only the
overlap count. That check needs no inspection and would have caught this before the look was spent.

- 2026-09-21 dashboard `program/e3-review.html` generated by `program/e3-review-build.ts` (80 items,
  filters for Jev-wrong / keyword-wrong / disagreements / unreviewed, per-item review marks + JSON export).

## Registry proposal (for U9, the sole registry writer — not applied here)

**NETER.md — new property**

> **P-next · A holdout must be proven disjoint before it is declared, and that proof needs no look.**
> E3's "untouched" holdout (`ceti-silver-hooks-approved.json`, 39) was the `status=approved` subset of the
> 80-item fit set — same ids, text and labels. The hash-and-count custody (I2) was followed and still could
> not detect it. Evidence: `program/results/e3-blind.json` → `validity` (39/39 overlap), model
> `jev-latest (direct)`, commits `2d26727`/`6cfb271`. Rule: before any holdout run, compare hashed
> normalised texts (and ids) across fit and holdout, printing only the overlap count; > 0 blocks the run.

> **P-next+1 · Option wording, not the model, dominated formula accuracy (in-sample).** Same Jev, same 80
> hooks: E1 descriptions 0.375 → descriptions rewritten from E1's unanimous-but-wrong items 0.725
> (`program/results/e3-fit.json`, `jev-latest (direct)`). In-sample only — the out-of-sample test (E3) is
> void, so this is a lead, not a validated property.

**LESSONS.md — new lesson**

> **L-next · "Unanimous and wrong" is a spec bug before it is a labeller bug.** E1's labellers agreed 3/3
> times on halbert-a-pile and were wrong every time because the option said "pile imagery" while the
> taxonomy meant Halbert's A-pile (a personal-looking subject line). Read the items the consensus got
> unanimously wrong before concluding consensus fails. Corollary: a sibling file named "approved" is a
> filter of its parent until proven otherwise — check disjointness blind before calling it a holdout.

**PROGRAM.md — note for the E3 section (U9 to decide; the hypothesis text stays as is)**

> *Result (2026-09-21):* VOID — holdout ⊂ fit set (39/39). As-run: Jev 0.744 vs fitted keyword 0.897 on
> in-sample items; drop −0.019. Re-run requires a disjoint labelled set. E4 also names this 39 as its
> holdout and inherits the same defect.

## Corrections

- **C1 (my bug)** `freeze` stamped `model` from its own process's `JEV_ID`. Freeze ran without sourcing the
  key, so it recorded `typesafe-ai/jev (gateway)`. Freeze makes no model calls; all 279 Jev calls (3×80 fit
  + 39 holdout) went through `jev-latest (direct)`. `e3-validity.ts` corrects `model` and keeps the wrong
  value under `corrections[]`. Frozen code is not patched after the run.

## E3-K — k-fold rerun on the 80 (in-sample for Jev)

Manu, 2026-09-21 (orchestrator session): "k-fold on the 80, reported as in-sample".

- 2026-09-21 `feat/e3-blind-test` rebased onto main (`b1b504a`) without conflicts, so `lib/jev.ts`
  (pinned `jev-1.13.0`, `answeredBy`) and `lib/harness.ts` are available.
- 2026-09-21 folds built (`e3-kfold.ts folds`, 0 calls): k=5, stratified, seed 20260921, 16 items each;
  disjointness ids 0 / normalised text 0 / corpus duplicates 0 / covers 80. Pre-registration
  `program/E3-KFOLD-PREREG.md` committed before any Jev call.
- `npx tsc --noEmit` in this worktree reports 14 errors, all in `leads/evaluate.ts` and `leads/pipeline.ts`:
  they import `../../jev-playground/…`, which resolves from `~/JEV-works` but not from `~/JEV-works-wt/e3`.
  Pre-existing on main; not touched here (out of scope). `program/` and `lib/` are clean.
