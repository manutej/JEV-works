# Assistant Intent Router (Customer support)

> Send each request to the right skill, and say "none" when it fits none.

> **Licence: CC BY 3.0 Unported.** Share and adapt with attribution: Larson et al. (2019), CLINC150. Utterances are crowd-written, not personal messages.  
> *Verified:* LICENSE file in github.com/clinc/oos-eval, checked 2026-09-22

**Gate suite (kit/standard-gate.ts): ACCEPT** · warnings: G8-threshold-fitted-and-held · post-hoc headline vs naive Bayes: **ACCEPT**. Details: [results/gates.json](results/gates.json) and the Gates section below.

**Verdict: Jev better.** 94.7% against 33.3% for fit-only keyword lists (p = 1.2e-25) and 74.0% for naive Bayes trained on 1150 utterances (p = 7.8e-7). The difference is the escape option: Jev put 93.3% of out-of-scope requests in `none`; the naive Bayes, which can only match words it has seen, managed 23.3%.

Page: [demo/intent-routing.html](../../demo/intent-routing.html) · detailed data notes: [NOTES.md](NOTES.md)

## The problem
A virtual assistant with ten skill areas receives free-text requests. Each must go to the right area, and requests no skill handles must be recognised as out of scope instead of being forced into the nearest area.

