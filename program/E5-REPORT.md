# E5 report: masked targets, Jev vs naive Bayes

The run happened on 2026-09-22 on branch `feat/e5-masked`, pre-registered in `program/E5-PREREG.md` (commit `1609d11`,
made before any call). The run code was committed in `61107d2`, also before the run. There was one run per target,
and nothing was re-run. Jev was `jev-1.13.0 (direct)`, and every call reported `answeredBy` = `jev-1.13.0`.
The run used **868 calls** (budget 950), with 0 retries and 0 failures. It sent 408,386 input tokens, which is
about $0.017 at telemetry's rate, and latency was p50 133 ms and p95 222 ms. Only the TEST half was sent to Jev.

Test of record: exact two-sided McNemar on per-item correctness (p < 0.05), with a paired bootstrap 95% CI on Δ
(2000 resamples, seed 4). A non-answer counts as wrong. The 0.11 band is not used.

## Results (reporting contract: n, baseline, result, delta, falsified)

| target | n test | Jev | coverage | NB | majority | Δ Jev−NB [95% CI] | McNemar Jev vs NB | prediction | falsified? |
|---|---|---|---|---|---|---|---|---|---|
| HotpotQA `type` | 300 | **94.7%** (284) | 100% | 88.3% (265) | 81.0% (243, `bridge`) | **+6.3 pts** [+3.0, +9.7] | b=25, c=6, **p=0.00088**: Jev better | Jev ≥ NB | **no** (held) |
| Housing `furnishingstatus` | 282 | **30.5%** (86) | 100% | 49.3% (139) | 44.0% (124, `semi-furnished`) | **−18.8 pts** [−26.6, −11.7] | b=37, c=90, **p=2.9e-6**: NB better | NB ≥ Jev; neither beats majority | **no** (held) |
| FAF6 `trade_type` | 286 | **98.9%** (283) | 100% | 100% (286) | 37.8% (108, `2`) | −1.0 pts [−2.4, 0.0] | b=0, c=3, p=0.25: no difference | both ≥ 95%, no difference | **no** (held) |

Secondary comparisons:
- Jev vs majority. HotpotQA: b=57, c=16, p=1.5e-6 (Jev better). Housing: b=86, c=124, **p=0.011, so majority is better
  than Jev**. FAF: b=178, c=3, p=6e-49.
- NB vs majority. HotpotQA: b=36, c=14, p=0.0026. Housing: b=79, c=64, p=0.24 (no difference). FAF: b=178, c=0.

**All three pre-registered predictions held.** How much each one tells us varies.

### HotpotQA `type`: Jev beats the baseline on real labels, out of sample

- Per-class recall. Jev: bridge 93.4% (n=243), comparison **100%** (n=57). NB: bridge 94.2%, comparison 63.2%.
  All of Jev's gain comes from the minority class, where NB leans toward the 82% prior.
- **All 16 Jev errors are gold `bridge` items that Jev called `comparison`.** Several of them have the form of a
  comparison, for example "Who was older, George Atzerodt or Andrew Johnson?", "Which mall, Wilton Mall or
  Viaport Rotterdam, has had more owners?" and "Which album came out first, …?". A mislabelled item of the same
  kind was already in the FIT half (prereg). So part of Jev's error is likely HotpotQA label noise. That is
  *inferred*: nobody has reviewed these items yet. The review page can filter to them (NB right, Jev wrong).
- These are the project's first **out-of-sample, real-label, significant** accuracy result for Jev over a fitted baseline.
  The descriptions were written from the field definition and the FIT half only, and the split is disjoint by `_id`,
  with 0 overlaps by id and by text.

### Housing `furnishingstatus`: Jev collapses to one option

- **Jev answered `unfurnished` on 282/282 items**, each at probability 0.97–1.00 (`furnished` 0.00, `semi_furnished`
  ≤ 0.03). Its accuracy, 30.5%, is exactly the test share of `unfurnished`. That puts it **significantly below the
  majority class**.
- NB (49.3%) is not significantly above majority either (p=0.24). The 12 fields barely determine furnishing status.
  That is what the prediction expected: this target has weak signal.
- The prediction held only because Jev did badly. That makes it the useful loss here. On a target the record does not
  determine, Jev did not spread probability and did not hedge. It chose one option at near-certainty every time.
  A hypothesis, **not tested**: the literal option "the house comes without furniture" matches a record that never
  mentions furniture, so the absence of evidence is read as evidence of absence. A probe with neutral wording would
  test this. It would be a new pre-registered run, not a re-run of this one.

### FAF6 `trade_type`: a leaked target, measuring reading and not inference

- Before the run it was disclosed that the label is structurally encoded. Across all 599,529 rows, trade_type follows
  exactly from which of `fr_orig` and `fr_dest` is empty. NB scores 100%. Jev scores 98.9%.
