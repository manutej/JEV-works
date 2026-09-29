# JEV-works

Working out whether a typed-decision model can own real decisions in real systems — and building a
validated library of question sets for the places where it can.

The model under test is **Jev** (TypeSafe AI), reached through Vercel AI Gateway as
`typesafe-ai/jev`. You declare named questions up front, hand it one shared state, and it answers
all of them in parallel — returning a choice, a score, or a probability instead of prose. It cannot
emit a label you did not declare, which is a type guarantee and not a correctness guarantee.

**If you are an AI agent, read `llms.txt` instead.** It is the same material compressed, with the
rules stated as constraints.

---

## What makes this project unusual

Most evaluation work measures the model. This measures **the instruments** first, because nearly
every wrong conclusion here came from an instrument being broken rather than the model being bad:

- a gate that required every signal to be confident, which escalated 94% of items
- a weighted score that summed a rubric level with a probability, asserting a calibration that does
  not exist
- a category rollup that averaged a cost with a benefit, inverting the signal
- a verdict function that returned the *best* verdict when given zero data
- a latency figure that was really throughput, reported as latency

All five produced plausible numbers. That is the recurring hazard, and it is why the reading order
is `NETER.md` (what is true, with evidence and status) then `LESSONS.md` (what went wrong, and the
rule it produced).

## The two-minute version of what we learned

**It is a filter, not an oracle.** Put it in front of the model you already use. Act on its
confident ends, escalate the middle, and keep control flow in your own code.

**The question you ask is the product.** One broad question underperforms badly — a phishing task
scored 62.6% as a single question and 95.1% decomposed into five narrow ones. A two-line regex
scored 91.8% on the same task, which is the uncomfortable part.

**Ask literal questions only.** Anything requiring a comparison, a counterfactual, or reasoning
across items never becomes decisive. Those go in code, where most of them are deterministic anyway.
Moving one such judgement out of the model and into a containment check produced 24× the result at
zero model cost.

**Gate on entropy, not confidence.** On inputs with no right answer it answers confidently — empty
strings and lone emoji came back at p 0.82–0.91 on the same wrong bucket. The *shape* of the
distribution separated those cleanly where the top probability did not.

**Batching is nearly free, up to a point.** 32 questions cost the same latency as one. At 100
questions latency roughly doubles, because the questions themselves consume the shared 32K budget —
a large question set is a large state.

## Reading order

| # | file | why |
|---|---|---|
| 1 | `NETER.md` | 24 properties, each with its evidence and a status. `measured here` means we ran it; `vendor claim` means nobody local has checked |
| 2 | `LESSONS.md` | 22 lessons as what happened / why / the rule |
| 3 | `program/PROGRAM.md` | the five-experiment programme, hypotheses written before the runs |
| 4 | `question-bank/README.md` | the question sets and how to validate one |
| 5 | `dashboard/index.html` | current state, generated from result files |

## Layout

```
NETER.md              property registry — the findings
LESSONS.md            failure registry — the rules
llms.txt              agent-facing orientation
program/              the five-experiment programme + results
question-bank/        question sets, the composition algebra, the validator
  bank.ts             nine sets by context, each naming what NOT to ask the model
  colors.ts           answer colours and legal coercions; fails the build on an illegal one
  confidence.ts       confidence / spread / verdict, importable
  measure-confidence.ts   CLI: validate a set against a corpus, no labels needed
lib/telemetry.ts      RunLog: announce before, stream during, reconcile after
triage/               context pruning — the reference working example
masked/               finds categorical fields usable as labels
leads/                three-stage lead pipeline (currently broken — see below)
pass1/                100-question research-window scorer
dashboard/build.py    regenerates the dashboard from result files
runs/                 one JSONL line per item from every instrumented run
```

## Getting set up

Jev is reachable two ways, chosen in one place (`lib/jev.ts`). Scripts pass `JEV` as `model:` and
never name a backend.

