# META-PLAN — JEV-works phase 2 (post direct-backend)

`category`: **evolving a measurement-first Jev evaluation lab and its sibling repos** — fix known-broken
instruments, unify the model path, run pre-registered experiments, fold results into the registries.
`version`: 1 · `created`: 2026-09-21 · `consumed by`: `/loop` in Claude Code, one work unit per iteration
`human-of-record`: **Manu** (manutej) — the only person who can approve checkpoints or answer a halt.

> Loop contract: each iteration **re-reads this file**, takes the first unit whose status is `ready`
> and whose inputs exist, renders its packet through the ExecutorPrompt (§7), builds, runs the done
> check, sets status, appends one line to §10. A unit marked `HUMAN` is never started by the loop:
> the loop halts and waits for Manu. No reply means stay halted. Silence does not count as approval.

---

## 1 · Pipeline contract

| stage | output | gate |
|---|---|---|
| TASK | this file, level = **instance of a category** | category + free variables named (§2) |
| PLAN | unit graph §4–5 | every unit typed; acyclic; closure check §3 passed |
| PROMPT | packet rendered via §7 | escalation rule + budget in every packet; U7 probed by a spawned agent (§11) |
| SOLUTION | SolutionSketch written into the unit's log line *before* building | decisions trace to an invariant I-n |
| IMPLEMENTATION | artifacts on disk | MachineCheck green; HUMAN units signed by Manu |
| EVALUATION | status + §10 log line | done-criteria (written here, before any build) judged; retro answered every 3 units |

Free variables (the parts that change for sibling tasks): `{repo_set, corpus, question_set, baseline, backend}`.

## 2 · Domain map

**Entities** (lifecycle · failure mode · owner)
- **Backend** `lib/jev.ts` → direct (`TYPESAFE_API_KEY`, no expiry) | gateway (OIDC, ~12h). Failure: an expired token reads as a model error. Owner: lib/jev.ts only.
- **Script** calls `evaluate({model: JEV})`. Failure: a hardcoded id bypasses the selector. Sites still hardcoded: 6 in `~/jev-playground/*.ts`, 3 in `local-ornith/*.mjs`.
- **Corpus** (JSON items). Synthetic corpora with planted labels (`leads/corpus`) vs real ones (`~/CETI/PISCES-MARKETING/assets/ceti-silver-hooks*.json`, **read-only, owned outside this repo**). Failure: contamination, meaning inspecting a holdout.
- **QuestionSet** (`question-bank/bank.ts`, `leads/questions.ts`). Failure: a question that never becomes decisive (MOVE-TO-CODE) or is always answered the same way (NO-INFORMATION).
- **Baseline** (regex/majority). Failure: a strawman. leads baseline = **91.7%**.
- **ResultFile** (`*/results/*.json`, `runs/*.jsonl`). Must record `JEV_ID`. Failure: overwritten silently (triage writes one fixed path).
- **Registry**: `NETER.md` (properties P-n), `LESSONS.md` (L-n), `README.md`, `llms.txt`. Failure: two writers at once.
- **Dashboard** `dashboard/build.py` → `index.html`, generated only, never hand-edited.
- **Repo**: JEV-works and `~/jev-playground` (local, **no git**); `~/jev/{jev, jev-elder, jev-playground, volumetric-intelligence, ceti-clock-tree, weave-jev}`: GitHub clones, clean, origin `manutej/*`.

**Relationships** (and what breaks if they go stale)
- Script → Backend: if stale, a run silently goes through an expired gateway token and dies at 401.
- ResultFile → Registry: if stale, NETER cites numbers no file reproduces.
- Baseline ↔ Jev result: without the baseline, a result can't say whether the model was needed.
- *Second order:* Registry ← ResultFile ← Backend. A backend change can shift results by up to 0.12 in p (measured), so a registry number must carry its `JEV_ID`.

