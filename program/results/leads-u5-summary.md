# U5: leads pipeline re-run (reported by session b4f08e, branch feat/leads-pipeline)

Received 2026-09-21 via cross-session message. Source of truth: `leads/results/pipeline-7.json`, `eval-7.txt`,
`baseline-7.json`, merged to **main @ 0cefc2d** (U3 231484d, U4 f0ca67b, gate fix + pre-registration **6159e75**, seed-7 run d105cc0, resolvedModel 7fbfbc4, whole-word dedup 22adbbc, all-leads headline c2bc002). Pre-rebase hashes (a9325f6, cc19a2e, 651db1f) no longer exist on main.

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
- **Third bug** (6159e75): the stage-1 gate required ALL booleans to be confident-true. `isRealBusiness` was mid-band on 503/540 items → 454 escalated, i.e. every clean in-ICP lead. Seed 42 printed "jev 100% vs regex 93.2%" at **14.3% coverage**. Fix: `isRealBusiness` can reject but not block admission. On the **same seed-7 corpus**, the old gate gave **19.3%** coverage and the new gate **69.7%**. (Do not compare seed 42's 14.3% with seed 7's 69.7%: different corpora.)
- **Fourth bug** (22adbbc, found by an independent review before merge): dedup used raw substring containment ("hi" ⊂ "this"), merging distinct people at one company. Now whole-word containment with ≥ 8 words; tests 11/11 (3 new regressions fail on the old code). The seed-7 duplicate mapping is unchanged, so the seed-7 result still describes main.
- **`results/pipeline-42.json` is the PRE-gate run** (byte-identical to `*.before-gate.json`). Seed 42 was used to choose the gate, so it is not a result. Never cite it as the current pipeline.

## Candidate registry entries (main session is the single writer)
- LESSON: an all-confident-true conjunction at admission repeats README instrument bug #1 (the triage `min(confidence)` gate) in a new place. Default suspicion for any AND-of-confidences gate.
- NETER P18 corroboration: `inboundSubstantive` ("real, specific content…") is mid-band on 72/73 escalated out-of-ICP leads. It's a degree judgement, not a literal question.
- Coverage-vs-accuracy: 97.4% on own verdicts but 67.8% overall. Always report both; a high accuracy at low coverage is not a win (I5).
- Seed 7 is spent. Any further gate or question change needs a fresh seed.
