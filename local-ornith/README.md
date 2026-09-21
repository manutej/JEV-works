# local-ornith/ — routing the open-source fleet with Jev

Sibling of `../leads/`, same architecture: **code gates first, Jev for literal judgements,
deterministic recombination in testable code.** Separate folder because the playground is
changing underneath; shared findings are written up to `../LESSONS.md` (L23–L28), local ones
stay in `LESSONS-ornith.md`.

## What it decides

| stage | question | why it matters |
|---|---|---|
| 1 · triage | which fleet member runs this task | the local:cloud ratio |
| 2 · capability | which tools, and whether to load a skill | **the token lever** — an unloaded skill costs nothing |
| 3 · artifact | is a produced HTML artifact worth keeping | catches slop before it ships |

## Files

| file | does | model calls? |
|---|---|---|
| `questions.mjs` | the three stage question sets + each one's `notForJev` | no |
| `route.mjs` | `localFitness` aggregate, `route()`, `grade()`, entropy | no |
| `pipeline.mjs` | runs a stage, **printing input, questions, probabilities, gates and recombination** | **yes** |
| `validate.mjs` | accuracy + per-question discrimination | **yes** |
| `corpus/routing-basic.json` | 18 labelled routing cases | no |
| `corpus/artifacts.json` | 5 labelled HTML artifacts | no |
| `bank.mjs` | earlier single-stage draft, kept for reference | no |

## Run

```bash
cd ~/JEV-works/local-ornith
E=/Users/manu/jev-playground/.env.local

node --env-file-if-exists=$E pipeline.mjs --stage 1
node --env-file-if-exists=$E pipeline.mjs --stage 3 --corpus corpus/artifacts.json
node --env-file-if-exists=$E pipeline.mjs --stage 1 --no-color   # for piping
```

Colour key: <span>cyan = the state sent in</span>, yellow = question names,
green = a probability **at an end** (decisive), red = **mid band** (weak, do not act),
magenta = a **code gate** (a fact, no model involved).

## Measured

- **stage 1 — 94% (17/18).** The single miss is `bld-02` → `sonnet` where `opus` was expected:
  a boundary *between two escalation targets*, both Claude. **Zero cases route hard work to the
  local model**, which is the failure direction that matters.
- **stage 3 — 100% (5/5).** Five cases, and the same author wrote the questions and the labels.
  Per `../leads/README.md` that measures "do these questions discriminate as designed", not
  "does this work on real artifacts."
- **local share 61%**, measured on a corpus deliberately built to span the escalation paths.
  Not fitted, and not evidence about your real task mix — see below.

## The 80:20 target

80% local is a property of **your task distribution**, not of this router. This corpus is 61%
local because it over-samples hard cases on purpose. If your real work is mostly shell, file
inspection and explain-this, you will see 80%+ without touching a threshold. Measure it on a
real sample before tuning anything — `../LESSONS.md` L6.

## Known gaps

- **No cheap baseline yet.** `../leads/` requires beating a keyword/regex opponent before a
  model is justified. A regex router over verbs (`run|list|show` → local) is not written, so
  Jev's contribution here is **unquantified**.
- `statesItsPurpose` (stage 3) sat mid-band on 2 of 5 and feeds no rule. Candidate to cut (L5).
- `MAX_ENTROPY` in `route.mjs` is **inert** — measured max entropy 0.24 against a 0.9 gate (L23).
- Stage 2 has never been run against a corpus.

## Subagent runners (in `~/ornith-lab/`)

| runner | prompt tokens/task | use for |
|---|---|---|
| `ornith-do` | **~426** | scoped subagent tasks — the right default |
| `ornith-fleet` | same, 3 at a time | fan-out, bounded by measured concurrency |
| `ornith-agent` | 37k–53k | kept only to document the Claude Code overhead |
| `claude-ornith` | 37k–53k | interactive sessions, not fan-out |

Verified end to end: 3 concurrent subagents, 3 correct answers, 30s wall, each answer
checked independently against the filesystem.
