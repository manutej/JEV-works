# One question scope, and what kit/gate is

**Status:** proposal (2026-09-22), for Manu. Nothing here is merged or pushed.

## The problem

Questions live in seven formats: `leads/questions.ts`, `question-bank/bank.ts`, `local-ornith/*.mjs`,
`program/e5-questions.ts`, `kit/examples/*.json` (kit specs), `kit/modules/contexts/*.json`, and an untracked
craft bank. Each copy has its own idea of a valid question, so each lesson (literal questions, escape options,
decisive ends) has to be re-learned per copy. The McNemar function had four copies for the same reason.

## One scope: every question set is a Context

```
kit/modules/contexts/<scope>.<name>.json      the ONLY place a question is written
  scope ∈ craft | domain | meta | experiment  (craft.robustness-at-boundaries, domain.leads, meta.question-quality)
  Context = { name, description, artifact {type, stateFields}, modules[] }
  Module  = { name, purpose, questions {id: Atom}, compose: Decision, notForJev[] }
  Atom    = TypeSafe docs question (noul | choice | score + criteria) + polarity + reads + escapeOption?
```

**Rules:**
1. A question exists only in a Context file. Code never declares question text.
2. Every Context passes the meta-type lint (`kit/modules/cli.ts lint`, rules M1–M7) before anything runs it.
3. Everything else is *derived* from a Context, never written by hand:
   - kit specs, via `hydrate.toKitSpec`
   - gate decisions, from `Module.compose`
   - reviewer meta-prompts, via `hydrate.toMetaPrompt`
   - question-quality vetting, via `cli.ts vet`
   - question trees for kit/oc, as an optional `tree` on a module
4. A question is *promoted* only after a label-free quality run (atEnds/spread) on a real sample. The Context
   records which sample and verdict: `measured: {sample, verdict}` per Atom.

**Migration (each step proven by replay: same questions in, same recorded outcomes out):**

| From | To | Owner |
|---|---|---|
| `leads/questions.ts` (3 stages) | `domain.leads.json`, 3 modules; `pipeline.ts` reads it | leads (b4f08e) |
| `question-bank/bank.ts` (9 sets) | `domain.<set>.json` each | orchestrator decides |
| `program/e5-questions.ts`, `local-ornith/*` | contexts, or kept as frozen experiment records | orchestrator |
| `kit/examples/*.json` | generated from a context | kit core (orchestrator) |
| craft bank (untracked) | `craft.<lens>.json` | Manu's craft session |

## kit/gate, clarified: "what do the answers mean, and may we claim it?"

kit/gate owns **meaning and claims**, never question content, statistics or running.

| File | One job | Input → output |
|---|---|---|
| `decide.ts` | answers → verdict | `(answers, Module.compose)` → `true / false / escalate` |
| `policy.ts` | verdict → correct? | `(verdict, label, labelRecord, ScoringPolicy)` → `boolean` |
| `claim.ts` | may the headline be claimed? | `GateInput` (+ `GateConfig`) → ACCEPT / REFUSE + failing gate, emitted as standard GateResults (G3–G7, see below) |
| `report.ts` (new) | build `GateInput` from any run | `(kit results, labels, policy, split)` → `GateInput` |
| `load.ts` | the only boundary | JSON files → validated types, all errors at once |

**Not kit/gate** (and never duplicated in it):
- `kit/stats.ts` (McNemar, entropy)
- `kit/checks.ts` (text disjointness)
- `kit/threshold.ts` (fitting cut-offs)
- `kit/oc/` (question-tree consistency)
- `kit/run.ts` (asking Jev)

**What is missing today:** `report.ts`. Only `leads/evaluate.ts` can build a `GateInput`, so the claim gate
is reusable in principle but not in practice. With `report.ts`, any context's run gets the same E1–E5
verdict. `leads/splits.ts` then shrinks to a declaration file read by `report.ts`, using `kit/checks.seenShare`
instead of its own partition.

## One gate catalogue (agreed with the orchestrator, 2026-09-22)

Every experiment reports the same stable gate ids (`kit/standard-gate.ts`, core). kit/gate's claim edges
map onto them; the old E-labels survive in `evidence.legacyEdge`.

| id | checks | owner | was |
|---|---|---|---|
| G1-spec-valid · G2-privacy | spec and states are safe to send | core | |
| G3-text-disjoint | holdout text unseen by fitting | core evaluator; claim.ts narrows the scope | E1 |
| G4-coverage | coverage ≥ declared minimum | core evaluator | E2 |
| G5-policy-predeclared | scoring rule fixed before the data | kit/gate | E3 |
| G6-paired-test | paired exact test on per-item correctness | kit/gate | E4 |
| G7-strata-consistent | in-scope strata agree (Holm), strata partition the headline | kit/gate | E5 |
| G8 thresholds · G9 calibration · G10 tree consistency | fitted cuts held out, calibration, kit/oc | core | |

A Context may declare `gates: GateId[]` to say which apply to it.

## Decisions for Manu

1. Adopt "a question exists only in a Context file" as the lab rule.
2. Who migrates `question-bank/`: the orchestrator, or this session with its approval.
3. PRs: the repo is on GitHub (`origin` = github.com/manutej/JEV-works). Open PRs for feat/kit and
   feat/leads-blind there, or keep merging locally.
