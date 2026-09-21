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
