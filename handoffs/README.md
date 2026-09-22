# Handoffs: multi-session ownership map

Every session owns **one worktree or repo and one branch**, writes its results to files (never only to chat),
and keeps `PROGRESS.md` in its own area. Registries (`NETER.md`, `LESSONS.md`, `README.md`, `llms.txt`) have
**one writer**, the main-tree session. Every other session sends a *Registry proposal* instead.

| session | where | branch | owns (may edit) | brief |
|---|---|---|---|---|
| **main / orchestrator** (this one) | `~/JEV-works` | `feat/jev-selector` | `lib/`, `local-ornith/`, `program/drift*`, registries, `META-PLAN.md`, `handoffs/` | — |
| leads-pipeline (b4f08e) | `~/JEV-works-wt/leads-pipeline` | `feat/leads-pipeline` | `leads/` only | agreed via message |
| e3 (background agent team of main) | `~/JEV-works-wt/e3` | `feat/e3-blind-test` | `program/e3-*`, `program/E3-PROGRESS.md` | in-session |
| **eval-system** | `~/JEV-works-wt/eval-system` | `feat/eval-system` | new `evals/` dir only | [eval-system.md](eval-system.md) |
| **siblings-survey** | reads `~/jev/*`, writes `~/JEV-works-wt/siblings` | `feat/siblings-survey` | `SIBLINGS.md`, `handoffs/siblings/` | [siblings-survey.md](siblings-survey.md) |
| **jev-operad** | `~/jev/jev` (GitHub clone) | `feat/typesafe-direct` | that repo | [jev-operad.md](jev-operad.md) |
| **business-automation** | `~/jev/jev-playground` (GitHub clone, "Jev secretary") | `feat/secretary-workflows` | that repo | [business-automation.md](business-automation.md) |

## Rules every session follows
1. **No pushes, no deploys** to GitHub or Vercel without Manu approving that specific push (I11). Commit locally.
2. Never print `TYPESAFE_API_KEY`. To load it: `source ~/.zshrc >/dev/null 2>&1`. Run `.ts` files with `/opt/homebrew/bin/node` (v25); `/usr/local/bin/node` v22.17 fails.
3. **Pin `jev-1.13.0`** for anything that ships. Use `jev-latest` only to measure drift.
4. Every experiment carries a cheap baseline, a pre-declared holdout, `JEV_ID`, and n. Report losses. Accuracy gaps need a paired test (McNemar); P4's band is per-answer probability jitter only (I6).
5. Re-read a file right before editing it. Before any shared-file write, run `find <dir> -mmin -10` to check for writes from other sessions.
6. Use an agent team inside your session. Subagents write results to files and return short summaries, which keeps your context lean.
7. Rebase on `main` before merging; merges happen one at a time, and you tell the other sessions after each merge.
8. Worktrees of JEV-works share `node_modules` by symlink (same manifest, so L21 does not apply). **Never `npm install` in a worktree**: it would change every worktree's dependencies. Ask the main session.
9. When a session finishes or pauses, it writes a `HANDOFF` section in its `PROGRESS.md`: state, commits, open questions, next step.

## How to start a session
Open a new terminal and run `cd <where> && claude`, then paste the brief's **Kickoff prompt** block.
