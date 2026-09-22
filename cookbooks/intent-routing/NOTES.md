# intent-routing — notes for the lead

**Dataset.** CLINC150, OOS+ variant (`data_oos_plus.json`), fetched from the original repo; intent→domain map fetched from `data/domains.json` in the same repo (not hand-typed).
- Data: https://raw.githubusercontent.com/clinc/oos-eval/master/data/data_oos_plus.json (same data as HF `clinc/clinc_oos` config `plus`: train 15,250 = train 15,000 + oos_train 250; test 5,500 = 4,500 + 1,000 oos)
- Domains: https://raw.githubusercontent.com/clinc/oos-eval/master/data/domains.json (10 domains × 15 intents)
- Licence: **CC BY 3.0 Unported** (verified: repo LICENSE file; HF card says `cc-by-3.0`).
- Citation: Larson et al. (2019), "An Evaluation Dataset for Intent Classification and Out-of-Scope Prediction", EMNLP-IJCNLP, https://www.aclweb.org/anthology/D19-1131
- Domain keys are the source's own: `kitchen_and_dining`, `auto_and_commute` (not `kitchen_dining`/`auto_commute`).

**Splits.** fit ← train + oos_train; test ← test + oos_test. SEED 20260922; spec.json md5 `798088d8cfa763672171076428d285a5`, identical across two runs.
| split | each of 10 domains | none (oos) | total |
|---|---|---|---|
| fit | 8 | 20 (20%) | 100 |
| test | 12 | 30 (20%) | 150 |

Sampling: dedupe by normalised text across both splits (fit side first; 2 duplicate test texts dropped, 0 fit/test overlap). Within a domain at most one utterance per intent, so fit covers 8 and test 12 of each domain's 15 intents. oos is ~6% of the corpus but 20% here on purpose: the escape option is the point (NETER P5). Nothing masked (maskPrivate ran; privacy scan 0 hits); nothing else dropped.

**Questions** (state = `{ utterance }`).
- `domain` (choice, 11 options, **labelled**, the decision). Each domain option = one-line scope + the dataset's 15 intent names for that domain, so options are disjoint by construction; `none` = not one of the listed tasks, even on a similar topic. Literal: it asks which listed task set the request belongs to, and the list is in the question.
- `asksAction` (noul, unlabelled). true = asks the assistant to do/change something; false = asks for information or chats. Helps separate meta/home/utility actions from informational intents.
- `mentionsMoney` (noul, unlabelled). true = mentions money, payment, bill, price, bank account, credit card or pay. Gates banking/credit_cards/work-pay.
- `aboutAssistant` (noul, unlabelled). true = about the assistant itself (identity, name, voice, language, speed/volume, settings). Gates small_talk/meta vs task domains.

**Not for Jev.**
- Confidence / whether to auto-route → code: `choiceConfidence` + fitted cut in decide.ts (rule.ts).
- In-scope yes/no → code: `domain !== 'none'` (asking it separately would duplicate the choice).
- Keyword hits, utterance length, digits present → code (keyword baseline / regex); countable and free.
- Fine intent (150 classes) → out of scope for this demo; a lookup within the chosen domain is a second step.

**Rule.** `kind: 'choice'`, target `domain`, `escalate.maxAutoError 0.05` — a wrong auto-route costs a bounce (wrong skill or a wrongly refused request); below the fitted cut, ask a clarifying question.

**Baseline keywords** (fit only, top 8 per class; test accuracy 0.333): utility [need]; home [list, please]; credit_cards [card, credit, score, visa]; kitchen_and_dining [reservation, does, good]; travel [know, need]; auto_and_commute [tires]; work [taxes]; small_talk []; meta [voice, new, please]; banking [account, help, week, pay, bank, new]; none [first, game, local, many, where, next, tell, find]. With 8 fit items per domain the lists are thin; that is the honest bar at n=100.

**Risks.**
- CLINC's oos boundary is strict and near the domains: e.g. "prevailing interest rate for mortgages" and "better bus route" are oos although `interest_rate` (banking) and `directions`/`traffic` (auto) exist. Expect most `none` errors to be near-miss routings; this is the interesting failure, not noise.
- Intent names are terse (`w2`, `rollover 401k`, `text`, `order`, `yes`/`no`/`maybe`); some descriptions rely on Jev reading them as tasks.
- Long option descriptions (15 intents each) make the choice prompt large; if Jev's pilot flags `domain` MARGINAL, try scope-only descriptions as an A/B.
- Some utterances carry crowd-worker typos (e.g. trailing "todayu"); left as-is.
- n=150 test: small differences vs the baseline will not be significant.
