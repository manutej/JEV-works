# Job Ad Fraud Screen (HR / trust & safety)

> Catch fake job ads before applicants send money or ID.

> **Licence: No licence stated by the authors.** Do not redistribute the data. This page shows aggregate results and short paraphrased examples only. The data files in this cookbook's directory (spec.json, items.meta.json) contain ad text: keep them out of any public copy of the repository.  
> *Verified:* The authors' site (emscad.samos.aegean.gr) calls the data "publicly available" and states no licence (earlier check, 2019 Wayback capture; the site was unreachable on 2026-09-22). The CC0 tag appears only on third-party mirrors and is not relied on.

**Gate suite (kit/standard-gate.ts): ACCEPT** · warnings: G8-threshold-fitted-and-held · post-hoc headline vs naive Bayes: **ACCEPT**. Details: [results/gates.json](results/gates.json) and the Gates section below.

**Verdict: Baseline wins.** The declared comparison is a draw: the frozen rule scored 72.7%, the fit-only keyword lists 75.3% (p = 0.45), and always saying "legitimate" 70.0%. A naive Bayes trained on 1843 labelled ads (post-hoc) scored 88.7%, significantly better (p = 8.4e-6). The literal signals caught 13.3% of fraudulent ads; the naive Bayes caught 66.7%. Use a trained text model plus the structured fields here, not Jev.

Page: [demo/job-postings.html](../../demo/job-postings.html) · detailed data notes: [NOTES.md](NOTES.md)

## The problem
A job board wants to remove fraudulent postings (fake vacancies that harvest fees, ID or unpaid work) without taking down real employers' ads.