**Data:** [CLINC150, OOS+ variant (Larson et al., 2019)](https://github.com/clinc/oos-eval). **Licence:** CC BY 3.0.
S. Larson et al. "An Evaluation Dataset for Intent Classification and Out-of-Scope Prediction." EMNLP-IJCNLP 2019.

**What Jev reads:** { utterance }. The intent→domain map is fetched from the dataset repo, not hand-typed. Out-of-scope is 20% of each split on purpose (about 6% of the corpus): it is what the escape option is for.

## Question module
The registry form of this set is [context.json](context.json) (kit/modules format, feat/kit; passes meta-type M1–M7 with 0 errors; 3 M6 warning(s): nouls without criteria.true/false, left as measured rather than reworded after the test). The runnable kit spec is [spec.json](spec.json); both carry the same measured wording.

| id | type | purpose | polarity |
|---|---|---|---|
| `domain` | choice | The decision (labelled): 10 skill areas plus `none`, the escape option. Each option lists the tasks that area covers, so the question is literal: which listed set does this request belong to? | neutral |
| `asksAction` | noul | true = asks the assistant to do something; false = asks for information or chats. A routing hint, not used by the rule. | neutral |
| `mentionsMoney` | noul | true = money or an account is mentioned. Points at banking, credit cards or pay. | neutral |
| `aboutAssistant` | noul | true = about the assistant itself (name, voice, settings). Separates small talk and meta from tasks. | neutral |

## The question set (as measured)
One call per item, all questions batched (P31). "ends" = the share of test answers that reached a confident end (kit label-free quality report).

| question | type | instructions | role / polarity | test quality |
|---|---|---|---|---|
| `domain` **(decision)** | choice (banking, credit_cards, kitchen_and_dining, home, auto_and_commute, travel, utility, work, small_talk, meta, none) | A user said this to a task assistant that supports only the tasks listed below. Which area does the request belong to? If it is not one of the listed supported tasks, answer none. | The decision (labelled): 10 skill areas plus `none`, the escape option. Each option lists the tasks that area covers, so the question is literal: which listed set does this request belong to? | JEV-SAFE, ends 75% |
| `asksAction` | noul | Does the user ask the assistant to perform an action or change something (for example set, book, send, play, add, cancel, change, turn on), rather than ask for information? | true = asks the assistant to do something; false = asks for information or chats. A routing hint, not used by the rule. | JEV-SAFE, ends 85% |
| `mentionsMoney` | noul | Does the utterance mention money, a payment, a bill, a price, a bank account, a credit card or pay? | true = money or an account is mentioned. Points at banking, credit cards or pay. | JEV-SAFE, ends 93% |
| `aboutAssistant` | noul | Is the utterance about the assistant itself: who or what it is, its name, its voice, its language, its speed or volume, or its settings? | true = about the assistant itself (name, voice, settings). Separates small talk and meta from tasks. | JEV-SAFE, ends 94% |

Why these are literal: each asks about the one record in front of Jev, answerable by reading it: no counting, arithmetic, dates, cross-record comparison or degree judgement (NETER P18, P21; L37). Every choice has an escape option (P5).

**What the label-free quality pass changed**
- Pilot and fit: every question JEV-SAFE. No change was needed.

## Not for Jev
| judgement | instead |
|---|---|
| Should we auto-route this one? | Code: the confidence gate fitted on the fit split. |
| Is it in scope at all? | Code: `domain !== "none"`. Asking again would duplicate the choice. |
| Which of the 150 fine intents? | A second, narrower choice inside the chosen area (not built here). |
| Has this user asked before, and what did we answer? | Session history lookup, in code. |

## The decision rule
Choice. The decision is Jev's pick on `domain`. Act automatically when TypeSafe's confidence, (k·peak − 1)/(k − 1), is ≥ **0.362**; send the rest to a human.

**How the thresholds were chosen** (fit split only, frozen in [rule.frozen.json](rule.frozen.json) and committed before any test call):
- **Gate:** lowest confidence at which auto-accepted fit items stayed within 5.0% error (fit coverage 100.0%, fit error 5.0%). A wrong auto-route costs a bounce: the user lands in the wrong skill (or an in-scope request is refused as none) and has to rephrase or be handed back. Auto-route only above the lowest confidence where the fit split made at most 1 error in 20; everything below goes to a clarifying question or a human.

## Results (test split, n = 150, one labelled run, `jev-1.13.0 (direct)`, answered by `jev-1.13.0`)

| system | accuracy (all items) | vs Jev rule: only Jev right / only other right | exact McNemar p | reading |
|---|---|---|---|---|
| **Jev, frozen rule** | **94.7%** | | | |
| Keyword lists, fit split only (**declared baseline**) | 33.3% | 94 / 2 | 1.2e-25 | Jev better |
| Naive Bayes on 1150 labelled rows (**post-hoc**) | 74.0% | 36 / 5 | 7.8e-7 | Jev better |
| Majority class ("none", from fit) | 20.0% | 114 / 2 | 1.6e-31 | Jev better |

**Coverage:** Jev answered 150/150. **Gated:** the frozen gate acted on 100.0% (150) at 94.7% accuracy and held 0 for a human; on those same auto-decided items the keyword lists scored 33.3%. (McNemar 94/2, p = 1.2e-25)

**By true label (L41: a pooled result must not hide a stratum going the other way)**

| label | n | Jev | keywords | p | naive Bayes | p |
|---|---|---|---|---|---|---|
| auto_and_commute | 12 | 91.7% | 8.3% | 0.0019 | 91.7% | 1 |
| meta | 12 | 83.3% | 8.3% | 0.0039 | 75.0% | 1 |
| none | 30 | 93.3% | 76.7% | 0.18 | 23.3% | 9.5e-7 |
| banking | 12 | 100.0% | 75.0% | 0.25 | 91.7% | 1 |
| kitchen_and_dining | 12 | 100.0% | 16.7% | 0.0019 | 91.7% | 1 |
| home | 12 | 100.0% | 25.0% | 0.0039 | 83.3% | 0.5 |
| travel | 12 | 91.7% | 25.0% | 0.0078 | 91.7% | 1 |
| credit_cards | 12 | 100.0% | 66.7% | 0.13 | 100.0% | 1 |
| small_talk | 12 | 83.3% | 0.0% | 0.0019 | 83.3% | 1 |
| work | 12 | 100.0% | 0.0% | 4.9e-4 | 75.0% | 0.25 |
| utility | 12 | 100.0% | 0.0% | 4.9e-4 | 83.3% | 0.5 |

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
| G8-threshold-fitted-and-held | WARN (G8.unstable) | POST-HOC bounded gate on confidence on domain (event: Jev correct): bound held, but the cut is unstable under resampling (bootstrapCuts) |
| G9-calibration-audited | SKIP | choice confidence gate; no cost threshold relies on calibrated probabilities |
| G10-tree-consistent | SKIP | no question tree declared for this context |

**Post-hoc headline** (frozen rule vs naive Bayes): suite **ACCEPT**.

### Bounded gate (POST-HOC, kit/threshold.ts)
The method was chosen after the test run: `fitSelective` on the fit readings, `applyGate` once on the test readings, `bootstrapCuts` for stability. The frozen rule stays the record beside it.

| | score | budget | cuts (fitted on fit) | fit coverage | test coverage | test error (95% upper) | bound held | stable |
|---|---|---|---|---|---|---|---|---|
| **post-hoc bounded gate** | confidence on domain (event: Jev correct) | 5.0% | accept ≥ 0.967 | 59.0% | 66.7% | 0.0% (3.0%) | yes | no (G8.unstable) |
| frozen rule (record) | | | | | 100.0% | 5.3% | no bound was promised | |

A 95% bound on error ≤ 5.0% (default: a wrong auto-route bounces the user) gave accept ≥ 0.967 on the fit readings. On test it auto-decided 66.7% with 0.0% error (95% upper bound 3.0%): the promise held.

**Calibration:** confidence on domain (event: Jev correct): no evidence against calibration on the test readings (weak evidence at n = 150, not proof). G9 SKIP: choice confidence gate; no cost threshold relies on calibrated probabilities

## Where it fails
- Out-of-scope is a strict line in CLINC, and it cuts both ways. "Check the nanny cam and send the feed to my phone" (t130) is labelled out-of-scope but reads like a smart-home task; "what are some cool tourist attractions in england" (t131) is labelled travel, and Jev said none.
- Small talk vs meta vs none: "what do you know me by" (t016) is meta (the user's name), Jev said small talk. These are the dataset's fuzziest boundaries.
- The confidence gate never fired: the lowest confidence that met the 5% error budget on fit (0.362) was below every test answer, so all 150 went through, including the 8 errors. On this data Jev is either confident or wrong-and-confident, which is P5: it does not abstain unless you give it somewhere to put the no-answer.

## Honest limits
- 12 items per area in test: per-area numbers are anecdotes.
- Crowd-written utterances, short and clean; real traffic is messier.
- Area descriptions list the dataset's own intents, which helps any reader, human or model.
- The regression and its cut are fitted on the same 100 fit items, so fit-split numbers are optimistic; only the test numbers above are claims.
- n = 150: differences of a few points are not detectable; per-label numbers are small samples.

## Reproduce
```bash
cd JEV-works && source ~/.zshrc >/dev/null 2>&1
node cookbooks/intent-routing/prepare.ts                        # fetch + build spec.json (seeded; byte-identical)
node kit/run.ts cookbooks/intent-routing/spec.json --dry-run    # privacy scan, disjointness, call count
node kit/run.ts cookbooks/intent-routing/spec.pilot.json        # label-free quality pass (30 calls)
node kit/run.ts cookbooks/intent-routing/spec.fit.json  --out cookbooks/intent-routing/results/fit.json
node cookbooks/_shared/decide.ts cookbooks/intent-routing fit  cookbooks/intent-routing/results/fit.json    # freezes rule.frozen.json
node kit/run.ts cookbooks/intent-routing/spec.json      --out cookbooks/intent-routing/results/test.json
node cookbooks/_shared/decide.ts cookbooks/intent-routing test cookbooks/intent-routing/results/test.json   # scored once
STRONG_BASELINE=1 node cookbooks/intent-routing/prepare.ts && node cookbooks/_shared/compare-strong.ts cookbooks/intent-routing
```
Use `/opt/homebrew/bin/node` (v25). decide.ts refuses to re-fit a frozen rule or re-score a test.
