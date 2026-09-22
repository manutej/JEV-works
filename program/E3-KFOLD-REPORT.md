> **VALIDITY: IN-SAMPLE-ASYMMETRIC: every p-value below compares an in-sample Jev with a held-out baseline, so none of them tests Jev against the baseline on new data.** Annotated 2026-09-22 as a condition of merging (MoE panel). Results below are unchanged.

# E3-K · Report: 5-fold on the 80 CETI hooks, IN-SAMPLE for Jev

Pre-registration: `program/E3-KFOLD-PREREG.md` (commit `01c5fe3`, before any Jev call).
Result file: `program/results/e3-kfold.json`. Review page: `program/e3-kfold-review.html`.
Decision of record, Manu 2026-09-21: **"k-fold on the 80, reported as in-sample"**.

> **Validity: in-sample for Jev; fold-held-out for the keyword baseline.** Jev's v2 option descriptions
> were written by reading all 80 items and labels, so every Jev number below is an in-sample number and
> an **upper bound**. It is not evidence that Jev generalises to unseen hooks. Only the keyword baseline
> (and the majority class and hybrid τ) was fitted on 4 folds and scored on the fifth.

## Headline

**In-sample for Jev: Jev v2 72.5% (58/80, CI95 62.5–82.5%) vs a fold-held-out naive-Bayes keyword
baseline 35.0% (28/80, CI95 25.0–46.3%). Δ +37.5 pts, paired CI95 +25.0…+50.0.** **Different by exact McNemar on per-item correctness: b = 34 (only Jev right), c = 4 (only the
baseline right), p = 6.0e-7 [asymmetric: not a test of generalisation]** (the test of record since correction C2). As run, the verdict was `jev-ahead`
at the pre-registered 0.11 band (and at 0.15); both readings agree. The pre-registered hypothesis is **not falsified**. By the pre-registered
reading rule this is consistent with Jev being useful but, because Jev saw all 80, it is an upper bound
and **cannot** be read as generalisation.

## Reporting contract

| | |
|---|---|
| **n** | 80 items, 5 stratified folds of 16 (seed 20260921); disjointness: id overlap 0, normalised-text overlap 0, corpus duplicates 0 |
| **baseline** | multinomial naive Bayes on tokens, α = 1, fitted on 4 folds, scored on the held-out fold: **35.0%** (CI95 25.0–46.3%), macro recall 17.9%, coverage 100% |
| **result** | Jev v2, fixed descriptions, **in-sample**: **72.5%** (CI95 62.5–82.5%), macro recall 76.1%, coverage 100% (80/80 answered) |
| **delta** | **+37.5 pts**, paired bootstrap CI95 +25.0…+50.0; McNemar: Jev alone right on 34 items, baseline alone right on 4, p = 6.0e-7 [asymmetric: not a test of generalisation] |
| **falsified?** | **No.** As run: Δ ≥ 0.11 and the CI excludes 0 (same at 0.15). Post-hoc test of record (C2): exact McNemar b = 34, c = 4, p = 6.0e-7 [asymmetric: not a test of generalisation] < 0.05 → different. |

Model `jev-1.13.0 (direct)`; every call's `answeredBy` = `jev-1.13.0`. **80 calls** of a 250 budget,
0 retries, 0 failures, per-call p50 128 ms / p95 215 ms, ~$0.003 (RunLog estimate).

## All systems, pooled (n = 80)

| system | fitted on | accuracy | macro recall | coverage | fold mean ± sd (min–max) |
|---|---|---|---|---|---|
| **Jev v2** | all 80 (descriptions) — **in-sample** | **72.5%** | 76.1% | 100% | 72.5 ± 9.5 (62.5–87.5) |
| hybrid: Jev if top-p ≥ τ else NB (secondary) | τ and NB on 4 folds; Jev in-sample | 60.0% | 51.9% | 100% | 60.0 ± 13.0 (43.8–75.0) |
| **NB keyword** | 4 folds — **held-out** | **35.0%** | 17.9% | 100% | 35.0 ± 7.1 (25.0–43.8) |
| majority class | 4 folds — held-out | 26.3% | 11.1% | 100% | 26.3 ± 2.8 |
| E3 hand-written regex (reference) | all 80 — in-sample | 86.3% | 84.8% | 100% | 86.3 ± 8.2 |
| E1 keyword (reference) | no labels — unfitted | 31.3% | 19.3% | 100% | 31.3 ± 7.7 |

