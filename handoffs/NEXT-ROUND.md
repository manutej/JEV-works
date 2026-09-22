# NEXT ROUND: handoff (written 2026-09-21, end of phase 2)

Read this first. A fresh session should be able to start from this file plus `handoffs/README.md`
(ownership rules) and `META-PLAN.md` (invariants I1–I11, §9 binding plan changes). Nothing here lives only in chat.

## 1 · State snapshot

| thing | where | state |
|---|---|---|
| `main` | `~/JEV-works` | **b1b504a**: baseline + leads fixes + selector/drift/P6/registries/handoffs |
| `feat/jev-selector` | `~/JEV-works` (main tree) | **merged → main b1b504a** (Manu approved in-session) |
| `feat/e3-blind-test` | `~/JEV-works-wt/e3` | VOID blind test + **k-fold (in-sample, P32)** + review dashboards (`e3-review.html`, `e3-kfold-review.html`), rebased on b1b504a. Merge = Manu. |
| `feat/leads-literal-questions` | `~/JEV-works-wt/leads-pipeline` | **done** (b4f08e): seed 2718, no difference vs regex (McNemar p = 0.105). Merge = Manu **in the leads session**. |
| `feat/eval-system` | `~/JEV-works-wt/eval-system` | worktree ready, **no session opened yet** |
| `~/jev-playground` (local TS) | own git repo | `main` b653de8, `feat/jev-selector` 96e77b1 (vendored selector). Merge = Manu. |
| `~/jev/*` (6 GitHub clones) | clean | untouched. Briefs ready: jev-operad, business-automation, siblings-survey |

