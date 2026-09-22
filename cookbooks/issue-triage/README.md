# GitHub Issue Labeller (Developer tools)

> Label new issues as bug, feature request or question.

> **Licence: AGPL-3.0.** Quote minimally and attribute: Kallis et al. (2023), NLBSE'23 Tool Competition. Issue text is public GitHub content by its authors; usernames and links were masked. Example cards here quote at most the title and the first 160 characters of the body.  
> *Verified:* LICENSE file in github.com/nlbse2023/issue-report-classification, checked 2026-09-22

**Gate suite (kit/standard-gate.ts): ACCEPT** · warnings: G8-threshold-fitted-and-held · post-hoc headline vs naive Bayes: **REFUSE** (G7.contradiction). Details: [results/gates.json](results/gates.json) and the Gates section below.

**Verdict: Mixed.** Pooled, Jev is ahead: 76.0% against 40.0% for fit-only keyword lists (p = 1.8e-11) and 57.3% for naive Bayes on 1998 issues (p = 0.0013). But the strata disagree (L41): on issues maintainers labelled "question", Jev scored 48.0% and the naive Bayes 80.0%, significantly better (p = 4.0e-4). Jev wins on feature requests (88.0% vs 16.0%). So the headline "Jev better" does not ship on its own.

Page: [demo/issue-triage.html](../../demo/issue-triage.html) · detailed data notes: [NOTES.md](NOTES.md)

## The problem
A busy repository wants new issues pre-labelled so the right person sees them: bugs to on-call, feature requests to the roadmap owner, questions to whoever answers support.

