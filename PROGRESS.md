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
- [ ] e3-team (background agent) → ~/JEV-works-wt/e3/program/E3-PROGRESS.md
- [x] U9 part 1: leads U5 → L35, L36, P18, NETER ledger (287f404)
- [ ] U9 part 2: E3 result, drift result
- [ ] Manu to open 4 sessions from handoffs/*.md

## Waiting on Manu
- Approve merges: feat/leads-pipeline → main first (b4f08e is holding it for Manu), then feat/jev-selector (rebased).
- Open the 4 sessions from handoffs/*.md.

## Assumptions
- A1 Pinning jev-1.13.0 as the direct default matches the sibling repos' "never jev-latest in prod" rule. Falsifier: TypeSafe rejects the pinned id.
- A2 leads merges to main before feat/jev-selector (agreed with b4f08e).

## HANDOFF
(see "In flight"; META-PLAN.md §4 is the unit table, §10 the log)