Per fold, Jev / NB: fold 0 75.0 / 43.8 · fold 1 62.5 / 37.5 · fold 2 68.8 / 31.3 · fold 3 68.8 / 25.0 ·
fold 4 87.5 / 37.5. Jev is ahead in every fold; with 16 items a fold, one item is 6.25 pts.

## Per-class recall (pooled)

Only three classes have ≥ 8 items (I3); the rest are listed for the reviewer, **no verdict**.

| class | n | Jev v2 (in-sample) | NB (held-out) | E3 regex (in-sample) |
|---|---|---|---|---|
| deprivation-moment | 21 | 13/21 (62%) | **15/21 (71%)** | 21/21 |
| number-outcome-time | 15 | **15/15 (100%)** | 11/15 (73%) | 14/15 |
| call-out | 12 | 4/12 (33%) | 2/12 (17%) | 7/12 |
| how-to-without *(thin)* | 7 | 5/7 | 0/7 | 5/7 |
| halbert-a-pile *(thin)* | 6 | 5/6 | 0/6 | 6/6 |
| damaging-admission *(thin)* | 5 | 4/5 | 0/5 | 5/5 |
| adjective-good *(thin)* | 5 | 4/5 | 0/5 | 3/5 |
| mistakes *(thin)* | 5 | 5/5 | 0/5 | 4/5 |
| receipt *(thin)* | 4 | 3/4 | 0/4 | 4/4 |

Highlights:
- **NB collapses to the two big classes.** It never predicts six of the nine classes correctly
  (0/32 on the six thin classes). Its errors are mostly "deprivation-moment" (the prior) and
  "number-outcome-time" (the `<num>` token). With 3–6 training examples of a class and a vocabulary that
  barely repeats, a bag of words has nothing to learn from — that is the baseline's real ceiling here.
- **The one class where the held-out baseline edges Jev is deprivation-moment** (15 vs 13 of 21; exact McNemar
  b = 1, c = 3, p = 0.63: not different). Jev's losses there go mostly to halbert-a-pile (4 of its 8 misses): short, lowercase scene
  lines read as "subject-line fragments" under v2's wording.
- **call-out is Jev's weakest class even in-sample, 4/12.** Misses scatter: number-outcome-time 3,
  how-to-without 2, deprivation-moment, halbert-a-pile, adjective-good 1 each. "For X:" and "[NAME] —"
  openers usually carry a second device (a figure, a swap), and the likely reading, not checked item by item, is that v2 lets the second device win. The E3 regex, written
  from these very items, gets 7/12 — also weak.
- number-outcome-time is 15/15 for Jev.

## Coverage beside accuracy (Jev top-p, descriptive, nothing fitted)

| top-p ≥ | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
|---|---|---|---|---|---|
| coverage | 82.5% | 76.3% | 68.8% | 60.0% | 43.8% |
| accuracy on covered | 80.3% | 83.6% | 87.3% | 85.4% | 88.6% |

Gating on top-p buys roughly 8–16 pts of accuracy for 17–56% of items sent elsewhere; above 0.7 the
curve is flat within noise. Probabilities are in-sample too.

## Findings

1. **Jev v2 is far ahead of any keyword model that has to generalise** (+37.5 pts, CI +25…+50). But the
   comparison is loaded for Jev, so the size of the gap is an upper bound.
2. **Fitted keyword models memorise this corpus.** The fold-fitted NB scores **97–100% on its own training
   folds** and **25–44% on the held-out fold** (0 calls; recomputed from the saved folds). The same
   in-sample/held-out gap is the most likely reading of E3's hand-written regex at 86%: it was written
   from the same 80 and cannot be held out. *Inference, not measured:* different model, same kind of cue.
   E3's as-run "regex beats Jev" result (void) compared two in-sample systems, and in-sample the regex
   memorises harder.
3. **The hybrid is worse than Jev alone (60.0% vs 72.5%)**, and the reason is a pre-registered design
   flaw, not noise: τ was chosen on the training folds, where NB is scored in-sample (97–100%), so τ went
   high (0.85 in four folds, 0.70 in one) and 4–10 items per fold were deferred to a baseline that is 35%
   held-out. Fitting a fallback threshold against a fallback's in-sample score is the same fantasy
   ground rule 2 warns about, one level down. Recorded as found; not re-fitted.
4. **Jev is repeatable across versions on this task.** Against E3's v2 fit run on the same 80
   (`jev-latest`, 2026-09-21): 77/79 identical choices, identical accuracy 72.5%. The pinned
   `jev-1.13.0` reproduced it.
5. **E3's void hypothesis stays untested.** Nothing here measures a fit→holdout drop; that still needs a
   disjoint, independently labelled set.

