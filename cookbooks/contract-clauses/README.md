# Contract Clause Sorter (Legal)

> File each contract provision under the playbook that reviews it.

**Verdict: Jev better.** 94.0% against 76.7% for fit-only keyword lists (p = 2.2e-7) and 68.7% for naive Bayes on 717 provisions (p = 1.6e-9). Boilerplate is lexically stereotyped, and on governing law, confidentiality and entire-agreement clauses the keyword lists were already perfect. Most of the gap is `other` (17 of the 27 items only Jev got right): Jev 94.7%, keywords 50.0%. With the gate, 83.3% was auto-filed at 97.6% accuracy.

Page: [demo/contract-clauses.html](../../demo/contract-clauses.html) · detailed data notes: [NOTES.md](NOTES.md)

## The problem
Legal ops reviews contracts clause by clause against playbooks. Each provision has to be filed as governing law, notices, termination, indemnification and so on, or as `other` when it is none of the eight.

**Data:** [LEDGAR via LexGLUE (Tuggener et al., 2020; Chalkidis et al., 2022)](https://huggingface.co/datasets/coastalcph/lex_glue). **Licence:** CC BY 4.0 (dataset card metadata). The card's prose licence section says "More information needed"; the source text is public SEC EDGAR filings.
D. Tuggener et al. "LEDGAR: A Large-Scale Multi-label Corpus for Text Classification of Legal Provisions in Contracts." LREC 2020. I. Chalkidis et al. "LexGLUE." ACL 2022.

**What Jev reads:** { provision }, truncated to 250 words. A leading heading ("Governing Law.") is stripped so the task is about the clause body; addresses and names in notice clauses are masked.

## The question set
One call per item, all questions batched (P31). "ends" = the share of test answers that reached a confident end (kit label-free quality report).

| question | type | instructions | role / polarity | test quality |
|---|---|---|---|---|
| `clauseType` **(decision)** | choice (governingLaw, notices, entireAgreement, amendment, termination, assignment, confidentiality, indemnification, other) | This is one provision from a commercial contract. What does this provision mainly do? | The decision (labelled): eight types, each described by what the clause does, plus `other`, the escape option. | JEV-SAFE, ends 87% |
| `namesJurisdiction` | noul | Does the provision name a specific U.S. state, country or other jurisdiction (for example "the State of Delaware", "New York", "England and Wales")? | true → governing law. Is a state or country named? (Also true for venue clauses and notice addresses.) | JEV-SAFE, ends 99% |
| `saysAgreementEnds` | noul | Does the provision say that the agreement, or a party's rights or obligations under it, ends, terminates or may be terminated? | true → termination. Does the text say something ends or may be ended? | JEV-SAFE, ends 85% |
| `requiresCoveringLosses` | noul | Does the provision require one party to pay for, reimburse, hold harmless or defend another party against losses, claims, damages or expenses? | true → indemnification. Pay, reimburse, hold harmless or defend against losses? | JEV-SAFE, ends 93% |
| `restrictsDisclosure` | noul | Does the provision forbid or limit a party from disclosing or using certain information? | true → confidentiality. Forbids or limits disclosing information? | JEV-SAFE, ends 96% |

Why these are literal: each asks about the one record in front of Jev, answerable by reading it: no counting, arithmetic, dates, cross-record comparison or degree judgement (NETER P18, P21; L37). Every choice has an escape option (P5).

**What the label-free quality pass changed**
- Pilot and fit: every question JEV-SAFE. No change was needed.

## Not for Jev
| judgement | instead |
|---|---|
| Is this clause enforceable, or market-standard? | A lawyer, or an LLM with a playbook plus a lawyer. Legal and degree judgements. |
| Which state's law applies? | An extractor or regex. Jev only answers whether one is named. |
| Is the notice period at least 30 days? Does the cap exceed $X? | Numbers and comparisons: extract, then compare in code. |
| Is a clause missing from the contract? Does it conflict with clause 12? | Whole-document or cross-clause reasoning; Jev sees one provision. |

## The decision rule
Choice. The decision is Jev's pick on `clauseType`. Act automatically when TypeSafe's confidence, (k·peak − 1)/(k − 1), is ≥ **0.955**; send the rest to a human.

**How the thresholds were chosen** (fit split only, frozen in [rule.frozen.json](rule.frozen.json) and committed before any test call):
- **Gate:** lowest confidence at which auto-accepted fit items stayed within 5.0% error (fit coverage 87.0%, fit error 4.6%). A mis-filed clause in a contract review means the clause is checked against the wrong playbook (or not at all) and costs a lawyer a re-read; auto-file only where the fit split made at most 1 error in 20, and send the rest to the review queue.

## Results (test split, n = 150, one labelled run, `jev-1.13.0 (direct)`, answered by `jev-1.13.0`)

| system | accuracy (all items) | vs Jev rule: only Jev right / only other right | exact McNemar p | reading |
|---|---|---|---|---|
| **Jev, frozen rule** | **94.0%** | | | |
| Keyword lists, fit split only (**declared baseline**) | 76.7% | 27 / 1 | 2.2e-7 | Jev better |
| Naive Bayes on 717 labelled rows (**post-hoc**) | 68.7% | 41 / 3 | 1.6e-9 | Jev better |
| Majority class ("other", from fit) | 25.3% | 105 / 2 | 7.1e-29 | Jev better |

**Coverage:** Jev answered 150/150. **Gated:** the frozen gate acted on 83.3% (125) at 97.6% accuracy and held 25 for a human; on those same auto-decided items the keyword lists scored 84.0%. (McNemar 18/1, p = 7.6e-5)

**By true label (L41: a pooled result must not hide a stratum going the other way)**

| label | n | Jev | keywords | p | naive Bayes | p |
|---|---|---|---|---|---|---|
| assignment | 14 | 100.0% | 78.6% | 0.25 | 92.9% | 1 |
| termination | 14 | 100.0% | 71.4% | 0.13 | 57.1% | 0.031 |
| other | 38 | 94.7% | 50.0% | 1.5e-5 | 5.3% | 1.2e-10 |
| confidentiality | 14 | 100.0% | 100.0% | 1 | 100.0% | 1 |
| amendment | 14 | 92.9% | 92.9% | 1 | 100.0% | 1 |
| entireAgreement | 14 | 100.0% | 100.0% | 1 | 100.0% | 1 |
| notices | 14 | 71.4% | 78.6% | 1 | 71.4% | 1 |
| indemnification | 14 | 85.7% | 64.3% | 0.25 | 100.0% | 0.5 |
| governingLaw | 14 | 100.0% | 100.0% | 1 | 100.0% | 1 |

Sources: [results/test.json](results/test.json) (kit), [results/decision-test.json](results/decision-test.json) (frozen rule), [results/strong-baseline-test.json](results/strong-baseline-test.json) (post-hoc). Fit: [results/fit.json](results/fit.json); pilot: [results/pilot.json](results/pilot.json). Calls: pilot 30, fit 100, test 150.

The naive Bayes was added after the test run, because the declared keyword lists (fitted on 100 items) were near chance in several domains. It does not alter the declared comparison (the keyword row above); it answers "would a cheap model with far more labels have done as well?", and where that changes the practical verdict (job-postings), the verdict line says so.

## Where it fails
- Notices is the weak type (71.4%). Several LEDGAR "Notices" provisions are really an obligation to notify ("Each Party shall promptly notify the other of any ... infringement", t096) or a waiting period ("You have up to twenty-one days to consider this Agreement", t123). Jev called them `other`, at confidence 1.00 for t123. Arguably the label is the odd one out: LEDGAR labels come from the heading the drafter used.
- Termination vs other: "the term of this Agreement shall commence ... and end August 6, 2025" (t140) and a survival clause (t107) mention termination without being about ending the agreement. Both fell below the gate and were escalated.

## Honest limits
- 14 items per type in test: per-type numbers are anecdotes.
- Labels are drafters' headings, not a lawyer's reading.
- Commercial contracts filed with the SEC; consumer or non-US contracts differ.
- The regression and its cut are fitted on the same 100 fit items, so fit-split numbers are optimistic; only the test numbers above are claims.
- n = 150: differences of a few points are not detectable; per-label numbers are small samples.

## Reproduce
```bash
cd JEV-works && source ~/.zshrc >/dev/null 2>&1
node cookbooks/contract-clauses/prepare.ts                        # fetch + build spec.json (seeded; byte-identical)
node kit/run.ts cookbooks/contract-clauses/spec.json --dry-run    # privacy scan, disjointness, call count
node kit/run.ts cookbooks/contract-clauses/spec.pilot.json        # label-free quality pass (30 calls)
node kit/run.ts cookbooks/contract-clauses/spec.fit.json  --out cookbooks/contract-clauses/results/fit.json
node cookbooks/_shared/decide.ts cookbooks/contract-clauses fit  cookbooks/contract-clauses/results/fit.json    # freezes rule.frozen.json
node kit/run.ts cookbooks/contract-clauses/spec.json      --out cookbooks/contract-clauses/results/test.json
node cookbooks/_shared/decide.ts cookbooks/contract-clauses test cookbooks/contract-clauses/results/test.json   # scored once
STRONG_BASELINE=1 node cookbooks/contract-clauses/prepare.ts && node cookbooks/_shared/compare-strong.ts cookbooks/contract-clauses
```
Use `/opt/homebrew/bin/node` (v25). decide.ts refuses to re-fit a frozen rule or re-score a test.