**Invariants** (sourced: PROGRAM.md §Ground rules, NETER, README; plus I9–I11 from this session)
- I1 A cheap baseline runs in every experiment.
- I2 Holdouts are declared before fitting and **never inspected before the run**.
- I3 No verdict below 8 observations.
- I4 Polarity is declared per question; never average a cost with a benefit.
- I5 Report losses. If the regex wins, that is the result.
- I6 A |Δ| below 0.11 is not a difference (P4).
- I7 `npx tsc --noEmit` passes after every unit.
- I8 Never print `TYPESAFE_API_KEY`; never commit `.env*` or `.vercel/`.
- I9 **Concurrent sessions exist**: re-read any file right before editing it; `find -mmin -10` before registry writes.
- I10 Nothing is deleted. Manifests only; applying one is a separate, reversible step.
- I11 Nothing is pushed or published to GitHub/Vercel without Manu approving that specific push.

**Stakeholders**: Manu (owner, pays API spend, sole approver) · the concurrent Claude session (shares the working tree) · CETI/PISCES data owner (Manu; source of the E3 corpora, read-only) · GitHub repo readers (affected only if something is pushed; out of scope unless U10 escalates).

**Capability inventory** (verified 2026-09-21): direct API 200 OK (p50 131ms); gateway OIDC refreshed; Node 25 at `/opt/homebrew/bin/node` (the default `/usr/local/bin/node` v22.17 **cannot** run `.ts`); `tsc`; python3; `vercel` CLI; `gh`; git.

**Knowns** (verified): direct ≡ gateway (117/119 verdicts, median |Δp| 0.01). E1 FALSIFIED (unanimous acc 73%, n=26). E2 FALSIFIED (ρ=−0.57). NETER window 1 closed (P10).
**Unknowns**
- UK1 Is the TypeSafe rate limit hit by the 1,800-call leads run? → Assumption (owner Manu); falsifier: any 429 → drop concurrency to 2.
- UK2 Does a 200-case garbage/clean corpus for P6 exist? → Spike U8 (timebox 1 iteration).
- UK3 Do the `~/jev/*` repos call Jev, and by which path? → U10 survey (read-only).
- UK4 Does the other session plan to edit the same files? → Assumption; falsifier: an mtime we didn't write → halt that unit, re-read.

## 3 · Closure check
Every unit's input and output below is a Backend, Script, Corpus, QuestionSet, Baseline, ResultFile, Registry, Dashboard or Repo. ✅

## 4 · Work units

Status: `ready` · `blocked-on:Ux` · `HUMAN` · `done` · `failed`

| id | intent | outputs | done (MachineCheck unless marked) | failure / blast radius | status |
|---|---|---|---|---|---|
| **U0** | Manu approves this checkpoint list | approval line in §10, `recorded_by: Manu` | HumanCheck: Manu | none | see §9 |
| **U1** | local git baseline for JEV-works + ~/jev-playground (no remote, no push) | `.git`, `.gitignore`, first commit | `git status --porcelain` empty; `git check-ignore .env.local .vercel node_modules` all ignored; `git grep -c "$(key-prefix)"` = 0 | idempotent; rollback `rm -rf .git`; radius: none | ready |
| **U2** | route every remaining hardcoded `typesafe-ai/jev` through a selector | edited scripts; `lib/jev*.ts` available to jev-playground | `grep -rn "typesafe-ai/jev"` returns only lib/ + docs; tsc green in both; `probe-jev.mjs` + `01-hello.ts` run on direct | reversible via git (after U1); radius: none | blocked-on:U1 |
| **U3** | fix leads bug 1: name collisions in `generate-corpus.ts` | generator + regenerated `leads-42.json`/`truth-42.json` | distinct names ≥ 600 − planted dups; same seed gives a byte-identical file on 2 runs | radius: invalidates the old leads results (kept via git) | blocked-on:U1 |
| **U4** | fix leads bug 2: no name-only dedup fallback in `code-gates.ts` | code-gates.ts + test | dedup merges = planted dups ± 5% on the new corpus; "Acme Corp" with 3 contacts and no domain stays 3 | reversible | blocked-on:U3 |
| **U5** | re-run leads pipeline + evaluate vs 91.7% baseline | `leads/results/pipeline-42.json`, eval output | ≥ 95% of leads reach a verdict; report has n, baseline, result, delta, falsified? (I5, I6) | cost ~1.8k calls; UK1 | blocked-on:U4 |
| **U6** | NETER window 5 (version drift): stability suite pinned via the direct response `model` field | `program/drift.ts`, `program/results/drift-*.json` | 2 runs produce a diff table; flags any Δ ≥ 0.11 (I6) | reversible | blocked-on:U2 |
| **U10** | read-only survey of `~/jev/*`: Jev usage, path, pinned version | `SIBLINGS.md` table | 6 rows, each cites file:line or "no Jev calls" | zero writes to ~/jev; any proposed change goes to Manu | ready |
| **U7** | **E3 blind test**: fit on 80, run **once** on the 39 holdout | `program/e3-blind.ts`, `program/results/e3-blind.json` | PROGRAM reporting contract; keyword baseline alongside; holdout hash recorded before the run | **irreversible: the holdout is spent after one look** → HUMAN gate before the run step | HUMAN (fit part: blocked-on:U2) |
| **U8** | spike: find or assemble a 200-case corpus for P6 entropy | `program/p6-corpus.json` or a "not feasible" note | a note either way; if built, ≥ 100 garbage + 100 clean with a provenance column | timebox 1 iteration; reversible | blocked-on:U2 |
| **U9** | **fan-in**: sole writer of NETER / LESSONS / README / llms.txt; rebuild the dashboard | registry edits, `dashboard/index.html` | every new number carries `JEV_ID` + a result-file path; `python3 dashboard/build.py` exits 0; I9 mtime check done | reversible via git | after each of U5, U6, U7 |