## Deviations and corrections

- **C1 (display bug, fixed with 0 calls).** The first scoring pass rounded the McNemar p to 4 dp, printing
  0. Changed to 3 significant figures and re-scored the saved readings (`E3K_ANALYSE_ONLY=1`); no other
  number changed. `reanalysed: true` and the first run's timestamp are in the result file.
- **C2 (post-hoc correction to the test, disclosed; from the team lead after the run).** The brief and the
  pre-registration treated accuracy differences below 0.11 as ties, citing P4. That was a misuse: P4's band
  is one answer's probability jitter across identical calls, not a bound on the gap between two systems'
  accuracies on the same items. The test of record for Jev vs the fold-held-out baseline is now an **exact
  McNemar on per-item correctness** (different iff p < 0.05), with the paired bootstrap CI beside it. The
  pre-registration text is kept as run; McNemar was already computed as a pre-registered secondary, so no
  prediction changed: the runner now also writes `postHocCorrections` (C2) and a McNemar-led headline,
  re-scored from the saved readings with 0 calls; the as-run `delta.verdict` field is kept. Results, pooled: b = 34, c = 4, p = 6.0e-7 [asymmetric: not a test of generalisation] → different (same conclusion as the 0.11
  rule). Per class (n ≥ 8), none different: deprivation-moment b = 1, c = 3, p = 0.63; number-outcome-time
  b = 4, c = 0, p = 0.13; call-out b = 3, c = 1, p = 0.63. Same fix is owed wherever else the 0.11 band was
  used to compare two systems' accuracies (e.g. E3's as-run "baseline wins").
- `npx tsc --noEmit` in this worktree: 14 errors, all in `leads/evaluate.ts` and `leads/pipeline.ts`
  (`../../jev-playground/…` resolves from `~/JEV-works`, not from `~/JEV-works-wt/e3`). Pre-existing on
  main, out of scope, untouched. `program/` and `lib/` compile clean.

## Registry proposal (for U9, the sole registry writer — not applied here)

**NETER.md — new property**

> **P-next · IN-SAMPLE ONLY: on the 80 CETI hooks, Jev with rewritten option descriptions beat a
> fold-held-out keyword model by 37.5 points; this is an upper bound, not generalisation.**
> 5-fold stratified study (seed 20260921, folds disjoint by id and text): Jev v2 72.5% (58/80, CI95
> 62.5–82.5%) vs naive-Bayes keyword baseline fitted on 4 folds and scored on the fifth 35.0% (28/80, CI95
> 25.0–46.3%); Δ +37.5 pts, paired CI95 +25…+50; McNemar 34 vs 4. **The Jev descriptions were written by
> reading all 80 items, so the Jev number is in-sample**; only the baseline is held out. Per class,
> ≥ 8 items: number-outcome-time 15/15, deprivation-moment 13/21 (baseline 15/21; McNemar b = 1, c = 3, p = 0.63, not different), call-out 4/12. Pooled test: exact McNemar b = 34, c = 4, p = 6.0e-7 [asymmetric: not a test of generalisation].
> Evidence: `program/results/e3-kfold.json`, `jev-1.13.0 (direct)`, answeredBy `jev-1.13.0`, 80 calls.
> Status: **measured here, in-sample**. To promote beyond in-sample it needs a disjoint labelled set.

> **Amend P-next+1 (option wording dominates, in-sample)** with: reproduced on pinned `jev-1.13.0`,
> 77/79 identical choices vs `jev-latest`, same 72.5%.

**LESSONS.md — new lesson**

> **L-next · A fallback threshold fitted against the fallback's in-sample score defers to a memoriser.**
> E3-K's hybrid (Jev if top-p ≥ τ, else a fold-fitted keyword model) chose τ on the training folds, where
> the keyword model scored 97–100% because it had just memorised them; held out it scored 25–44%. τ went
> to 0.85 and the hybrid (60.0%) lost to Jev alone (72.5%). Rule: when tuning a threshold that routes
> between two systems, score *both* systems out-of-fold (nested CV) — or the one that memorises wins the
> tuning and loses the test.

**PROGRAM.md — note under E3 (the void notice and hypothesis stay as they are)**

> *K-fold rerun (2026-09-21, Manu: "k-fold on the 80, reported as in-sample"):* Jev v2 72.5% in-sample vs
> fold-held-out keyword 35.0% (Δ +37.5, CI +25…+50). Not a test of E3's hypothesis — no fit→holdout drop
> is measurable without a disjoint set. `program/E3-KFOLD-REPORT.md`.
