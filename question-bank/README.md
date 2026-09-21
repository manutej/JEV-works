# Question bank

Reusable Jev question sets by context, plus the tool that validates a set before you trust it.

```
bank.ts                  the sets, typed and exported
measure-confidence.ts    rank any set's questions by how confidently they get answered
```

## The organising rule

From `../NETER.md` **P21**: questions divide by what Jev can actually answer.

- **Literal** — answerable by reading the state in front of it. These reach the ends on 50–83% of
  items and are safe to build a policy on.
- **Relational** — require reasoning across a goal, a history, a comparison, or a counterfactual.
  These sit in the mid band permanently. Compute them in code, or escalate them to a text model.

Every set names its relational judgements in `notForJev` with the replacement. That list is the
most valuable part of each set — it is what stops you from asking the model something it will
answer with a number that looks like an answer.

## Validate before you trust

```bash
node --env-file-if-exists=/path/.env.local \
  question-bank/measure-confidence.ts CONTEXT_TRIAGE states.json
```

`states.json` is a JSON array of real states. No labels needed — this measures whether your
questions are *answerable*, not whether the answers are *right*. It reports two defects that need
opposite fixes:

| verdict | meaning | fix |
|---|---|---|
| `JEV-SAFE` | reaches the ends on ≥50% of states | build the policy on it |
| `MARGINAL` | 25–50% at the ends | usable with a wider review band |
| `MOVE-TO-CODE` | <25% at the ends — never decisive | compute it or escalate it |
| `NO-INFORMATION` | confident but spread <0.08 — same answer every time | cut it or rewrite it to discriminate |

`NO-INFORMATION` is the one people miss. A question that is answered before it is asked costs
tokens and contributes nothing, and it looks perfectly healthy in any accuracy metric.

This tool found a defect in its own measured set on first run: `cheaplyRepeatable` scored 17% at
the ends, because it was reading output text to answer a question the tool name already settles.

## Sets

| set | status | produces |
|---|---|---|
| `CONTEXT_TRIAGE` | **measured** (119 outputs) | keep / drop / escalate manifest |
| `ROUTING` | drafted | destination + auto-route flag |
| `CLASSIFICATION` | drafted | label + confidence band |
| `RUBRIC` | drafted | per-criterion levels, weighted in code |
| `TOOL_GATE` | drafted | auto-approve / prompt / refuse |
| `DOC_RELEVANCE` | drafted | per-chunk admit / discard (context7-shaped) |
| `COURSE_QA` | drafted | ship / revise / regenerate, per section |
| `DASHBOARD_SURFACING` | drafted | surface / fold / suppress + severity |
| `GRAPH_EDGES` | **suspect** | edge type + review flag |

`drafted` means the shape respects the house rules but has not been run over a corpus.
`suspect` means there is a specific reason to expect it to fail — for `GRAPH_EDGES`, that
relationship judgements are relational by construction. Run the validator before relying on either.

## House rules, baked into every set

- Narrow and literal; one judgement per question, no double-barrels.
- Never ask it to count, total, compare magnitudes, or do date arithmetic.
- Decompose, then recombine on the **aggregate** — never on a conjunction of per-question
  confidences, which escalates everything (see the iteration-1 mistake in `../NETER.md`).
- Send only the state the question needs; accuracy falls as irrelevant detail grows.
- Fan out freely. Questions are nearly free; state is the scarce resource.
- Gate on **entropy**, not top probability — it answers garbage confidently.
- Set thresholds from the cost of being wrong in that direction, and no two thresholds closer
  than 0.11 (the measured noise floor).
