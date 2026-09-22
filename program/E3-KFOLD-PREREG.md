# E3-K · Pre-registration: 5-fold on the 80 CETI hooks, reported as IN-SAMPLE for Jev

Written 2026-09-21 **before any Jev call** for this study. Not edited after the run; anything that turns
out wrong here is recorded in `E3-KFOLD-REPORT.md` as a finding, not fixed here.

## Why this exists

E3 is VOID: its "holdout" `ceti-silver-hooks-approved.json` is the 39 `status=approved` rows of the 80-item
fit file (E3-PROGRESS.md escalation; LESSONS L31). No disjoint labelled set exists. Manu's decision
(2026-09-21, orchestrator session), verbatim: **"k-fold on the 80, reported as in-sample"**.

## The honesty point (applies to every number this study produces)

**Jev's side cannot be out-of-sample.** The v2 option descriptions (`program/e3-questions.ts`) were written
by reading all 80 items with their labels. Every fold was "training data" for the description author, so
splitting the 80 into folds does nothing for Jev: its fold scores are in-sample scores, partitioned.
Descriptions are **not** re-authored per fold with a model — that is a different experiment and is not
approved.

Only these are fitted fold-wise (fit on k−1 folds, scored on the held-out fold):
- the **keyword baseline** (below) — the one genuinely held-out system here;
- the majority-class fallback;
- τ for a secondary hybrid.

So the comparison is **asymmetric by construction and favours Jev.** Reading rule, fixed now:
- *Jev ahead* → consistent with Jev being useful, but it is an **upper bound**; it does not show Jev
  generalises. It cannot promote any NETER claim beyond "in-sample".
- *Tie or baseline ahead* → strong evidence, because Jev had every advantage and still did not separate.

Every headline, in the result file, report and dashboard, carries "in-sample for Jev".

## Data

- Corpus `/Users/manu/CETI/PISCES-MARKETING/assets/ceti-silver-hooks.json` (read-only), 80 items, label
  field `formula`, 9 classes. sha256 `16b9efe1…41fbf7b` (same as E3-PROGRESS.md custody); the run refuses
  a different file.
- Class counts: deprivation-moment 21, number-outcome-time 15, call-out 12, how-to-without 7,
  halbert-a-pile 6, damaging-admission 5, adjective-good 5, mistakes 5, receipt 4.

## Folds

- **k = 5, stratified by `formula`**, seed **20260921** (`mulberry32`). Within each class (FORMULA_KEYS
  order, ids sorted, then seeded Fisher–Yates) items are dealt round-robin with one running counter across
  classes, so every fold has exactly 16 items and each class is spread as evenly as possible.
- Stratification is only partial for the smallest class: **receipt has 4 items < k = 5**, so fold 0 has no
  receipt and folds 1–4 have one each. All other classes appear in every fold. Every training split has
  ≥ 3 items of every class, so no class is unknown to the fitted baseline in any fold.
- Folds file: `program/results/e3-kfold-folds.json`, sha256
  **`2558c7c261572f69ea398d6df08190588fc9a3d39fbd7bd3b620d1c607ac1b47`**. Hard-coded in
  `program/e3-kfold.ts`; the run refuses a different file.
- **Disjointness check (L31), run by `e3-kfold.ts folds` and again at run time, counts only:**
  pairwise id overlap **0**, pairwise normalised-text (lowercase, whitespace-collapsed, sha256) overlap
  **0**, duplicate normalised texts inside the corpus **0**, folds cover the 80 exactly: **true**.
  Any overlap > 0 blocks the run.

## Systems

| system | role | fitted on | out-of-sample? |
|---|---|---|---|
| **Jev v2** (`e3-questions.ts` v2, one `choice`, argmax) | **result** | descriptions written from all 80 | **no — in-sample** |
| **NB keyword** — multinomial naive Bayes, α = 1, class prior from training folds | **baseline** | k−1 folds | **yes, fold-held-out** |
| training-fold majority class | reference | k−1 folds | yes |
| hybrid: Jev if top-p ≥ τ else NB; τ on the E3 grid {0, 0.20…0.90}, tie → smallest, chosen on training folds | secondary, never decides | k−1 folds (τ, NB) | Jev part no |
| E3 hand-written regex (`e3-keyword-baseline.ts`) | reference | all 80 | no — in-sample |
| E1 keyword baseline (`keyword-baseline.ts`) | reference | written without labels | unfitted |

