# Jev cookbooks: six domains on public data

Each cookbook asks Jev (TypeSafe's typed-decision model) a small set of literal questions about real public records, fits every threshold on a fit split, and scores the frozen rule **once** on 150 held-out items against a declared keyword baseline (fitted on the fit split only) and, post-hoc, a naive Bayes trained on 10–20× more labels. Paired exact McNemar throughout (kit/stats.ts). Pages: [demo/index.html](../demo/index.html).

| domain | data (licence) | question set | Jev rule | keywords (declared) | naive Bayes (post-hoc) | frozen gate: acts on / accuracy | bounded gate (post-hoc): acts on / held | gate suite · vs NB | verdict |
|---|---|---|---|---|---|---|---|---|---|
| [Comment Spam Filter](youtube-spam/README.md) (Trust & safety) | [UCI YouTube Spam Collection](https://archive.ics.uci.edu/dataset/380/youtube+spam+collection) (CC BY 4.0) | `isSpam` noul, `asksToVisit` noul, `mentionsVideo` noul, `offersMoney` noul, `kind` choice | **92.7%** | 82.0% (p = 0.0015) | 74.7% (p = 2.5e-5) | 100.0% / 92.7% | 0.0% / n/a | ACCEPT (G8.unstable) · ACCEPT | **Jev better** |
| [Assistant Intent Router](intent-routing/README.md) (Customer support) | [CLINC150, OOS+ variant](https://github.com/clinc/oos-eval) (CC BY 3.0) | `domain` choice, `asksAction` noul, `mentionsMoney` noul, `aboutAssistant` noul | **94.7%** | 33.3% (p = 1.2e-25) | 74.0% (p = 7.8e-7) | 100.0% / 94.7% | 66.7% / held | ACCEPT (G8.unstable) · ACCEPT | **Jev better** |
| [Review Complaint Triage](review-triage/README.md) (E-commerce) | [Women's E-Commerce Clothing Reviews](https://www.kaggle.com/datasets/nicapotato/womens-ecommerce-clothing-reviews) (CC0 (public domain)) | `wouldNotRecommend` noul, `returned` noul, `fitProblem` noul, `flawDescribed` noul, `differsFromListing` noul, `likesItem` noul, `mainIssue` choice | **92.7%** | 52.7% (p = 1.3e-15) | 85.3% (p = 0.019) | 95.3% / 93.0% | 36.0% / held | REFUSE (G8.unstable, G9.uncalibrated) · ACCEPT | **Jev better** |
| [Contract Clause Sorter](contract-clauses/README.md) (Legal) | [LEDGAR via LexGLUE](https://huggingface.co/datasets/coastalcph/lex_glue) (CC BY 4.0 (dataset card metadata)) | `clauseType` choice, `namesJurisdiction` noul, `saysAgreementEnds` noul, `requiresCoveringLosses` noul, `restrictsDisclosure` noul | **94.0%** | 76.7% (p = 2.2e-7) | 68.7% (p = 1.6e-9) | 83.3% / 97.6% | 0.0% / n/a | ACCEPT (G8.unstable) · ACCEPT | **Jev better** |
| [Job Ad Fraud Screen](job-postings/README.md) (HR / trust & safety) | [EMSCAD, Employment Scam Aegean Dataset](https://doi.org/10.3390/fi9010006) (no licence stated by the authors: do not redistribute) | `asksForPaymentOrDetails` noul, `promisesEasyEarnings` noul, `describesCompany` noul, `directContactToApply` noul, `listsSpecificDuties` noul | **72.7%** | 75.3% (p = 0.45) | 88.7% (p = 8.4e-6) | 25.3% / 89.5% | 0.0% / n/a | ACCEPT (G8.unstable) · ACCEPT | **Baseline wins** |
| [GitHub Issue Labeller](issue-triage/README.md) (Developer tools) | [NLBSE'23 Tool Competition: Issue Report Classification](https://github.com/nlbse2023/issue-report-classification) (AGPL-3.0 (repository LICENSE)) | `issueType` choice, `hasErrorOutput` noul, `hasReproSteps` noul, `asksHowTo` noul, `proposesNew` noul | **76.0%** | 40.0% (p = 1.8e-11) | 57.3% (p = 0.0013) | 59.3% / 86.5% | 0.0% / n/a | ACCEPT (G8.unstable) · REFUSE (G7.contradiction) | **Mixed** |

n = 150 test items per domain; accuracy counts every item; coverage (answered) was 100% everywhere. 1680 Jev calls in total (pilot + fit + test), `jev-1.13.0 (direct)`, answered by `jev-1.13.0`.

## Method (identical in every domain)
1. `prepare.ts` fetches the public data by URL, masks emails and phone numbers, and draws 100 fit + 150 test items with seed 20260922 (disjoint by id and text; the kit refuses overlap). The keyword baseline is fitted on the fit split only.
2. Questions are literal, about one record, typed, with declared polarity and an escape option on every choice. A 30-item label-free pilot rates each question; MOVE-TO-CODE / NO-INFORMATION questions are reworded or moved to the Not-for-Jev list **before** any labelled run.
3. The fit run's answers fit the decision rule (`_shared/decide.ts`): a logistic regression + cost- or precision-based cut + an escalate band for binary tasks, a confidence gate for choices, each within a stated error budget. The rule is frozen and committed before any test call.
4. One labelled test run per domain; the frozen rule is applied once; results never overwritten.

Each domain also has `context.json`, the same questions in the kit/modules registry format, linted with `node kit/modules/cli.ts lint`: M1–M7 pass in all six (0 errors; 23 M6 warnings, nouls without criteria.true/false, left as measured). Each README's Gates section carries the standard suite (kit/standard-gate.ts, results/gates.json) and a post-hoc bounded gate from kit/threshold.ts (fitSelective, applyGate, bootstrapCuts) on the already-collected readings.

Git order (after the rebase onto main): questions and splits (8ff0473) → pilot, fit, frozen rules (f109b05) → test results (d16b564).

## Changes made by the quality pass
- **youtube-spam:** Pilot and fit: every question JEV-SAFE. No change was needed.
- **intent-routing:** Pilot and fit: every question JEV-SAFE. No change was needed.
- **review-triage:** Pilot and fit: every question JEV-SAFE. No change was needed.
- **contract-clauses:** Pilot and fit: every question JEV-SAFE. No change was needed.
- **job-postings:** Pilot: the broad question `isFraudulent` came back MOVE-TO-CODE (17% at the ends, mean confidence 0.53). It was removed before any labelled run and its label kept in items.meta.json.
- **job-postings:** Test (reported, not acted on: one labelled run only): `asksForPaymentOrDetails` read NO-INFORMATION (spread 0.063; 0.089 on fit). Almost no ad in the sample asks for money in its first 350 words.
- **issue-triage:** Pilot: `asksHowTo` rated MARGINAL (47% at the ends). Kept: MARGINAL is not a defect, the rule does not use it, and it rated JEV-SAFE (58%) on the fit run.

## Shared code
- `_shared/lib.ts`: cached public fetch, seeded stratified sampling, masking, keyword and naive Bayes baselines, spec writer.
- `_shared/decide.ts`: fit / freeze / apply-once decision rules. `_shared/compare-strong.ts`: post-hoc baseline comparison.
- `_shared/load.ts`, `_shared/stories.ts`, `_shared/readme.ts`, `../demo/build.ts`: pages and READMEs generated from result files.

`kit/threshold.ts` did not exist on main or feat/op-consist when this was built, so thresholds use decide.ts's documented methods.
