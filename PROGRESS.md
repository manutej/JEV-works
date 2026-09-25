# PROGRESS: main / orchestrator session (feat/jev-selector)

Durable record of this session's state. Chat is ephemeral; this file is not. Newest last.

## State (2026-09-21)
- main @ 8bfa12b (baseline be1429b + META-PLAN). Worktrees: leads-pipeline (b4f08e), e3 (my agent team), eval-system (new session).
- Phase 1 done: direct TypeSafe backend (TYPESAFE-LOOP.md).
- Manu's decisions (AskUserQuestion, 2026-09-21): this session → feat/jev-selector; new sessions → jev-operad,
  siblings-survey, eval-system, business-automation; E3 pre-approved end to end: "Run evaluation upon the questions and
  move forward with consensus but also create an html dashboard for manual review. NO stopping, keep going…"
- Received U5 leads results → program/results/leads-u5-summary.md (FAILED pre-registered criterion; honest instrument).

## In flight
- [x] feat/jev-selector U2: JEV-works ed9a7f1 (pin jev-1.13.0, answeredBy, lib/harness.ts, local-ornith ported + verified);
      ~/jev-playground now git (main b653de8), feat/jev-selector 96e77b1 (vendored lib/jev*, 6 scripts, tsc + vitest 4/4, 01-hello → jev-1.13.0)
- [x] U6 drift suite: no drift; jev-latest = jev-1.13.0; P4 band is question-shaped (committed)
- [x] E3: VOID (holdout = fit subset, 39/39, re-verified). Orchestrator error: brief forbade the L31 check. Branch feat/e3-blind-test @59964b0; dashboard ~/JEV-works-wt/e3/program/e3-review.html
- [x] U9 part 1: leads U5 → L35, L36, P18, NETER ledger (287f404)
- [x] U8 P6: separation holds (AUC 0.978), edge over top-p falsified (F2)
- [x] U9 part 2: drift (dc1cd80), E3 void + L31 amendment + P30 + PROGRAM E3/E4 notes (df34df8)
- [ ] Manu to open 4 sessions from handoffs/*.md

## Round 3 (in flight, 2026-09-21 evening)
- main = b1b504a (feat/jev-selector merged, Manu-approved in-session). feat/jev-selector continues: e3df648 (tie fix, I6, Q2 log, drift wrapper), **needs Manu to merge again**.
- Background agents: all done. Q3 none (P31, b9133b8); Q4 table (79494b4); E3 k-fold P32 (85808bc). Leads Q2 no difference (79494b4).
- Leads Q2 (b4f08e): seed 2718 declared + logged; harness switch 070828b done; asked whether to cherry-pick the tie fix.
- Weekly drift: wrapper `program/drift-weekly.sh` tested (skip path OK). **crontab install blocked by a macOS permission prompt**; Manu to run: `! (crontab -l 2>/dev/null; echo "0 9 * * 1 /Users/manu/JEV-works/program/drift-weekly.sh") | crontab -`

## Waiting on Manu
- Approve merges: feat/leads-pipeline → main first (b4f08e is holding it for Manu), then feat/jev-selector (rebased), then feat/e3-blind-test (void result + dashboard, kept for the record).
- E3/E4 need a disjoint, independently labelled CETI set. **None exists locally:** wave2 (36/36) and wave3 (20/20) are also subsets of the 80-item fit file (checked 2026-09-21, counts only). Options: new hooks labelled by Manu, or a k-fold design on the 80 with the in-sample caveat stated.
- Open the 4 sessions from handoffs/*.md.

## Assumptions
- A1 Pinning jev-1.13.0 as the direct default matches the sibling repos' "never jev-latest in prod" rule. Falsifier: TypeSafe rejects the pinned id.
- A2 leads merges to main before feat/jev-selector (agreed with b4f08e).

## HANDOFF
**Next round starts from `handoffs/NEXT-ROUND.md`** (state, decisions for Manu, work queue Q1–Q11, kickoff prompt).

## State 2026-09-22 (after merges)
- **main = e4ef190**: feat/op-consist (kit core, tests 118, kit/threshold + audited calibration, standard gates contract v1 with G3 n-gram,
  OC gate P34, bank.ts → 8 kit/modules contexts, registries through L46/P35) + feat/demos (6 cookbooks, pages, run logs) + leads
  (feat/kit, feat/leads-blind, feat/leads-segment by b4f08e). Manu approved each merge in its own session.
- **Decided:** one question-set format (kit/SCOPE.md, confirmed by Manu in both sessions); standard gates G1–G10 on every run.
- **Tests never write tracked files** (JEV_RUNS_DIR). `npm test` 118/118.
- **Open, for Manu:** keep job-postings spec.json/items.meta.json out of any public copy (unlicensed ad text); delete the redundant
  branch keep/b61818e-kit-tests; the craft thread is still writing into ~/JEV-works-wt/leads-pipeline; feat/e3-blind-test unmerged;
  weekly drift crontab not installed; JEV-works is on GitHub (`origin` = github.com/manutej/JEV-works).
- **Next (leads, b4f08e):** leads/questions.ts → kit/modules context; company-name check to code; the asksToBuy/offersToUs split;
  a fresh blind pool D checked with G3 n-gram against pools A and C. Seeds + prereg are logged here before generation.

