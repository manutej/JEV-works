# Q3 · Report: does a batch contaminate itself? (NETER window 3)

Pre-registration: `program/Q3-PREREG.md` (written before any call, not edited since).
Script: `program/q3-contamination.ts`. Raw readings and every statistic:
`program/results/q3-contamination.json`. Run once. `startedAt` is 2026-09-22 UTC (2026-09-21 local).

**Model:** `jev-1.13.0 (direct)` (`JEV_ID`). `answeredBy` was `jev-1.13.0` on 355/355 calls.

## Verdict

**NO CONTAMINATION: fan out freely. The hypothesis "fan out freely" was NOT falsified.**

Rewording one question's option descriptions didn't move the other questions in the same call
beyond A/A noise. That held for a meaning-preserving reword (B) and for a meaning-changing edit (C).
The edit that changed meaning moved its own question hard: the control is live. The placebo arm
(A vs A″, both identical) didn't fire, so the detector isn't miscalibrated.

## n

- **States:** 71, all the clean `toolKind` tool outputs in `p6-corpus.json`.
- **Batch:** 6 questions per call (1 choice, 4 boolean, 1 score).
- **Conditions:** 5 (A, A′, A″, B, C), 5 calls per state, back to back, in shuffled order.
- **Calls:** 355 of 355 planned, **0 failed, 0 retries**, cap 800.
- **Answers per comparison:** the five other questions give 355 (71 × 5). The four independent others under C give 284.
- **Latency per call:** p50 141 ms, p95 270 ms, max 941 ms. Wall clock was 14.5 s.

## Noise floor (A vs A′, measured here)

| question | type | p95 \|Δp\| | max \|Δp\| | flips / 71 |
|---|---|---|---|---|
| toolKind | choice(4) | 0.020 | 0.100 | 1 |
| hasFinding | boolean | 0.050 | 0.120 | 0 |
| oneTimeSetupSettled | boolean | 0.020 | 0.030 | 0 |
| emptyOrError | boolean | 0.020 | 0.090 | 0 |
| density | score(4) | 0.065 | 0.080 | 4 |
| onTopic | boolean | 0.025 | 0.030 | 1 |
| **five others, pooled** | | **0.040** | 0.120 | **5 / 355** |

These are inside the P4 addendum's band (booleans and scores p95 ≤ 0.07). `density` has the most noise
flips: its argmax level changed on 4/71 identical calls.

## Result (the other questions, A vs X compared with A vs A′)

In the table, **excess** is the difference from A vs A′. The CI is a paired bootstrap 95% CI over the
71 states (2,000 resamples, seed 20260921).

| question | B p95 excess | B flip excess | B mean-excess CI | C p95 excess | C flip excess | C mean-excess CI | moved? |
|---|---|---|---|---|---|---|---|
| hasFinding | −0.005 | +1 | [−0.002, 0.006] | +0.005 | +1 | [−0.003, 0.006] | no / no |
| oneTimeSetupSettled | 0.000 | 0 | [−0.000, 0.004] | −0.010 | 0 | [−0.001, 0.003] | no / no |
| emptyOrError | 0.000 | 0 | [−0.003, 0.002] | 0.000 | 0 | [−0.003, 0.001] | no / no |
| density | +0.015 | −1 | [−0.002, 0.010] | −0.005 | −2 | [−0.004, 0.006] | no / no |
| onTopic (coupled) | 0.000 | −1 | [−0.003, 0.002] | +0.005 | −1 | [−0.004, 0.001] | no / no* |

\* `onTopic` under C is excluded from the verdict by pre-registration, because its instructions
refer to the edited categories. It didn't move either.

Pooled over the five others:

| comparison | median \|Δp\| | p95 \|Δp\| | max \|Δp\| | flips |
|---|---|---|---|---|
| A vs A′ (noise) | 0.01 | 0.04 | 0.12 | 5 / 355 |
| A vs A″ (placebo) | 0.01 | 0.04 | 0.09 | 5 / 355 |
| **A vs B (reword)** | 0.01 | **0.05** | 0.13 | **4 / 355** |
| A vs C (meaning change, 4 independent others) | 0.01 | 0.06 | 0.12 | 3 / 284 (noise 4 / 284) |

## Delta

- **Five others under B:** p95 +0.01 over noise, and 1 flip fewer than noise.
- **Four independent others under C:** p95 +0.01 over noise, and 1 flip fewer than noise.
- **Upper bound on the effect:** every other question's CI for the mean |Δp| excess has an upper
  bound of **≤ 0.010**, under both B and C. Any contamination that exists is smaller than a
  hundredth of probability on average. That's below anything a threshold can use (P4).

