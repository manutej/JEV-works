# Brief: Siblings survey (session: siblings-survey)

**Reads:** `~/jev/{jev, jev-elder, jev-playground, volumetric-intelligence, ceti-clock-tree, weave-jev}` (GitHub clones).
**Writes:** only `~/JEV-works-wt/siblings` on branch `feat/siblings-survey` (create it:
`git -C ~/JEV-works worktree add ~/JEV-works-wt/siblings -b feat/siblings-survey main`).
**Zero writes to `~/jev/*`.** The jev-operad and business-automation sessions own two of those repos.

## Why
Six repos all talk about Jev, and they disagree on details. For example, jev-elder says "pin `jev-1.13.0`, never `jev-latest`", while
volumetric-intelligence lists `TYPESAFE_API_KEY` "in client JS", which is a possible **key-exposure risk to verify**.
Nobody has a single picture of which repo calls Jev, how, with which contracts, and what's broken.

## Deliverables
1. `SIBLINGS.md` table with one row per repo: purpose (1 line) · calls Jev? (file:line) · path (gateway / direct / Apps Script → Vercel) · pinned version · primitive names (`boolean` vs `noul`) · deploy target · last commit · risks.
2. A **security pass**: any place a TypeSafe/Gateway key could reach a browser or a commit. Report file:line; don't fix it.
3. A contracts diff: where the repos' rules conflict (pin, fail-closed, primitive naming) with each other or with JEV-works `lib/jev.ts`.
4. `handoffs/siblings/<repo>.md`: 3–5 proposed tasks per repo, each with a done-check. These become future session briefs.

## Done-check
Every table cell cites a file:line or says "none found". `git -C ~/jev/<repo> status --porcelain` is still empty for all 6 repos after the survey.

## Kickoff prompt
```
Read ~/JEV-works/handoffs/README.md and siblings-survey.md (git -C ~/JEV-works show
feat/jev-selector:handoffs/siblings-survey.md). You are the siblings-survey session: create the worktree it names,
read ~/jev/* without modifying anything there, and produce SIBLINGS.md + handoffs/siblings/*.md. Use an agent team
(one subagent per repo, each writing its findings to a file). Keep PROGRESS.md with a HANDOFF section.
```
