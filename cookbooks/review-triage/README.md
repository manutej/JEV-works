# Review Complaint Triage (E-commerce)

> Flag the reviews a customer-care agent should read today.

> **Licence: CC0 1.0 (public domain).** No restrictions. Attribution given as a courtesy. Reviewer ages and ids were dropped.  
> *Verified:* Kaggle dataset API for nicapotato/womens-ecommerce-clothing-reviews, checked 2026-09-22 (the data was fetched from a SHA-1-checked mirror of the same file)

**Gate suite (kit/standard-gate.ts): REFUSE** (refused by G9-calibration-audited; G8.unstable, G9.uncalibrated) · warnings: G8-threshold-fitted-and-held · post-hoc headline vs naive Bayes: **ACCEPT**. Details: [results/gates.json](results/gates.json) and the Gates section below.

**Verdict: Jev better.** 92.7% against 52.7% for the fit-only keyword lists (p = 1.3e-15). Those lists were close to useless: they flagged almost everything. The fairer comparison is the post-hoc naive Bayes trained on 2000 reviews: 85.3%, still significantly behind (p = 0.019). The gain is on happy reviews with a gripe in them, which Jev correctly left alone (89.3% vs 77.3%).

Page: [demo/review-triage.html](../../demo/review-triage.html) · detailed data notes: [NOTES.md](NOTES.md)

## The problem
A retailer gets thousands of product reviews. Customer care wants to see the ones from unhappy customers (the reviewer would not recommend the item) without reading every glowing one.

