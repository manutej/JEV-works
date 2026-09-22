# The evaluation claim as a typed tree (meta-operad, step 1)

Every leads result answers one root question. It is only answerable by composing five narrower ones,
each with a declared answer type. A check whose type does not match the root's claim is an ill-typed
graft: it can pass while the claim is false. Every defect this lab has shipped sat on one of these
edges, and each one was an untyped or wrongly typed check.

```
R  On the leads the claim is about, does the pipeline decide at least as correctly as the regex?
   : (holdout seed, claim scope) → verdict ∈ {jev_better, no_difference, regex_better, REFUSED(edge)}
│
├─ E1  Was the holdout unseen by fitting, at the unit the model reads?        : text-overlap share (per fit seed)
├─ E2  What share of leads got a verdict?                                     : coverage fraction vs declared minimum
├─ E3  Which correctness rule scores it, and was it fixed before the seed existed? : policy + declared-before flag
├─ E4  Is the gap real, tested on each lead's right/wrong, paired?            : exact McNemar p on discordant leads
└─ E5  Does every adequately sized part of the claim's scope agree with the whole? : per-stratum verdicts
```

**Compose rule (R from E1–E5):** the headline direction comes from E4 (p < 0.05 gives a direction,
otherwise `no_difference`). The verdict is that direction only if E1 passes (or leakage was declared
before the run, which narrows the scope to "new records"), E2 meets its declared minimum, E3 is the
rule declared before the seed existed, and E5 has no in-scope stratum that significantly contradicts
the headline. For a claim about new wording, E5 also needs the novel stratum large enough (n ≥ 8) and
agreeing. Any failing edge gives `REFUSED`, naming the edge. It is never silently downgraded.

**Composition witness.** Composing the children gives: *"on text fitting never saw, with enough
coverage, under a rule fixed in advance, by a paired test, and in every part of the scope"*. That is
the root question with its hidden assumptions written out, so the decomposition is legitimate.

## Where each past failure sat (all on witness, interface or verification edges)

| Failure | Edge | Wrong type used | Right type |
|---|---|---|---|
| p6029 passed disjointness with 565/600 messages reused from dev | **E1** interface | record overlap | text overlap with the fit seeds |
| seed-42 eval printed "Jev 100%" at 14.3% coverage | **E2** verification | accuracy on own verdicts | accuracy over all leads + coverage |
| "0.11 band = no difference" applied to an accuracy gap | **E4** verification | one answer's probability jitter (P4) | paired test on per-lead correctness |
| policy v2 chosen after seeing the adversarial gap | **E3** witness | rule chosen after the data | rule fixed before the seed exists |
| headline carried by seen wording; seen/novel confounded with category | **E5** witness | one pooled number | agreement across strata |
| a never-asked question certified JEV-SAFE (NaN spread) | E5 (per-question) | missing value read as a pass | "not asked", no verdict |

## Implementation

- **E1–E5 before a run:** `PREREG.md` (operadic-interview), the question tree every holdout answers
  in its pre-registration commit.
- **E1–E5 after a run:** `claim-gate.ts` (op-consist), which compares the collapsed headline with the
  composed strata and emits `results/consist-report-<seed>.json`: ACCEPT or REFUSE plus failing edges.
- **E1 before any model call:** `splits.ts` + `pipeline.ts` (the leakage gate).