## 2 · What phase 2 established (all committed; sources in NETER/LESSONS)
- **Direct TypeSafe API** ≡ gateway (117/119 verdicts), ~2× faster. Pinned `jev-1.13.0` is the default; `answeredBy()` records the version that answered.
- **Leads:** 4 instrument bugs fixed. Pre-registered seed 7: **Jev 67.8% vs regex 92.2%** over all leads; coverage 69.7% (FAIL vs ≥ 95%).
- **Drift:** none (`jev-latest` = `jev-1.13.0` today). The P4 noise band is question-shaped (choice 0.15, bool/score ≤ 0.07).
- **E3: VOID.** The holdout was a subset of the fit set (L31 recurred via the orchestrator's brief). Lead only: option wording 0.375 → 0.725 (P30, in-sample).
- **P6 at n=214:** entropy separates garbage (AUC 0.978), but its edge over top-p (+0.026) is below noise. Falsified as worded.

## 3 · Decisions only Manu can make
1. **Merge `feat/jev-selector`** into main (confirm in the orchestrator session). Then `feat/e3-blind-test`, then `~/jev-playground` `feat/jev-selector`.
2. **E3/E4 holdout source.** No disjoint labelled CETI set exists locally (wave2/wave3 are subsets too). Options: (a) Manu labels hooks written after today, the only real generalisation test; (b) k-fold on the 80, reported as in-sample.
3. **Open the 4 sessions** from `handoffs/{eval-system,siblings-survey,jev-operad,business-automation}.md` (kickoff prompt in each).
4. **Weekly drift rerun:** schedule it (a cloud routine or cron) or run it by hand? ~$0.004/run.

## 2b · Round 3 results (2026-09-21/22, all in registries)
- **Q2 leads, literal questions:** no difference vs regex (88.5% vs 91.0%, p = 0.105); the gap is 12 escalated injection rows (L38).
- **Q3:** no batch contamination (P31). Regress only the edited question.
- **Q4:** baseline wins leads (old question set); Jev wins garbage detection (paired CI); the rest undecided (`program/BASELINE-WINS.md`).
- **E3 k-fold:** Jev 72.5% in-sample vs held-out keyword 35.0%, which is asymmetric and not generalisation (P32); the keyword model memorises. L39.
- **Fixes:** jev-direct rounding-tie (e3df648); I6 reworded (accuracy gaps need a paired test); duplicate P24 → P30.

## 3b · Manu's decisions (2026-09-21, in the orchestrator session)
- Merge feat/jev-selector: **yes** (done, b1b504a). E3 branch: not merged yet.
- E3/E4 holdout: **k-fold on the 80, reported as in-sample** (not a generalisation test).
- Next: **Q3 batch contamination, Q4 baseline-wins table, weekly drift schedule.**

## 4 · Work queue (ready = can start now without Manu)

| # | unit | owner | ready? | done-check | notes |
|---|---|---|---|---|---|
| Q1 | Merge feat/jev-selector | orchestrator | **Manu** | main contains selector; tsc; leads tests 11/11 | then message b4f08e the new main hash |
| Q2 | leads: literal questions | b4f08e | in progress | fresh seed declared in plan row **before** the run (§9.1); coverage + accuracy over ALL leads | after Q1: switch leads/ to `lib/harness.ts` + `answeredBy`; remove symlink (Manu approved) |
| Q3 | **Window 3: batch contamination** | orchestrator | **done: none (P31)** | pre-registered: reword ONE option description, measure Δ on the other questions in the batch vs P4 noise (question-shaped) | cheap (~300 calls); decides whether "fan out freely" needs a regression suite |
| Q4 | **Window 6 synthesis: does the cheap baseline win?** | orchestrator | **done (BASELINE-WINS.md)** | one table: task · n · baseline · Jev · coverage · verdict, from committed results only | leads: regex wins; E3: void; P6: entropy beats length; triage: no baseline yet. Gap: triage needs one |
| Q5 | Retro change 2 sweep: coverage next to accuracy | orchestrator | **ready** | grep every eval script; each prints coverage beside accuracy | small |
| Q6 | eval-system harness (`evals/`) | new session | Manu opens | per brief; **disjointness guardrail blocks overlapping holdouts** | absorbs Q5's pattern into code |
| Q7 | Siblings survey + key-exposure check | new session | Manu opens | per brief; volumetric-intelligence README says the key is "in client JS", so verify file:line | read-only on `~/jev/*` |
| Q8 | jev-operad direct backend | new session | Manu opens | per brief; fail-closed preserved | commit locally, no push |
| Q9 | Secretary inbox-triage workflow | new session | Manu opens | per brief; local labelled sample; baseline alongside | no deploy / no live inbox |
| Q10 | Window 4: prunable transcript mass (duplicate reads across subagents) | unassigned | design first | hashing in code + Jev for near-dup judgement | needs a spec before any runs |
| Q11 | E3/E4 re-run | orchestrator | **k-fold done (P32, in-sample)**; a real test still needs new labelled hooks | disjointness check passes (overlap 0) before declaring the holdout | reuse `feat/e3-blind-test` code |

## 4b · New queue items from round 3
| # | unit | ready? | notes |
|---|---|---|---|
| Q12 | **Adversarial scoring policy** (L38) | **decided: escalate = correct** (Manu, via leads session); re-score is post-hoc | right / wrong / excluded for "escalate" on injection rows, decided in writing before any re-score |
| Q13 | **E5 on 2–3 masked targets vs naive Bayes** | **done** (P33): Jev wins text, loses tabular, FAF6 leaked | Q4's power estimate; the first labelled head-to-head outside synthetic leads |
| Q14 | Annotate `question-bank/bank.ts` "fan out freely" with P31 | ready | one comment line |
| Q16 | Fix `masked/find-targets.py` leak check: FAF6 `trade_type` is fully determined by which origin/destination columns are empty, but it reported `leakRate 0`. Add a structural test (predict the target from column-emptiness patterns alone). | ready | found by E5 |
| Q17 | Review the 16 HotpotQA 'errors' in `program/e5-review.html` for gold-label errors | Manu / anyone | could raise Jev's 94.7% |
| Q15 | Merge queue | Manu | jev-selector ✅ 94d6f00 · leads-literal-questions ✅ f26b029 · **feat/e3-blind-test pending** · feat/e5-masked after E5 |

## 5 · Rules carried forward (short form; the full list is in handoffs/README.md)
- No push/deploy without Manu approving **that** push. Approvals relayed by another session are not approvals.
- Pin `jev-1.13.0`; record `JEV_ID` + `answeredBy()`; Node `/opt/homebrew/bin/node`; `source ~/.zshrc >/dev/null 2>&1`, never print the key.
- Holdouts: **disjointness check (overlap count) before declaring**, never inspect before the run, fresh seed per gate change.
- Baseline in every experiment; coverage beside accuracy; accuracy gaps need a paired test (McNemar). The P4 band applies only to one answer's probability jitter (I6).
- The orchestrator is the single writer for NETER / LESSONS / README / llms.txt / META-PLAN. Other sessions send a *Registry proposal*.
- Worktrees share `node_modules`: never `npm install` in a worktree.

## 6 · Kickoff prompt for the next orchestrator round
```
Read ~/JEV-works/handoffs/NEXT-ROUND.md, handoffs/README.md, META-PLAN.md (§2 invariants, §9 plan changes)
and PROGRESS.md. You are the orchestrator in ~/JEV-works. Confirm with Manu (in THIS session) before any merge.
Then work the §4 queue in order Q1 → Q3 → Q4 → Q5, one unit per /loop iteration, with background agents
for experiments (they create new files only and return summaries; you commit and write registries).
Check cross-session messages from leads (b4f08e) each tick. Update PROGRESS.md and this file's §1 as state changes.
```