**Data:** [Women's E-Commerce Clothing Reviews (nicapotato, 2018)](https://www.kaggle.com/datasets/nicapotato/womens-ecommerce-clothing-reviews). **Licence:** CC0 (public domain). Fetched from a pinned, SHA-1-checked HF mirror of the same CSV.
nicapotato (2018). "Women's E-Commerce Clothing Reviews." Kaggle.

**What Jev reads:** { category, title, review }. The star rating is withheld: it would leak the label (4–5 stars → recommend in 98.9% of rows). Reviewer age and ids dropped.

## Question module
The registry form of this set is [context.json](context.json) (kit/modules format, feat/kit; passes meta-type M1–M7 with 0 errors; 5 M6 warning(s): nouls without criteria.true/false, left as measured rather than reworded after the test). The runnable kit spec is [spec.json](spec.json); both carry the same measured wording.

| id | type | purpose | polarity |
|---|---|---|---|
| `wouldNotRecommend` | noul | The decision asked directly (labelled). Scored by the kit as a comparison; not used by the rule. | bad-when-yes |
| `returned` | noul | true → complaint. Says they sent it back, or will. | bad-when-yes |
| `fitProblem` | noul | true → complaint. Says it did not fit (too big, small, long...). | bad-when-yes |
| `flawDescribed` | noul | true → complaint. Names a defect or damage. | bad-when-yes |
| `differsFromListing` | noul | true → complaint. Looked different from the photo or description. | bad-when-yes |
| `likesItem` | noul | true → keep quiet. Says they love or like it: the counterweight to a small gripe. | good-when-yes |
| `mainIssue` | choice | Choice with an escape (`none`: no problem described). `none` feeds the rule; the others route to a team. | neutral |

## The question set (as measured)
One call per item, all questions batched (P31). "ends" = the share of test answers that reached a confident end (kit label-free quality report).

| question | type | instructions | role / polarity | test quality |
|---|---|---|---|---|
| `wouldNotRecommend` **(decision)** | noul | Based on this product review, would the reviewer NOT recommend this item to other shoppers? | The decision asked directly (labelled). Scored by the kit as a comparison; not used by the rule. | JEV-SAFE, ends 72% |
| `returned` | noul | Does the reviewer say they returned the item, are returning it, or will send it back? | true → complaint. Says they sent it back, or will. | JEV-SAFE, ends 99% |
| `fitProblem` | noul | Does the reviewer say the item did not fit them: too big, too small, too long, too short, too tight, too loose, or the wrong shape for their body? | true → complaint. Says it did not fit (too big, small, long...). | JEV-SAFE, ends 81% |
| `flawDescribed` | noul | Does the reviewer describe a flaw in the item itself: arrived damaged, a hole, a tear, loose threads, pilling, fading, shrinking, see-through fabric, a broken zipper, or fabric or stitching that feels cheap? | true → complaint. Names a defect or damage. | JEV-SAFE, ends 80% |
| `differsFromListing` | noul | Does the reviewer say the item looked different in person than in the online photo or description (a different colour, pattern, fabric or cut)? | true → complaint. Looked different from the photo or description. | JEV-SAFE, ends 81% |
| `likesItem` | noul | Does the reviewer say they love, like, or are happy with the item? | true → keep quiet. Says they love or like it: the counterweight to a small gripe. | JEV-SAFE, ends 67% |
| `mainIssue` | choice (fit, quality, appearance, other, none) | What problem with the item does the reviewer give as the reason they are unhappy? If they give several, pick the one they mention first. | Choice with an escape (`none`: no problem described). `none` feeds the rule; the others route to a team. | JEV-SAFE, ends 61% |

Why these are literal: each asks about the one record in front of Jev, answerable by reading it: no counting, arithmetic, dates, cross-record comparison or degree judgement (NETER P18, P21; L37). Every choice has an escape option (P5).

**What the label-free quality pass changed**
- Pilot and fit: every question JEV-SAFE. No change was needed.

## Not for Jev
| judgement | instead |
|---|---|
| Star rating | Already a number in the record. Also withheld from Jev because it leaks the label. |
| How unhappy is the reviewer? | Not asked: a degree judgement. The regression over literal signals produces the gradation. |
| Is this a known problem with this product? | Aggregate flags per product id in code; Jev sees one review. |
| Review length, helpful votes | Counting, in code. |

## The decision rule
Binary. A logistic regression (L2, λ = 1, fitted on the 100 fit items) over `returned`, `fitProblem`, `flawDescribed`, `differsFromListing`, `likesItem`, `mainIssue=none`.

Frozen weights: `returned` 0.117 · `fitProblem` 0.729 · `flawDescribed` 0.667 · `differsFromListing` -0.265 · `likesItem` -2.541 · `mainIssue=none` -1.989 · bias 1.351.

Decide "yes" when the score ≥ **0.42**; act automatically outside the escalate band **[0.42, 0.502)**, send the band to a human.

**How the thresholds were chosen** (fit split only, frozen in [rule.frozen.json](rule.frozen.json) and committed before any test call):
- **Cut:** minimises 1·FP + 3·FN on the fit split (fit cost 16). A missed unhappy customer (false negative) is a lost repeat buyer and an unanswered public complaint; a false flag costs a CX agent about a minute to read a satisfied review and close it. 3:1 favours recall without flooding the queue. Chosen, not measured; note the fit split is 50/50 while live traffic is ~18% not-recommended, so live precision will be lower than on fit.
- **Band:** widest band whose auto-decided fit items stayed within 10.0% error (fit coverage 91.0%, fit error 9.9%). Auto-flag or auto-skip only where the fit split made at most 1 error in 10: a wrong call here costs a minute or a delayed reply, not a safety or money decision, so a looser band than moderation (0.05) is acceptable; everything between goes to a human skim.

## Results (test split, n = 150, one labelled run, `jev-1.13.0 (direct)`, answered by `jev-1.13.0`)

| system | accuracy (all items) | vs Jev rule: only Jev right / only other right | exact McNemar p | reading |
|---|---|---|---|---|
| **Jev, frozen rule** | **92.7%** | | | |
| Jev, one broad question `wouldNotRecommend` (kit scorecard, p ≥ 0.5) | 93.3% | vs keywords: 65 / 4 | 3.1e-15 | Jev better (vs keywords) |
| Keyword lists, fit split only (**declared baseline**) | 52.7% | 63 / 3 | 1.3e-15 | Jev better |
| Naive Bayes on 2000 labelled rows (**post-hoc**) | 85.3% | 15 / 4 | 0.019 | Jev better |
| Majority class ("true", from fit) | 50.0% | 67 / 3 | 9.7e-17 | Jev better |

**Coverage:** Jev answered 150/150. **Gated:** the frozen gate acted on 95.3% (143) at 93.0% accuracy and held 7 for a human; on those same auto-decided items the keyword lists scored 51.0%. (McNemar 63/3, p = 1.3e-15)

**By true label (L41: a pooled result must not hide a stratum going the other way)**

| label | n | Jev | keywords | p | naive Bayes | p |
|---|---|---|---|---|---|---|
| true | 75 | 96.0% | 94.7% | 1 | 93.3% | 0.73 |
| false | 75 | 89.3% | 10.7% | 3.5e-18 | 77.3% | 0.012 |

Sources: [results/test.json](results/test.json) (kit), [results/decision-test.json](results/decision-test.json) (frozen rule), [results/strong-baseline-test.json](results/strong-baseline-test.json) (post-hoc). Fit: [results/fit.json](results/fit.json); pilot: [results/pilot.json](results/pilot.json). Calls: pilot 30, fit 100, test 150.

The naive Bayes was added after the test run, because the declared keyword lists (fitted on 100 items) were near chance in several domains. It does not alter the declared comparison (the keyword row above); it answers "would a cheap model with far more labels have done as well?", and where that changes the practical verdict (job-postings), the verdict line says so.

## Gates
Standard suite from [results/gates.json](results/gates.json) (`cookbooks/_shared/gates.ts`, no Jev calls). G5–G7 test the **declared** headline: the frozen rule vs the fit-only keyword lists, with true labels as strata (they partition the headline; Holm-corrected).

| gate | verdict | why |
|---|---|---|
| G1-spec-valid | PASS | spec is valid |
| G2-privacy | PASS | 0 hits in 150 states |
| G3-text-disjoint | PASS | fit 100 / test 150, 0 overlap by id or text |
| G4-coverage | PASS | coverage 100.0% ≥ 95% |
| G5-policy-predeclared | PASS | the scoring policy was fixed before the holdout existed: passed |
| G6-paired-test | PASS | the headline is an exact paired test (McNemar) with n ≥ 8: passed |
| G7-strata-consistent | PASS | every stratum large enough to judge agrees with the pooled headline: passed |
| G8-threshold-fitted-and-held | WARN (G8.unstable) | POST-HOC bounded gate on frozen logistic score: bound held, but the cut is unstable under resampling (bootstrapCuts) |
| G9-calibration-audited | REFUSE (G9.uncalibrated) | cost threshold on uncalibrated p: Spiegelhalter rejects calibration (z=-3.33, p=0.00085); slope 2.04 ± 0.88 excludes 1 (<1 overconfident, >1 underconfident). Recalibrate (isotonic) on the fit split, or use a selective gate |
| G10-tree-consistent | SKIP | no question tree declared for this context |

**Post-hoc headline** (frozen rule vs naive Bayes): suite **ACCEPT**.

### Bounded gate (POST-HOC, kit/threshold.ts)
The method was chosen after the test run: `fitSelective` on the fit readings, `applyGate` once on the test readings, `bootstrapCuts` for stability. The frozen rule stays the record beside it.

| | score | budget | cuts (fitted on fit) | fit coverage | test coverage | test error (95% upper) | bound held | stable |
|---|---|---|---|---|---|---|---|---|
| **post-hoc bounded gate** | frozen logistic score | 10.0% | reject ≤ 0.272 | 33.0% | 36.0% | 0.0% (5.4%) | yes | no (G8.unstable) |
| frozen rule (record) | | | | | 95.3% | 7.0% | no bound was promised | |

A 95% bound on error ≤ 10.0% (a wrong call costs an agent a minute or delays a reply; no safety or money decision (rule.ts)) gave reject ≤ 0.272 on the fit readings. On test it auto-decided 36.0% with 0.0% error (95% upper bound 5.4%): the promise held.

**Calibration:** frozen logistic score: calibration rejected on the test readings (Spiegelhalter rejects calibration (z=-3.33, p=0.00085)). G9 REFUSE: cost threshold on uncalibrated p: Spiegelhalter rejects calibration (z=-3.33, p=0.00085); slope 2.04 ± 0.88 excludes 1 (<1 overconfident, >1 underconfident). Recalibrate (isotonic) on the fit split, or use a selective gate

## Where it fails
- Unhappy reviews that open with praise: "I like this top. I received a ton of compliments..." then "not as high-quality as I expected" (t019), and "I love the fit of these pants" before a dye disaster (t021). likesItem fires, and it carries the largest weight in the rule (-2.541).
- Happy-enough reviews that list problems: "I wanted it to work... returning this dress" (t080) is labelled would-recommend. The label is the reviewer's own tick-box, and mixed reviews split both ways.
- The escalate band held back 7 of 150 for a human; accuracy on the rest was 93.0%, inside the 10% budget.

## Honest limits
- Balanced 50/50 sample; live traffic is about 18% not-recommended, so live precision will be lower than here.
- One retailer, clothing only, English, around 2018.
- The label is self-reported and noisy for 3-star reviews.
- The regression and its cut are fitted on the same 100 fit items, so fit-split numbers are optimistic; only the test numbers above are claims.
- n = 150: differences of a few points are not detectable; per-label numbers are small samples.

## Reproduce
```bash
cd JEV-works && source ~/.zshrc >/dev/null 2>&1
node cookbooks/review-triage/prepare.ts                        # fetch + build spec.json (seeded; byte-identical)
node kit/run.ts cookbooks/review-triage/spec.json --dry-run    # privacy scan, disjointness, call count
node kit/run.ts cookbooks/review-triage/spec.pilot.json        # label-free quality pass (30 calls)
node kit/run.ts cookbooks/review-triage/spec.fit.json  --out cookbooks/review-triage/results/fit.json
node cookbooks/_shared/decide.ts cookbooks/review-triage fit  cookbooks/review-triage/results/fit.json    # freezes rule.frozen.json
node kit/run.ts cookbooks/review-triage/spec.json      --out cookbooks/review-triage/results/test.json
node cookbooks/_shared/decide.ts cookbooks/review-triage test cookbooks/review-triage/results/test.json   # scored once
STRONG_BASELINE=1 node cookbooks/review-triage/prepare.ts && node cookbooks/_shared/compare-strong.ts cookbooks/review-triage
```
Use `/opt/homebrew/bin/node` (v25). decide.ts refuses to re-fit a frozen rule or re-score a test.