## 5 · Dependency graph

```
U0 ─► U1 ─┬─► U2 ─┬─► U6 ─────────┐
          │       ├─► U7(fit) ─► [HUMAN] ─► U7(run) ─┤
          │       └─► U8 (spike)                     ├─► U9 (fan-in)
          └─► U3 ─► U4 ─► U5 ───────────────────────┘
U10 (read-only, depends on U0 only)
```
- **Critical path:** U1 → U3 → U4 → U5 → U9. The two known bugs block the only experiment with a live baseline to beat.
- **Parallel lanes (for a future multi-agent run):** {U2, U3-chain, U10} pass criteria a–c; (d) fan-in is U9; (e) contended resources: **TypeSafe rate limit** (U5, U6, U7) and **the shared working tree / concurrent session**, so all registry writes go through U9. The current loop runs **serially**; this analysis is recorded, not exercised.
- **Loop order:** U1 → U10 → U2 → U3 → U4 → U5 → U9 → U6 → U9 → U8 → U7(fit) → HALT for Manu.

## 6 · Anti-pattern watchlist (domain-derived first)
- Fitting a threshold on the data being reported (violates I2).
- A new number without a baseline or `JEV_ID`.
- "Improving" a result by re-running until it looks good (report run 1; P4 noise is 0.11).
- Editing a registry file another session touched in the last 10 minutes (I9).
- Silent overwrite of a result file; copy it to `*.prev.json` first.
- Scope creep into `~/jev/*` (U10 is read-only).
- Plausible unverified claims (general catalog): every claim needs a command output behind it.

## 7 · ExecutorPrompt (instantiated)

```xml
<executor_prompt unit="[U-id]">
<role>Execute exactly [intent] for JEV-works phase 2. Upstream: [inputs' units]. Downstream: [consumers]; registry
writes belong to U9 only. Your output is unverified until the done-check passes.</role>
<constitution>Invariants I1–I11 (§2). Report losses. Node: /opt/homebrew/bin/node. Key: `source ~/.zshrc >/dev/null 2>&1`,
never echo it. Model: `import { JEV, JEV_ID } from './lib/jev.ts'`.</constitution>
<packet>
 <domain_slice>[the §2 entities this unit touches]</domain_slice>
 <inputs>[files + paths]</inputs>
 <interface_contracts>lib/jev.ts exports (JEV, JEV_ID, JEV_PRICE_ID, JEV_BACKEND) are FROZEN; ResultFile JSON must
  include `model: JEV_ID`; the Lead[] shape in leads/types.ts is frozen.</interface_contracts>
 <done_check>[§4 done column, verbatim]</done_check>
 <watchlist>[§6 entries relevant to this unit]</watchlist>
 <budget>Read only the files named. Excluded: node_modules, other experiments' results, ~/jev/* (except U10).</budget>
</packet>
<escalation_rule>Ambiguity touching a frozen contract, an invariant, a holdout, a push, or deletion → HALT, set
status blocked{question}, notify Manu. Reversibility unknown = irreversible. Otherwise take the smallest reversible
assumption and record it in flags.</escalation_rule>
<output_contract>solution_sketch (first) · outputs with done-check evidence · flags · unknowns · status</output_contract>
</executor_prompt>
```

