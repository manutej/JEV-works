# GitHub Issue Labeller (Developer tools)

> Label new issues as bug, feature request or question.

**Verdict: Mixed.** Pooled, Jev is ahead: 76.0% against 40.0% for fit-only keyword lists (p = 1.8e-11) and 57.3% for naive Bayes on 1998 issues (p = 0.0013). But the strata disagree (L41): on issues maintainers labelled "question", Jev scored 48.0% and the naive Bayes 80.0%, significantly better (p = 4.0e-4). Jev wins on feature requests (88.0% vs 16.0%). So the headline "Jev better" does not ship on its own.

Page: [demo/issue-triage.html](../../demo/issue-triage.html) · detailed data notes: [NOTES.md](NOTES.md)

## The problem
A busy repository wants new issues pre-labelled so the right person sees them: bugs to on-call, feature requests to the roadmap owner, questions to whoever answers support.

**Data:** [NLBSE'23 Tool Competition: Issue Report Classification](https://github.com/nlbse2023/issue-report-classification). **Licence:** AGPL-3.0 (repository LICENSE).
R. Kallis, M. Izadi, L. Pascarella, O. Chaparro, P. Rani. "The NLBSE'23 Tool Competition." NLBSE 2023.

**What Jev reads:** { title, body }, body cut to 250 words. Long code blocks become "[code block: N lines]"; @mentions, user paths, URLs and anything key-like are masked. Labels are the maintainers' own GitHub labels.

## The question set
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
