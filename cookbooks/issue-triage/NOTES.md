# issue-triage — notes for the lead

**Decision:** is a GitHub issue a bug report, a feature request or a question? The choice is `issueType`; `none` is the escape option.

## Dataset
- **NLBSE'23 Tool Competition on Issue Report Classification.** Repo: https://github.com/nlbse2023/issue-report-classification. Data: https://tickettagger.blob.core.windows.net/datasets/nlbse23-issue-classification-test.csv.tar.gz (linked from the repo README).
- **Licence:** AGPL-3.0, from the repo's LICENSE. The repo's CITATION.cff has `type: dataset`. The CSV lives on the authors' Azure blob, not in the repo. The issue text is public GitHub content.
- **Cite:** Kallis, Izadi, Pascarella, Chaparro & Rani (2023), "The NLBSE'23 Tool Competition", NLBSE'23. Also Kallis, Di Sorbo, Canfora & Panichella (2021), "Predicting issue types on GitHub", *Sci. Comput. Program.* 205:102598.
- **Rejected alternative:** the NLBSE'24 set (3k issues from 5 repos). Its LICENSE file is empty, and GitHub reports the licence as NOASSERTION.
- **Labels:** each label is the repository maintainers' own GitHub label. The dataset authors mapped synonyms to bug / feature / question / documentation, and dropped issues with more than one label.
- **Which rows are read:** only the first 16 MB of the 183 MB test CSV. That prefix holds 11,584 issues: 6,018 bug, 4,264 feature, 801 question, 501 documentation. The whole file runs out of memory in the shared `parseCsv`. The prefix is fixed, so every run reads the same rows. The file is not sorted by label.

## Splits
Seed 20260922. Samples are stratified and deduped on title+body. Fit and test share no items by id or by text (the dry run checks this).

| split | bug | feature | question | none |
|---|---|---|---|---|
| fit | 34 | 33 | 33 | 0 |
| test | 50 | 50 | 50 | 0 |

- **Why balanced:** the source is heavy on bugs. Balancing keeps "question" from being a rounding error, and 50 per class makes per-class accuracy readable.
- **`none` has no labelled items:** every issue in the source carries one of the labels. `none` exists so Jev is not forced to pick a class for junk. On this data, any `none` answer scores as wrong.

## Questions
The polarity is the class that a TRUE answer points towards.

| id | type | labelled | what it decides / why it is literal | polarity |
|---|---|---|---|---|
| `issueType` | choice: bug / feature / question / none | **yes (the target)** | The decision. Each option description says what the class *means*, and the descriptions do not overlap. | n/a |
| `hasErrorOutput` | noul | no | Checks whether error text, a traceback or log output is present in this record. | true → bug |
| `hasReproSteps` | noul | no | Checks whether the author says what they ran or did. | true → bug |
| `asksHowTo` | noul | no | Checks whether the author asks how to do something, or whether it is possible. | true → question |
| `proposesNew` | noul | no | Checks whether the author asks for a new option, new behaviour, or a change. | true → feature |

`rule.ts` uses the choice directly: `kind: 'choice'`, `target: 'issueType'`, `maxAutoError: 0.10`. decide.ts fits the confidence cut on the fit split.
- **Why 10%:** a wrong auto-label sends the issue to the wrong queue, but a triager can re-label it in seconds, and the ground truth is itself noisy. Items below the cut stay in human triage.
- The nouls are diagnostic signals only. The rule does not use them.

## Not for Jev
| judgement | what does it instead | why |
|---|---|---|
| Has a code block | regex on the fence | Code can compute it. |
| Has a stack trace | regex (`Traceback`, `at x.y(`, `Exception:`) | Code can compute it. |
| Existing labels / template "Type: Question" field | read the field | It is metadata, and it leaks the label. |
| Repo name, affected version, OS | regex / structured fields | Extraction, not judgement. |
| Duplicate of another issue | search / embedding over the tracker | Needs other records. |
| Severity / priority | not asked | A degree judgement. |
| Body length, number of steps | code | Counting. |

## Baseline
`keywordBaseline`, fitted on the 100 fit items only, over the same `title + body` text that Jev sees. It keeps the top 8 words per class:
- bug: bug, reproduce, steps, seems, console, multiple, order, path
- feature: action, allow, acceptance, alternatives, black, builds, button, color
- question: hello, thanks, question, answer, empty, i've, onto, through

## What was masked or dropped
- **Fields dropped:** the issue id and `author_association`.
- **Rows dropped:**
  - 501 `documentation` issues
  - 1 issue migrated from bugs.python.org (its body lists nosy-list usernames)
  - 7 issues that the kit's privacy scan still flagged after cleaning
- **Body cleaning:**
  - HTML comments (template boilerplate) are removed.
  - Fenced code blocks longer than 20 lines become `[code block: N lines]`. 22 of the 250 states have one.
  - Image links become `[image]` and all other URLs become `[link]`, because URLs carry usernames.
  - `@mentions` become `@someone`.
  - `/Users/<name>`, `/home/<name>` and `C:\Users\<name>` become `[user]`.
  - Key, token, bearer and password-like strings become `[secret]`.
  - `maskPrivate` masks emails and phone numbers. It also masks any 10+ digit run, such as timestamps and ids.
- **Truncation:** bodies are cut to 250 words, marked `[…]`. 13 states were cut.

## Risks
- **Maintainer label noise.** For example, fit item f006 is labelled `question` but is a crash traceback. Some repos use "question" for "user error" bug reports, and "enhancement" for bug fixes. Expect a ceiling well below 100%. The NLBSE'24 SetFit baseline reached F1 of about 0.83.
- **Template leakage.** Some bodies contain issue-template text such as "Type: Question" or "Describe the bug". Both Jev and the keyword baseline can read it. It was left in because triagers see it too.
- **Hidden error output.** Replacing long code blocks can hide error output from `hasErrorOutput`. Short blocks and inline tracebacks are kept.
- **Licence.** AGPL-3.0 is a software licence applied to a data repo. It is clear and permissive for this use, but it is unusual for data.