- Jev did get meaningful text. Every code was decoded through `FAF6_Metadata.xlsx`: states, foreign regions, modes,
  SCTG2 commodities, and units.
- Jev's 3 errors are all imports from "Rest of Americas" (destinations Georgia, Georgia, Kansas) that
  it called `domestic` at 0.54–0.70, even though `foreign_origin_region` was set. The difference from NB is not
  significant (p=0.25). The finding to keep is that Jev misread 1% of records whose answer is written in a field.
- Sampling: the 600 data rows with the smallest `sha256("e5:20260922:sample:faf:<row index>")` out of 599,529. The
  file was read in two streaming passes. `masked/targets.json` lists this target with `leakRate: 0`, which is wrong
  for this purpose: the leak is carried by *presence* columns, not by a copy of the value.

## Validity checks

- Disjointness (L31): fit∩test id overlap was **0 / 0 / 0**, and identical-state overlap was 0 / 0 / 0. Printed before the run and re-checked by the run.
- Privacy: 822 + 545 + 600 states were scanned for emails, phone-like strings and credential-like strings, with **0 hits**. The run
  re-scanned what it would send. Only the three public files and the FAF dictionary were read, and no Wassenger file
  or other file from `masked/targets.json` was opened.
- Test caps: HotpotQA had 417 test items, of which 300 were scored by the cap hash and 117 never scored. Housing and FAF were under the cap.

## Disclosures

1. **Smoke test before the run.** To check the scoring and page code, `analyze()` was run on *fake* readings that
   contained no Jev calls. That printed the NB and majority test accuracies (88.3 / 49.3 / 100%) before the Jev run. The
   questions and baselines were already frozen in `1609d11`, and nothing was changed after seeing those numbers. The fake
   outputs were deleted.
2. `lib/telemetry.ts` (RunLog) wrote `runs/e5-masked.jsonl`, which is outside the allowed file list. It is not committed.
3. The raw per-call readings are in `program/results/e5-readings.json`. `node program/e5-analyze.ts` re-derives every
   number above from them with zero calls. `e5-run.ts` refuses to run again while that file exists.
4. The HotpotQA file used is the first of the two identical-name paths in `masked/targets.json`.

## Files

`program/E5-PREREG.md` · `program/e5-data.ts` · `program/e5-questions.ts` · `program/e5-run.ts` ·
`program/e5-analyze.ts` · `program/e5-review.ts` · `program/results/e5-readings.json` ·
`program/results/e5-masked.json` · `program/e5-review.html` (verdict cards, per-item rows, filters, and JSON export of review marks).

## Registry proposal (for the orchestrator; NETER.md §2, next free number, P33 if still free)

| P33 | **Masked real labels, out of sample (E5): Jev beats naive Bayes on a text target, collapses on a weakly determined tabular target, and ties on a leaked one.** One run, hash 50/50 splits (seed 20260922), fit∩test overlap 0, NB and majority fitted on the fit half, exact McNemar. **HotpotQA `type` from the question only** (n=300): Jev 94.7% vs NB 88.3% vs majority 81.0%; b=25, c=6, **p=0.0009**, Δ +6.3 pts [+3.0, +9.7]. Comparison recall is 100% vs NB 63%. All 16 Jev errors are gold-`bridge` items it called `comparison`, several of them comparison-shaped, so label noise is a likely share of them (inferred, not reviewed). **Housing `furnishingstatus` from 12 numeric and yes/no fields** (n=282): Jev answered `unfurnished` on **282/282 at p ≥ 0.97**, scoring 30.5%, **below majority** 44.0% (b=86, c=124, p=0.011) and below NB 49.3% (b=37, c=90, p<1e-5). NB is not above majority (p=0.24). **FAF6 `trade_type`** (n=286 of a 600-row hash sample, codes decoded via the BTS dictionary): the label is encoded by which foreign-region fields are empty, so this measures reading, not inference. Jev 98.9% vs NB 100%, b=0, c=3, p=0.25. Coverage was 100% on all three. **When the record does not determine the answer, Jev neither abstains nor spreads its probability. It commits to one option at near-certainty.** Why is untested (hypothesis: a literal "without furniture" option matches a record that never mentions furniture). | `feat/e5-masked` `program/results/e5-masked.json`, 868 calls, `jev-1.13.0 (direct)` | **measured here** |

Suggested ledger line: *E5 (2026-09-22): first out-of-sample real-label win over a fitted baseline (HotpotQA type, p=0.0009),
first confident constant-output collapse (Housing, 282/282 `unfurnished`), FAF trade_type is leaked by presence columns
(`masked/targets.json` leakRate 0 is wrong for it). All three pre-registered predictions held.*