**Data:** [NLBSE'23 Tool Competition: Issue Report Classification](https://github.com/nlbse2023/issue-report-classification). **Licence:** AGPL-3.0 (repository LICENSE).
R. Kallis, M. Izadi, L. Pascarella, O. Chaparro, P. Rani. "The NLBSE'23 Tool Competition." NLBSE 2023.

**What Jev reads:** { title, body }, body cut to 250 words. Long code blocks become "[code block: N lines]"; @mentions, user paths, URLs and anything key-like are masked. Labels are the maintainers' own GitHub labels.

## Question module
The registry form of this set is [context.json](context.json) (kit/modules format, feat/kit; passes meta-type M1–M7 with 0 errors; 3 M6 warning(s): nouls without criteria.true/false, left as measured rather than reworded after the test). The runnable kit spec is [spec.json](spec.json); both carry the same measured wording.

| id | type | purpose | polarity |
|---|---|---|---|
| `issueType` | choice | The decision (labelled): bug / feature / question, plus `none` (not an issue, empty, unreadable), the escape option. | neutral |
| `hasErrorOutput` | noul | true → bug. Error text, a traceback or log output is present. | neutral |
| `hasReproSteps` | noul | true → bug. Says what they ran or did. | neutral |
| `asksHowTo` | noul | true → question. Asks how to do something, or whether it is possible. | neutral |
| `proposesNew` | noul | true → feature. Asks for a new option, behaviour or change. | neutral |

## The question set (as measured)
One call per item, all questions batched (P31). "ends" = the share of test answers that reached a confident end (kit label-free quality report).

| question | type | instructions | role / polarity | test quality |
|---|---|---|---|---|
| `issueType` **(decision)** | choice (bug, feature, question, none) | What kind of GitHub issue is this? | The decision (labelled): bug / feature / question, plus `none` (not an issue, empty, unreadable), the escape option. | JEV-SAFE, ends 65% |
| `hasErrorOutput` | noul | Does the issue include an error message, exception, stack trace or log output produced by the software? | true → bug. Error text, a traceback or log output is present. | JEV-SAFE, ends 88% |
| `hasReproSteps` | noul | Does the issue say what the author did (steps, commands or code they ran) to make the described behaviour happen? | true → bug. Says what they ran or did. | JEV-SAFE, ends 69% |
| `asksHowTo` | noul | Does the author ask how to do something, or ask whether something is possible? | true → question. Asks how to do something, or whether it is possible. | JEV-SAFE, ends 56% |
| `proposesNew` | noul | Does the author ask for a new option, new behaviour, or a change to how the software currently works? | true → feature. Asks for a new option, behaviour or change. | JEV-SAFE, ends 57% |

Why these are literal: each asks about the one record in front of Jev, answerable by reading it: no counting, arithmetic, dates, cross-record comparison or degree judgement (NETER P18, P21; L37). Every choice has an escape option (P5).

**What the label-free quality pass changed**
- Pilot: `asksHowTo` rated MARGINAL (47% at the ends). Kept: MARGINAL is not a defect, the rule does not use it, and it rated JEV-SAFE (58%) on the fit run.

## Not for Jev
| judgement | instead |
|---|---|
| Has a code block / a stack trace | A regex on the fence or on "Traceback", "Exception:". Free and exact. |
| Existing labels, issue-template "Type:" field | Read the field. It is metadata, and it leaks the label. |
| Is this a duplicate? | Search or embeddings over the tracker; Jev sees one issue. |
| How severe is it? | Not asked: a degree judgement. |

## The decision rule
Choice. The decision is Jev's pick on `issueType`. Act automatically when TypeSafe's confidence, (k·peak − 1)/(k − 1), is ≥ **0.973**; send the rest to a human.

**How the thresholds were chosen** (fit split only, frozen in [rule.frozen.json](rule.frozen.json) and committed before any test call):
- **Gate:** lowest confidence at which auto-accepted fit items stayed within 10.0% error (fit coverage 60.0%, fit error 10.0%). A wrong auto-label sends an issue to the wrong queue (a bug lands with the roadmap owner instead of on-call, or a question waits for a fix that never comes), but a triager re-labels it in seconds, and the ground truth here is itself maintainer labels with visible noise. Auto-label only above the confidence where the fit split erred at most 1 in 10; everything below stays in the human triage queue unlabelled.

## Results (test split, n = 150, one labelled run, `jev-1.13.0 (direct)`, answered by `jev-1.13.0`)

| system | accuracy (all items) | vs Jev rule: only Jev right / only other right | exact McNemar p | reading |
|---|---|---|---|---|
| **Jev, frozen rule** | **76.0%** | | | |
| Keyword lists, fit split only (**declared baseline**) | 40.0% | 62 / 8 | 1.8e-11 | Jev better |
| Naive Bayes on 1998 labelled rows (**post-hoc**) | 57.3% | 50 / 22 | 0.0013 | Jev better |
| Majority class ("bug", from fit) | 33.3% | 68 / 4 | 4.6e-16 | Jev better |

**Coverage:** Jev answered 150/150. **Gated:** the frozen gate acted on 59.3% (89) at 86.5% accuracy and held 61 for a human; on those same auto-decided items the keyword lists scored 46.1%. (McNemar 38/2, p = 1.5e-9)

**By true label (L41: a pooled result must not hide a stratum going the other way)**

| label | n | Jev | keywords | p | naive Bayes | p |
|---|---|---|---|---|---|---|
| feature | 50 | 88.0% | 10.0% | 3.6e-12 | 16.0% | 2.8e-10 |
| question | 50 | 48.0% | 16.0% | 0.0015 | 80.0% | 4.0e-4 |
| bug | 50 | 92.0% | 94.0% | 1 | 76.0% | 0.057 |

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
| G8-threshold-fitted-and-held | WARN (G8.unstable) | POST-HOC bounded gate on confidence on issueType (event: Jev correct): bound held, but the cut is unstable under resampling (bootstrapCuts) — no cut met the bound: at 10% a one-sided cut needs ≥ 29 error-free fit items (minItemsForBound); the longest error-free run was 0 of 100. Everything escalates: the honest answer at this n, not a failure |
| G9-calibration-audited | SKIP | choice confidence gate; no cost threshold relies on calibrated probabilities |
| G10-tree-consistent | SKIP | no question tree declared for this context |

**Post-hoc headline** (frozen rule vs naive Bayes): suite **REFUSE**: G7-strata-consistent: stratum label=question (n=50, b+c=20) says naive_bayes_better, the headline says jev_better (Holm-corrected).

### Bounded gate (POST-HOC, kit/threshold.ts)
The method was chosen after the test run: `fitSelective` on the fit readings, `applyGate` once on the test readings, `bootstrapCuts` for stability. The frozen rule stays the record beside it.

| | score | budget | cuts (fitted on fit) | fit coverage | test coverage | test error (95% upper) | bound held | stable |
|---|---|---|---|---|---|---|---|---|
| **post-hoc bounded gate** | confidence on issueType (event: Jev correct) | 10.0% | no cut met the bound | 0.0% | 0.0% | – | n/a: nothing auto-decided | no (G8.unstable) |
| frozen rule (record) | | | | | 59.3% | 13.5% | no bound was promised | |

A 95% bound on error ≤ 10.0% (a wrong label is re-labelled in seconds and maintainer labels are themselves noisy (rule.ts)) found no cut. Certifying that bound needs at least 29 auto-decided fit items on one side with no error at all (minItemsForBound); of the 100 fit readings, the longest error-free run was 0 at the confident end (Jev gave confidence 1.00 to wrong answers too, so no cut can separate them: P5). So the bounded gate auto-decides nothing and every item goes to a person. That is the honest answer at this sample size, not a failure: the frozen gate's coverage came with no promise about its error.

**Calibration:** confidence on issueType (event: Jev correct): calibration rejected on the test readings (Spiegelhalter rejects calibration (z=10.97, p=0.0)). G9 SKIP: choice confidence gate; no cost threshold relies on calibrated probabilities

## Where it fails
- Many issues labelled "question" read as bug reports: "boolean values update issues" with a list of failing cases (t027), "TypeError: __init__() got an unexpected keyword argument" (t020), "barcodes_generator_product can't generate unique barcodes" with steps (t035). Maintainers often tag user-error reports as questions. Jev reads the text literally and says bug; a model trained on the repositories' own labels learns their habit.
- A body of "$BROKEN" titled "test" (t013) is labelled bug; Jev chose `none`, the escape option, which is what it is for, and it scores as wrong here.
- The gate auto-labelled 59.3% at 86.5% accuracy and left the rest for a human.

## Honest limits
- Maintainer labels are noisy; the ceiling is well below 100%.
- Balanced 50/50/50 sample; real trackers are mostly bugs.
- The prefix of one competition file; a handful of repositories dominate.
- The regression and its cut are fitted on the same 100 fit items, so fit-split numbers are optimistic; only the test numbers above are claims.
- n = 150: differences of a few points are not detectable; per-label numbers are small samples.

## Reproduce
```bash
cd JEV-works && source ~/.zshrc >/dev/null 2>&1
node cookbooks/issue-triage/prepare.ts                        # fetch + build spec.json (seeded; byte-identical)
node kit/run.ts cookbooks/issue-triage/spec.json --dry-run    # privacy scan, disjointness, call count
node kit/run.ts cookbooks/issue-triage/spec.pilot.json        # label-free quality pass (30 calls)
node kit/run.ts cookbooks/issue-triage/spec.fit.json  --out cookbooks/issue-triage/results/fit.json
node cookbooks/_shared/decide.ts cookbooks/issue-triage fit  cookbooks/issue-triage/results/fit.json    # freezes rule.frozen.json
node kit/run.ts cookbooks/issue-triage/spec.json      --out cookbooks/issue-triage/results/test.json
node cookbooks/_shared/decide.ts cookbooks/issue-triage test cookbooks/issue-triage/results/test.json   # scored once
STRONG_BASELINE=1 node cookbooks/issue-triage/prepare.ts && node cookbooks/_shared/compare-strong.ts cookbooks/issue-triage
```
Use `/opt/homebrew/bin/node` (v25). decide.ts refuses to re-fit a frozen rule or re-score a test.