NB tokens: lowercased words (with apostrophes), digit runs → `<num>`, and the symbols `→ $ ? ! : — [ ] %`
as tokens. **No hand-picked shape features** (e.g. "starts lowercase", "≤ 32 chars"): those came from
reading the 80, so adding them would leak the in-sample reading into the one held-out system. Known
consequence: NB is blind to letter case and length, which is most of what marks `halbert-a-pile`.
Unseen tokens are ignored; score ties go to the earlier FORMULA_KEYS class.

Why NB and not the E3 regex as the baseline: the regex cannot be refitted per fold (it is hand-written
from all 80), so it is in-sample like Jev. The brief asks for a baseline "fitted on k−1 folds and scored on
the held-out fold"; NB over the same kind of cues (words, figures, punctuation) is the simplest keyword
model that can be.

## Jev calls

`JEV` / `JEV_ID` from `lib/jev.ts` (direct → pinned `jev-1.13.0` when the key is present); every call records
`answeredBy()`. State `{text}`. One call per item: **80 calls**, concurrency 4, `maxRetries: 0` in the SDK
with an outer loop of ≤ 4 attempts on transient errors (429/5xx/timeout), hard **budget 250 attempts**.
A non-transient error (e.g. the top-probability tie that `evaluate()` rejects, E3 A8) is a **wrong answer
and a coverage loss**, never a dropped item. The Jev pass is one-shot: the script refuses to call again if
the result file exists; re-scoring saved readings (`E3K_ANALYSE_ONLY=1`) makes 0 calls.

## Metrics

For every system: **pooled** (n = 80) accuracy, macro recall, per-class recall, **coverage** (answered / n,
beside accuracy, META-PLAN §9.2); **per-fold** accuracy, macro recall, coverage, and the fold mean / sd /
min / max. Per-class recall is flagged `insufficientData` below 8 items (I3): only deprivation-moment,
number-outcome-time and call-out clear that bar pooled; **no per-class verdict for the other six**, and
no per-class verdict at fold level at all (≤ 5 per class per fold).

Also reported, descriptive only: Jev top-p coverage sweep (coverage and accuracy-on-covered at
0.5/0.6/0.7/0.8/0.9 — nothing fitted), confusion matrices, exact McNemar on the discordant pairs, and
repeatability against E3's earlier v2 fit run on the same 80 (`e3-fit.json`, `jev-latest`).

CIs: item-resampling bootstrap, 10 000 draws, seed 7. For Jev − NB the CI is **paired** (same resampled
items for both), since both systems answer the same 80.

## Hypothesis and falsifier

*Hypothesis.* Jev v2 (in-sample) pooled accuracy on the 80 exceeds the fold-held-out NB keyword baseline
by **≥ 0.11**, with the paired bootstrap 95% CI of the difference excluding 0.

*Falsified if* Δ < 0.11, or the paired CI includes 0, or the baseline is ahead.

Verdict labels: `jev-ahead` (Δ ≥ 0.11 and CI low > 0), `baseline-ahead` (Δ ≤ −0.11 and CI high < 0),
otherwise `tie`.

## Which noise band, and why 0.11 rather than 0.15

- **0.11 is the verdict band** (ground rule 6 / P4). It is the programme-wide rule for "differences below
  0.11 are not differences", and E3 itself used it.
- The P4 addendum's 0.15 is the jitter of a **9-way-ish choice's selected probability** between repeat
  calls (a flat 5-way choice reached 0.15). It is not an accuracy band: the same addendum found the
  argmax flipped on 2/16 choice states, and only where the top-2 margin was ≤ 0.04. Accuracy moves only
  when argmax flips, so call-to-call accuracy jitter here is expected to be well under 0.11.
- The larger noise in an accuracy difference at n = 80 is **sampling**, which the paired CI measures
  directly. Requiring both (≥ 0.11 *and* CI excluding 0) covers both sources.
- **0.15 is reported as a sensitivity check** (`sensitivityAt015`): if the verdict changes between 0.11 and
  0.15, the report says so and the result is treated as fragile.
- 0.15 *is* the band for anything read off probabilities here (e.g. τ values within 0.15 of each other are
  the same τ; the coverage sweep is descriptive for that reason).

## Outputs

- `program/results/e3-kfold.json` — reporting contract (n, baseline, result, delta, falsified) plus
  `validity: "in-sample for Jev; fold-held-out for the keyword baseline"`, model, answeredBy, calls used.
- `program/e3-kfold-review.html` — per-item manual review (text, true label, Jev choice + probabilities,
  fold-held-out NB guess, agree/disagree filters, JSON export of marks).
- `program/E3-KFOLD-REPORT.md` — real numbers only, and a registry proposal that says in-sample.
