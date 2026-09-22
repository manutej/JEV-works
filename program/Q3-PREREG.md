# Q3 · Pre-registration: does a batch contaminate itself? (NETER window 3)

Written 2026-09-21 **before any Jev call** for this experiment. It isn't edited after the run. Any
defect found later goes into `Q3-REPORT.md` as a finding.

## Question

Several Jev questions share one call. If we reword **one** question's option descriptions, do
the answers to the **other** questions in the same call move more than run-to-run noise? If they
do, "fan out freely" (bank.ts house rule) has a hidden cost, and every criteria edit needs a
regression suite over the whole batch.

## Batch (6 questions, 3 answer types, one call per state per condition)

| id | source | type | role |
|---|---|---|---|
| `toolKind` | `CLASSIFICATION.label` with P6's `toolKind` options (shell_output · file_contents · file_changed · message_receipt) | choice(4) | **the reworded question** |
| `hasFinding` | `CONTEXT_TRIAGE` | boolean | other, independent |
| `oneTimeSetupSettled` | `CONTEXT_TRIAGE` | boolean | other, independent |
| `emptyOrError` | `CONTEXT_TRIAGE` | boolean | other, independent |
| `density` | `CONTEXT_TRIAGE` | score(4) | other, independent |
| `onTopic` | `CLASSIFICATION` | boolean | other, **coupled**: its instructions say "the subject the categories describe", so it refers to `toolKind`'s options |

Instruction texts are the bank's verbatim. The keys and the order of questions are identical in
every condition. Only `toolKind.criteria` changes.

## States

All **71 clean `toolKind` items** in `program/p6-corpus.json` (seed 20260921; 40 shell_output, 11
file_contents, 12 file_changed, 8 message_receipt). They're real tool outputs from `triage/items2.json`.
That's the domain CONTEXT_TRIAGE was written for, and each item carries a true `toolKind` label. The
state is `{ text }`, as in P6. No state is filtered or dropped after the run.

## Conditions (identical states; 5 calls per state, back to back, order shuffled per state)

- **A**: original batch. `toolKind` descriptions are P6's, verbatim.
- **A′**: A again. This is the A/A noise floor, measured here per question.
- **A″**: A a third time. This is the **placebo**: the detector is run on A-vs-A″ exactly as on A-vs-B.
  If it fires there, the detector is miscalibrated.
- **B**: meaning-preserving reword of all four `toolKind` descriptions:
  - shell_output: *Text that a terminal command printed: console output, directory listings, version strings, exit codes, or stack traces.*
  - file_contents: *A file's text shown with a line number prefixed to every line.*
  - file_changed: *A notice that a file has been written or modified.*
  - message_receipt: *A JSON acknowledgement that a message reached a specific named recipient.*
- **C**: meaning-changing edit of **one** description; the other three stay verbatim (the original A text):
  - shell_output: *An error reported by a shell command: a failure message, a non-zero exit code, or a stack trace.*
  (This narrows the class from "any shell output" to "failed shell output". Most of the 40
  shell_output states are successful commands, so under C they have no clean home.)

Budget: 71 × 5 = 355 calls plus retries, with a hard cap of 800. Concurrency is 4, with exponential
backoff on 429/5xx and `maxRetries: 0` in the SDK. Model: `JEV` from `lib/jev.ts` (direct,
pinned `jev-1.13.0`). `JEV_ID` and each call's `answeredBy` are recorded.

## Metric

This follows `program/drift.ts`. For each question, per state, between two conditions:
- **|Δp|**: for a boolean, |p₁ − p₂|. For a choice or score, L∞ over the returned distribution.
- **flip**: for a boolean, a change of side of 0.5. For a choice, a change of pick. For a score, a
  change of the argmax level.

For comparison X ∈ {B, C, A″}, per question, `dAA′` = |Δp|(A, A′) and `dAX` = |Δp|(A, X) are
**paired by state** (they share the same A reading).

**A question has MOVED under X** if (a) or (b) holds:
- (a) **Magnitude:** p95(dAX) − p95(dAA′) > **0.05**, **and** the paired bootstrap 95% CI of
  mean(dAX − dAA′) has a lower bound > 0.
- (b) **Flips:** flips(AX) − flips(AA′) ≥ **3**, **and** the paired bootstrap 95% CI of the
  flip-rate difference has a lower bound > 0.

The bootstrap resamples the 71 states 2,000 times (mulberry32, seed 20260921). The margins are
hand-set now and aren't fitted. 0.05 is the half-width of the choice noise band in the P4 addendum.
≥ 3 excess flips is the drift suite's rule.

## Decision

Evaluated in this order:

1. **Placebo:** if any question MOVES under A″, the detector fires on a null. The verdict is then
   **INCONCLUSIVE (detector miscalibrated)**, and the numbers are reported without a verdict.
2. **Control (manipulation is live):** `toolKind` must MOVE under C. If it doesn't, the verdict is
   **INCONCLUSIVE (manipulation not live)**. Secondary control: `toolKind` accuracy against the true
   labels is reported for A, B and C.
3. **Verdict**, over the other questions:
   - **CONTAMINATION: a regression suite is needed** (hypothesis "fan out freely" FALSIFIED) if any
     of the five others MOVES under B, or if any of the four **independent** others MOVES under C.
     (`onTopic` under C is reported but excluded: its instructions refer to the categories that C
     changes, so it moving is expected coupling, not leakage.)
   - **NO CONTAMINATION: fan out freely** (not falsified) otherwise.

`toolKind` itself under B is reported but isn't part of the verdict. If a meaning-preserving
reword moves it, that's P24 (wording is a lever), not contamination.

## What this can't show

- It uses one batch, one corpus and one reworded question. A clean result bounds the effect for this
  shape (a 4-way choice edit, next to booleans and a score). It doesn't prove the effect is absent for
  every batch, and it says nothing about adding or removing questions.
- Detectable size: with n=71 the rule can see a p95 shift of more than ~0.05 over noise. Smaller
  systematic shifts are, by P4, below what any threshold can resolve anyway.

> **Erratum (orchestrator, 2026-09-22):** "P24" in this file means the option-wording property, renumbered **P30** (it duplicated the existing P24). The proposed "P30" row was registered as **P31**. Text above is unchanged.
