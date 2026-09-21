# U5: leads pipeline re-run (reported by session b4f08e, branch feat/leads-pipeline)

Received 2026-09-21 via cross-session message. Source of truth: `leads/results/pipeline-7.json`, `eval-7.txt`,
`baseline-7.json` on `feat/leads-pipeline` (4 commits on be1429b: a9325f6 U3, cc19a2e U4, 651db1f gate fix, +1).

**JEV_ID:** `jev-latest (direct)` · **n = 600** (seed 7, generated fresh after the fix; criteria pre-registered in the commit)

| measure | value |
|---|---|
| regex baseline | **92.2%** (seed 7) · 93.2% on fixed seed 42 · the old 91.7% was on the collision-broken corpus |
| (a) verdict rate, pre-registered ≥ 95% | **69.7%** (418/600) → **FAIL** |
| (b) Jev accuracy over ALL leads (escalations count as wrong) | **67.8% vs regex 92.2%, Δ −24.4 pts** |
| Jev accuracy on its own verdicts | 97.4% at 69.7% coverage |
| falsified? | **Yes.** The U5 done-check (≥ 95% reach a verdict) fails for the current question set. |

## What was fixed
- **U3** (a9325f6): unique corpus names; seed 42 → 512 distinct = 572 named − 60 planted dups; byte-identical across 2 runs.
- **U4** (cc19a2e): dedup = same firmographic fingerprint AND message containment; no name-only or domain-only merges. `leads/code-gates.test.ts` 6/6 (Acme×3 stays 3; merges within 5% of 60 planted, each to its true source).
- **Third bug** (651db1f): the stage-1 gate required ALL booleans to be confident-true. `isRealBusiness` was mid-band on 503/540 items → 454 escalated, i.e. every clean in-ICP lead. Seed 42 printed "jev 100% vs regex 93.2%" at **14.3% coverage**. Fix: `isRealBusiness` can reject but not block admission.

## Candidate registry entries (main session is the single writer)
- LESSON: an all-confident-true conjunction at admission repeats README instrument bug #1 (the triage `min(confidence)` gate) in a new place. Default suspicion for any AND-of-confidences gate.
- NETER P18 corroboration: `inboundSubstantive` ("real, specific content…") is mid-band on 72/73 escalated out-of-ICP leads. It's a degree judgement, not a literal question.
- Coverage-vs-accuracy: 97.4% on own verdicts but 67.8% overall. Always report both; a high accuracy at low coverage is not a win (I5).
- Seed 7 is spent. Any further gate or question change needs a fresh seed.