## Control (the manipulation is live)

- **`toolKind` under C MOVED.** p95 |Δp| went from 0.020 (noise) to **0.640**, max 0.87. There were
  10 flips against 1 in noise. The mean-excess CI was [0.078, 0.180].
- **Accuracy against the true labels fell from 0.887 (A) to 0.746 (C).** shell_output went from
  33/40 to 23/40, and file_contents picks rose from 17 to 27. The narrowed description sent
  successful shell output elsewhere, as intended. The other three classes were unchanged (10/11,
  12/12, 8/8).

## Secondary (not part of the verdict)

- **The meaning-preserving reword nudged its own question, but stayed below the rule.** For `toolKind`
  under B: p95 0.065 against 0.020 noise (excess 0.045, just under the 0.05 margin), max 0.29.
  The mean excess of 0.011 has a CI of [0.005, 0.018], which is above 0. There were 2 flips against
  1 in noise. Accuracy was identical to A (0.887, the same per-class counts). Only 2 of 71 states
  moved more than 0.10, and both were mixed file/shell texts. This is P24's mechanism at low
  amplitude. Rewording is a lever on the question you reword, and even a same-meaning reword isn't
  a strict no-op on that question.

## Falsified?

**No.** Every pre-registered condition for "fan out freely" held:
- The placebo was silent.
- The control was live.
- 0 of 5 others moved under B.
- 0 of 4 independent others moved under C.

## Limits (as pre-registered, plus one)

- There was one batch, one corpus (tool outputs), and one edited question (a 4-way choice). The other
  questions were booleans and a score, with no second choice among them. A choice-next-to-choice
  batch, or a batch near P1's ~32-question range, wasn't tested.
- Only criteria edits were tested. Adding or removing a question, or changing a question's
  instructions (not its options), was not tested.
- The detector's resolution is about 0.05 at p95 with n=71. The CI bound (≤ 0.010 mean excess) is
  the tighter statement.

## Registry proposal

The orchestrator writes these. They are proposals only. The P-number is provisional: take the next
free one at merge.

**Replacement for NETER §5 window 3:**

```
3. ~~**Does a batch contaminate itself?**~~ **Answered 2026-09-21 (Q3, pre-registered): no.** 71 tool-output
   states, one 6-question batch (choice + 4 boolean + score), `jev-1.13.0 (direct)`, 355 calls. Rewording the
   choice's option descriptions (same meaning) or narrowing one option (meaning changed) left the other five
   questions inside A/A noise: pooled p95 |Δp| 0.04 (A/A) vs 0.05 (reword), flips 5 vs 4 of 355; every
   per-question mean-excess CI upper bound ≤ 0.010. Control live: the edited question itself moved (p95 0.02 →
   0.64, accuracy 0.887 → 0.746); placebo A/A″ silent. See P30, `program/Q3-REPORT.md`.
```

**New P-row:**

```
| P30 | **Questions in one batch are independent: editing one question's options does not move the others.** One call, six questions (choice + 4 boolean + score), 71 tool-output states. Rewording the choice's option descriptions, same meaning or changed meaning, left the other five inside the A/A band: pooled p95 \|Δp\| 0.04 → 0.05, flips 5 → 4 of 355, per-question mean-excess CI upper bound ≤ 0.010. That held even for `onTopic`, whose instructions refer to the edited categories. The edit did move its own question (meaning change: p95 0.02 → 0.64, accuracy 0.887 → 0.746; same-meaning reword: small, mean excess 0.011 [0.005, 0.018], accuracy unchanged). So "fan out freely" holds for criteria edits: **regress the question you edited, not the batch.** Untested: choice-beside-choice, batches near P1's 32, adding or removing questions. | our run, n=71 × 5 conditions, pre-registered with placebo and control, `jev-1.13.0 (direct)` (`program/Q3-REPORT.md`) | **measured here** |
```

**bank.ts house rule** ("Fan out freely"). Suggested annotation for whoever owns the bank: *measured
independent for criteria edits (P30). Regression-test only the edited question.*

> **Erratum (orchestrator, 2026-09-22):** "P24" in this file means the option-wording property, renumbered **P30** (it duplicated the existing P24). The proposed "P30" row was registered as **P31**. Text above is unchanged.
