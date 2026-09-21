# Brief: Jev business workflow automation (session: business-automation)

**Where:** `~/jev/jev-playground` (GitHub `manutej/jev-playground`, the **Jev secretary**; not the local TS
`~/jev-playground`) · **branch:** `feat/secretary-workflows` · **commit locally, no push/deploy without Manu.**

## What the repo is
Google Apps Script as the Workspace interface, Vercel as the orchestrator, Jev as the fast decision layer,
an LLM only when Jev or the code gates ask for help. Status (20 Sep): exploration + docs, no production traffic.
Apps Script → `POST /api/triage` on Vercel (owns the key, pins `jev-1.13.0`). Rule from its README:
**never send `type: "boolean"` to `api.typesafe.ai` (HTTP 400)**; the native primitive is `noul`.

## Goals
1. Read the repo (7 files) and `apps-script/README.md`. In `PROGRESS.md`, list the secretary loop's decisions (inbox triage, calendar, follow-ups): which are Jev questions and which belong in code.
2. Pick **one** workflow end to end (inbox triage is the documented one). Write its question set following the lab's rules: literal questions only; comparisons and counting go in code; declare polarity; gate on entropy, not top probability.
3. Build the Vercel `/api/triage` route against the direct TypeSafe API (key server-side only), pinned `jev-1.13.0`, fail-closed, with a regex/keyword baseline alongside.
4. Evaluate on a **local** labelled sample (synthetic or Manu-exported; no live mailbox access unless Manu grants it): coverage AND accuracy vs baseline, per the lab's reporting contract.

## Do not
Deploy to Vercel, push, touch a real inbox/calendar, or send email. Those all need Manu's explicit go.

## Kickoff prompt
```
Read ~/JEV-works/handoffs/README.md and business-automation.md (git -C ~/JEV-works show
feat/jev-selector:handoffs/business-automation.md). You are the business-automation session in ~/jev/jev-playground
(the GitHub secretary repo). Create branch feat/secretary-workflows, keep PROGRESS.md (results, assumptions,
HANDOFF). Use an agent team. Commit locally; no push, deploy, or live Workspace access without Manu.
```