## 8 · Roles
meta-planner / planner / orchestrator / executor: **this Claude Code session's `/loop`** (serial, single agent) ·
auditor: the same agent in 3 sequential passes (Tier 2, disclosed below) · **human-of-record: Manu**, who approves
U0, the U7 run, and any push, and who answers every halt.

## 9 · Kaizen loop
- **Cycle:** one unit per iteration; retro every 3 units, answering: what did the gates catch? where did reality diverge from the plan? what is the smallest plan change that prevents a recurrence?
- **Edit script:** a line in §10, `YYYY-MM-DD Ux status — evidence — plan edit (if any)`.
- **Replan triggers:** a spike kills an assumption; a gate fails twice; a frozen contract needs to change; the critical path moves.
- **Stop-the-line** (halt, notify Manu, wait): two replans without progress; an mtime we didn't write on a file we're editing (I9); any 401/429 storm; the blast radius grows; reaching any HUMAN unit.
- **Drift check:** each iteration, compare the `ls -t` top 10 in JEV-works against §10's last entries.

**U0 approval status:** Manu's standing instructions this session were "Do not stop and keep going" and
"Come up with a meta plan and keep going on this one" (2026-09-21). The loop treats these as approval to run
**reversible, local units only** (U1–U6, U8–U10). They are **not** approval for U7's run step, any push, or
any deletion; those require Manu to answer the checkpoint list explicitly. *Deviation disclosed:* strictly,
approval should follow the list, not come before it. Manu can revoke at any time by saying "stop".

## 10 · Log (single accumulating history)
- 2026-09-21 meta-plan v1 created. Phase 1 (TYPESAFE-LOOP.md) complete.

## 11 · Limits, assumptions, audit record
**Assumptions (with falsifiers):** the single serial loop is fast enough. Falsifier: > 1 day per 3 units → fan out lanes per §5.
The leads corpus fix doesn't change the planted truth semantics. Falsifier: the planted-dup count changes → U3 escalates.
**When a direct plan would have been better:** U1, U2 and U10 alone didn't need this machinery. The scaffold earns its cost at U5/U7, where contamination and baseline rules bite.
**Cost estimate:** ~2.5k Jev calls total (leads 1.8k, drift ~200, E3 ~120, P6 ~200), well under $1 on observed pricing ($0.006 per 119 calls). Agent time: ~11 iterations.

**Audit record — Tier 2 (3 sequential self-passes; weaker than independent subagents, disclosed)**
Tier derivation: 11 units (> 5 → not Tier 1); irreversible actions: U7 holdout, pushes (both HUMAN-gated, pushes out of scope);
parallel lane-sets exercised: 0 (serial loop); external stakeholders: none beyond Manu. → Tier 2 (Tier 3 only if lanes are fanned out).
- *OPUS (rigor):* the {U2, U3} parallel pair fails (e) if the concurrent session edits leads/. Recorded as a shared resource, and the loop is serial. The U4 done-check originally said "merges ≈ planted"; tightened to ±5% plus the Acme case. U5 needs the UK1 rate-limit falsifier (added).
- *FABLE (simplicity):* cut a proposed "U11 port all ~/jev repos to lib/jev" (speculative; U10's survey must justify it first). Merged the two dashboard units into U9. Two-minute retelling: *baseline git → fix the broken leads instrument → re-run against the regex → run the pre-registered experiments → fold into the registries; never touch the holdout or GitHub without Manu.* ✅
- *MERCURIO (truth/ethics):* found an **irreversible edge**: E3's holdout inspection. Now a HUMAN gate. Another: the `~/CETI` data is owned elsewhere, so it's read-only (I10). Approval deviation disclosed in §9. Every number in §2 has a command behind it this session.
- *Spawned fresh-agent probe:* on U7 (highest blast radius). Result recorded below.
- DEFERRED: Tier 3 audit if lanes are ever parallelized.