**Data:** [EMSCAD, Employment Scam Aegean Dataset (Vidros et al., 2017)](https://doi.org/10.3390/fi9010006). **Licence:** no licence stated by the authors: do not redistribute. Fetched from a pinned third-party mirror (see prepare.ts); the mirror's CC0 tag is not the authors' and is not relied on.
S. Vidros, C. Kolias, G. Kambourakis, L. Akoglu. "Automatic Detection of Online Recruitment Frauds." Future Internet 9(1):6, 2017.

**What Jev reads:** { title, location, employment_type, company_profile, description, requirements, benefits }, cut to about 350 words. Contacts are masked. Structured fields (logo, salary, screening questions) are left to code.

## Question module
The registry form of this set is [context.json](context.json) (kit/modules format, feat/kit; passes meta-type M1–M7 with 0 errors; 5 M6 warning(s): nouls without criteria.true/false, left as measured rather than reworded after the test). The runnable kit spec is [spec.json](spec.json); both carry the same measured wording.

| id | type | purpose | polarity |
|---|---|---|---|
| `asksForPaymentOrDetails` | noul | true → fraud. A fee, a starter kit, bank or ID details requested in the text. | bad-when-yes |
| `promisesEasyEarnings` | noul | true → fraud. Earn from home, fast, no experience needed. | bad-when-yes |
| `describesCompany` | noul | true → legitimate. The employer is named and says what it does. | good-when-yes |
| `directContactToApply` | noul | true → fraud. Apply by messaging a person instead of a normal application. | bad-when-yes |
| `listsSpecificDuties` | noul | true → legitimate. Concrete tasks are described. | good-when-yes |

## The question set (as measured)
One call per item, all questions batched (P31). "ends" = the share of test answers that reached a confident end (kit label-free quality report).

| question | type | instructions | role / polarity | test quality |
|---|---|---|---|---|
| `asksForPaymentOrDetails` | noul | Does the posting ask applicants to pay anything (a fee, training, equipment, a starter kit) or to send bank account, payment card or identity-document details? | true → fraud. A fee, a starter kit, bank or ID details requested in the text. | NO-INFORMATION, ends 95% |
| `promisesEasyEarnings` | noul | Does the posting promise earnings that come quickly, easily, from home, or without experience or qualifications (for example "earn from home", "no experience needed, start earning today", "unlimited income")? | true → fraud. Earn from home, fast, no experience needed. | JEV-SAFE, ends 95% |
| `describesCompany` | noul | Does the posting name the hiring company and say what that company does (its products, services or line of business)? | true → legitimate. The employer is named and says what it does. | JEV-SAFE, ends 79% |
| `directContactToApply` | noul | Does the posting tell applicants to apply or get in touch by contacting someone directly (an email address, a phone number, a text message or a messaging app) rather than by applying through the posting or a company application process? | true → fraud. Apply by messaging a person instead of a normal application. | JEV-SAFE, ends 94% |
| `listsSpecificDuties` | noul | Does the posting describe specific tasks or responsibilities that the person hired would carry out in this job? | true → legitimate. Concrete tasks are described. | JEV-SAFE, ends 74% |

Why these are literal: each asks about the one record in front of Jev, answerable by reading it: no counting, arithmetic, dates, cross-record comparison or degree judgement (NETER P18, P21; L37). Every choice has an escape option (P5).

**What the label-free quality pass changed**
- Pilot: the broad question `isFraudulent` came back MOVE-TO-CODE (17% at the ends, mean confidence 0.53). It was removed before any labelled run and its label kept in items.meta.json.
- Test (reported, not acted on: one labelled run only): `asksForPaymentOrDetails` read NO-INFORMATION (spread 0.063; 0.089 on fit). Almost no ad in the sample asks for money in its first 350 words.

## Not for Jev
| judgement | instead |
|---|---|
| Is this posting fraudulent? (the broad question) | Moved out after the pilot: MOVE-TO-CODE, only 17% of answers at the ends. A degree judgement (P18, L37); the decision now comes from the literal signals in code. |
| Has a company logo / screening questions / telecommuting flag | Structured fields: read them in code. The logo field alone separates the classes strongly. |
| Is the salary unusually high? | Parse the numbers; compare with industry and location in code. |
| Is this a real company? | A registry or domain lookup: world knowledge, not in the record. |

## The decision rule
Binary. A logistic regression (L2, λ = 1, fitted on the 100 fit items) over `asksForPaymentOrDetails`, `promisesEasyEarnings`, `describesCompany`, `directContactToApply`, `listsSpecificDuties`.

Frozen weights: `asksForPaymentOrDetails` 0.898 · `promisesEasyEarnings` 1.127 · `describesCompany` -1.454 · `directContactToApply` 0.202 · `listsSpecificDuties` -0.393 · bias 0.083.

Decide "yes" when the score ≥ **0.553**; act automatically outside the escalate band **[0.163, 0.669)**, send the band to a human.

**How the thresholds were chosen** (fit split only, frozen in [rule.frozen.json](rule.frozen.json) and committed before any test call):
- **Cut:** lowest cut with fit precision ≥ 0.8 (≥ 5 flagged). A false fraud flag takes down a real employer's ad and costs a paying customer a hire; a missed scam still meets the next line of defence (applicant reports, payment checks). So a flag must be right at least 4 times in 5 on the fit split before it acts. With 30 fit positives this is a coarse estimate, and the fit split is 30% fraud, not the ~5% seen live: live precision at the same cut will be lower.
- **Band:** widest band whose auto-decided fit items stayed within 5.0% error (fit coverage 20.0%, fit error 5.0%). Auto-remove or auto-keep only where the fit split made at most 1 error in 20; everything between goes to a human trust & safety reviewer, who also sees the code features (logo, salary, screening questions).

## Results (test split, n = 150, one labelled run, `jev-1.13.0 (direct)`, answered by `jev-1.13.0`)

| system | accuracy (all items) | vs Jev rule: only Jev right / only other right | exact McNemar p | reading |
|---|---|---|---|---|
| **Jev, frozen rule** | **72.7%** | | | |
| Keyword lists, fit split only (**declared baseline**) | 75.3% | 6 / 10 | 0.45 | no difference shown |
| Naive Bayes on 1843 labelled rows (**post-hoc**) | 88.7% | 3 / 27 | 8.4e-6 | naive Bayes better |
| Majority class ("false", from fit) | 70.0% | 6 / 2 | 0.29 | no difference shown |

**Coverage:** Jev answered 150/150. **Gated:** the frozen gate acted on 25.3% (38) at 89.5% accuracy and held 112 for a human; on those same auto-decided items the keyword lists scored 81.6%. (McNemar 5/2, p = 0.45)

**By true label (L41: a pooled result must not hide a stratum going the other way)**

| label | n | Jev | keywords | p | naive Bayes | p |
|---|---|---|---|---|---|---|
| false | 105 | 98.1% | 99.0% | 1 | 98.1% | 1 |
| true | 45 | 13.3% | 20.0% | 0.58 | 66.7% | 8.1e-7 |

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
| G8-threshold-fitted-and-held | WARN (G8.unstable) | POST-HOC bounded gate on frozen logistic score: bound held, but the cut is unstable under resampling (bootstrapCuts) — no cut met the bound: at 5% a one-sided cut needs ≥ 59 error-free fit items (minItemsForBound); the longest error-free run was 5 (accept side) and 11 (reject side) of 100. Everything escalates: the honest answer at this n, not a failure |
| G9-calibration-audited | SKIP | the frozen cut is a target-precision cut, not a cost threshold on calibrated p; the post-hoc gate is selective |
| G10-tree-consistent | SKIP | no question tree declared for this context |

**Post-hoc headline** (frozen rule vs naive Bayes): suite **ACCEPT**.

### Bounded gate (POST-HOC, kit/threshold.ts)
The method was chosen after the test run: `fitSelective` on the fit readings, `applyGate` once on the test readings, `bootstrapCuts` for stability. The frozen rule stays the record beside it.

| | score | budget | cuts (fitted on fit) | fit coverage | test coverage | test error (95% upper) | bound held | stable |
|---|---|---|---|---|---|---|---|---|
| **post-hoc bounded gate** | frozen logistic score | 5.0% | no cut met the bound | 0.0% | 0.0% | – | n/a: nothing auto-decided | no (G8.unstable) |
| frozen rule (record) | | | | | 25.3% | 10.5% | no bound was promised | |

A 95% bound on error ≤ 5.0% (default: a false fraud flag takes down a real employer's ad) found no cut. Certifying that bound needs at least 59 auto-decided fit items on one side with no error at all (minItemsForBound); of the 100 fit readings, the longest error-free run was 5 on the accept side and 11 on the reject side. So the bounded gate auto-decides nothing and every item goes to a person. That is the honest answer at this sample size, not a failure: the frozen gate's coverage came with no promise about its error.

**Calibration:** frozen logistic score: calibration rejected on the test readings (slope 2.12 ± 0.88 excludes 1 (<1 overconfident, >1 underconfident)). G9 SKIP: the frozen cut is a target-precision cut, not a cost threshold on calibrated p; the post-hoc gate is selective

## Where it fails
- Most fraud in this corpus does not look like a scam. It looks like an ordinary vacancy: an administrative assistant in Newark (t012), a QC inspector in Houston (t017), even a design-engineer ad that copies a real oil-services firm's company profile (t019). None asks for money or promises easy earnings, so every literal signal says "legitimate". What gives them away is corpus-level pattern (a missing company profile, recurring locations and stock wording), which a model trained on 1,800 labelled ads learns and a zero-shot reader of one ad cannot.
- The gate could only auto-decide 25.3% of test ads within the 5% budget; everything else would go to a human.

## Honest limits
- Ads from 2012–2014; today's scams (crypto, messaging-app recruiting) are under-represented.
- Sample is 30% fraud against about 5% in the corpus.
- The fraud labels are one annotator group's judgement.
- Descriptions are truncated; a payment request late in a long ad is invisible.
- The regression and its cut are fitted on the same 100 fit items, so fit-split numbers are optimistic; only the test numbers above are claims.
- n = 150: differences of a few points are not detectable; per-label numbers are small samples.

## Reproduce
```bash
cd JEV-works && source ~/.zshrc >/dev/null 2>&1
node cookbooks/job-postings/prepare.ts                        # fetch + build spec.json (seeded; byte-identical)
node kit/run.ts cookbooks/job-postings/spec.json --dry-run    # privacy scan, disjointness, call count
node kit/run.ts cookbooks/job-postings/spec.pilot.json        # label-free quality pass (30 calls)
node kit/run.ts cookbooks/job-postings/spec.fit.json  --out cookbooks/job-postings/results/fit.json
node cookbooks/_shared/decide.ts cookbooks/job-postings fit  cookbooks/job-postings/results/fit.json    # freezes rule.frozen.json
node kit/run.ts cookbooks/job-postings/spec.json      --out cookbooks/job-postings/results/test.json
node cookbooks/_shared/decide.ts cookbooks/job-postings test cookbooks/job-postings/results/test.json   # scored once
STRONG_BASELINE=1 node cookbooks/job-postings/prepare.ts && node cookbooks/_shared/compare-strong.ts cookbooks/job-postings
```
Use `/opt/homebrew/bin/node` (v25). decide.ts refuses to re-fit a frozen rule or re-score a test.
