# Brief: Jev Evaluation System (session: eval-system)

**Where:** `~/JEV-works-wt/eval-system` · **branch:** `feat/eval-system` · **owns:** a new `evals/` directory only.
Read `handoffs/README.md` rules first. Human-of-record: Manu.

## Why
The lab has proven instruments scattered across one-off scripts: `question-bank/measure-confidence.ts`
(verdicts JEV-SAFE / MARGINAL / MOVE-TO-CODE / NO-INFORMATION), `question-bank/confidence.ts`,
`program/stats.ts` (spearman, AUC, iqr), `program/keyword-baseline.ts`, `lib/telemetry.ts` (RunLog), and
`lib/jev.ts` (backend selector). Every experiment (E1, E2, E3, leads, triage) re-wires them by hand, and
every instrument bug in LESSONS.md came from that re-wiring. The goal is **one declarative eval harness**:
declare `{corpus, questions, baseline, holdout, gate}` → get a Reporting-contract result + HTML report.

## Scope (first version)
1. `evals/spec.ts`: a typed `EvalSpec`: corpus path + label field, question set, baseline (keyword/majority), holdout split declared up front (hash recorded), gate policy, seed.
2. `evals/run.ts`: executes a spec through `lib/jev.ts` with RunLog telemetry; writes `evals/results/<name>.json` per PROGRAM.md's reporting contract (n, baseline, result, delta, falsified + because, coverage AND accuracy both).
3. `evals/report.ts` → self-contained HTML (light/dark, phone width) with a per-item review table.
4. Guardrails as code, not prose: refuse to run without a baseline; refuse to fit on the holdout; `INSUFFICIENT-DATA` below n=8; flag any AND-of-confidences gate (the lesson from leads and triage).
5. Port **one** existing experiment (triage is cheapest: 119 items, ~$0.006) and show it reproduces the committed numbers within 0.11.

## Done-check
`npx tsc --noEmit` green; `node evals/run.ts evals/specs/triage.ts` reproduces the triage verdict counts within noise; guardrail tests pass (baseline missing → error; holdout touched → error).

## Do not
Edit anything outside `evals/`. Touch `leads/` or `program/`. Edit the registries: put proposals in `evals/PROGRESS.md`.

## Kickoff prompt (paste into the new session)
```
Read ~/JEV-works/handoffs/README.md and ~/JEV-works/handoffs/eval-system.md (on branch feat/jev-selector in
~/JEV-works; use `git -C ~/JEV-works show feat/jev-selector:handoffs/eval-system.md` if the file isn't in your
worktree). You are the eval-system session. Work only in ~/JEV-works-wt/eval-system on feat/eval-system,
only under evals/. Use an agent team; subagents write to files. Keep evals/PROGRESS.md current with results,
assumptions, and a HANDOFF section. Don't stop to ask unless an invariant or a push is involved.
```