| backend | auth | picked when |
|---|---|---|
| **direct** — `api.typesafe.ai/v1/systemone` | `TYPESAFE_API_KEY` (exported in `~/.zshrc`, does not expire) | the key is set, or `JEV_BACKEND=direct` |
| **gateway** — Vercel AI Gateway, `typesafe-ai/jev` | Vercel OIDC token in `jev-playground/.env.local` (~12h) | no key, or `JEV_BACKEND=gateway` |

```bash
cd /Users/manu/JEV-works
node <script>.ts                                                            # direct
JEV_BACKEND=gateway node --env-file-if-exists=/Users/manu/jev-playground/.env.local <script>.ts
```

If the gateway returns 401, the token has expired: `cd /Users/manu/jev-playground && vercel env pull`.
`JEV_MODEL` pins a version on either backend (e.g. `jev-1.13.0`). `node probe-backends.ts` runs the
same questions through both and prints them side by side.

The two paths agree: on the 119-item triage corpus, 117/119 verdicts matched, median |Δp| 0.01, with
direct at half the latency (p50 131ms vs 268ms). Pricing lookups stay keyed on the gateway id.

Node must strip types natively (≥ 22.18 / 23.6): `/opt/homebrew/bin/node` (v25) does,
`/usr/local/bin/node` (v22.17) does not and fails with `ERR_UNKNOWN_FILE_EXTENSION`. There is no
build step. `npx tsc --noEmit` must pass.

## Things you will most likely want to do

**Validate a question set before trusting it.** This needs no labels — it measures whether your
questions are *answerable*, which is a different and prior question to whether the answers are
right:

```bash
node --env-file-if-exists=/Users/manu/jev-playground/.env.local \
  question-bank/measure-confidence.ts DOC_RELEVANCE question-bank/doc-relevance-states.json
```

Four verdicts come back. `JEV-SAFE` and `MARGINAL` are usable. `MOVE-TO-CODE` means the question
never becomes decisive and belongs in code. `NO-INFORMATION` is the one people miss — the question
is answered confidently but *identically* every time, so it costs tokens and adds nothing, and it
looks perfectly healthy in any accuracy metric.

**Find labelled data you did not know you had.** Any categorical field that already exists is a
label: mask it, predict it, score against what you hid.

```bash
python3 masked/find-targets.py ~/some-project
```

It reports only fields that are closed, populated, balanced, and separable with low leakage. There
are 23 such targets on this machine.

**Refresh the dashboard.** Reads every result file and re-emits the page:

```bash
python3 dashboard/build.py
```

## Leads: fixed, and Jev loses (2026-09-21)

`leads/` runs a three-stage acquisition → qualification → sales pipeline over 600 synthetic leads with
planted labels. It used to be "known broken on purpose". Four instrument bugs are now fixed on `main`:
colliding company names, name-only dedup, an all-confident admission gate (L35), and substring dedup
(found by an independent review). Details: `leads/HANDOFF.md`.

The honest result, pre-registered on a fresh seed (7, n=600): Jev reaches a verdict on **69.7%** of leads
(≥ 95% was required, so **FAIL**) and is right on **67.8% of all leads vs the regex's 92.2%**. It is 97.4% on
the leads it does decide. The regex bar moves with the corpus: 91.7% was measured on the broken one.
If the regex keeps winning once the question set is fixed, the task is surface-level and the model is
not needed. That is an acceptable answer.

## A note on how results are reported here

Every number carries its `n`, its baseline, and whether the thresholds behind it were fitted or
hand-set. Negative results are recorded with the same care as positive ones, and thresholds are
never retuned to improve a number that is about to be reported. Where a measurement could not be
verified, it says so rather than asserting softly.

This is not fastidiousness for its own sake. A confident-looking number is the default output of a
broken measurement — every defect listed above produced one first.

## Browser surface (Jev × Vibium)

The browser contexts, items and results live under `kit/modules/contexts/browser.*`, `kit/modules/items/browser-*` and `kit/results/browser-*`; the lab handoff is `handoffs/vibium-browser.md`. The entry point for the whole surface, with the annotated file tree, is `HANDOFF.md` in manutej/jev-tape.
