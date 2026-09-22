# Standard kit gates

Every experiment, question module and demo goes through the **same named gates** (defined in `kit/standard-gate.ts`), so
"G3 REFUSE" means the same thing in leads, E5 and a cookbook. Every gate returns one contract:

```ts
{ id: 'G1-spec-valid' | … | 'G10-tree-consistent', stage: 'preflight' | 'run' | 'claim',
  verdict: 'PASS' | 'REFUSE' | 'WARN' | 'SKIP', why: string, evidence: {…} }
```

**Suite rule:** any REFUSE refuses the claim. A WARN never refuses but is always printed. A SKIP must say why. An unknown id is an error.

| id | stage | refuses when | owner | encodes |
|---|---|---|---|---|
| **G1-spec-valid** | preflight | the spec breaks the TypeSafe-docs schema, or labels don't fit their question types | core | kit/spec.ts |
| **G2-privacy** | preflight | an email, phone, key or token is in a state bound for the API (disabled scan = WARN) | core | external-API rule |
| **G3-text-disjoint** | preflight | test items overlap fit items by id **or normalised text** (accepted before the run = WARN) | core | L31, L40 |
| **G4-coverage** | run | answered share < the minimum declared before the run (undeclared = WARN) | core | retro §9.2 |
| **G5-policy-predeclared** | claim | the scoring policy was chosen after the holdout existed | kit/gate | L38 |
| **G6-paired-test** | claim | the headline isn't an exact paired test with n ≥ 8 | kit/gate | I6, I3 |
| **G7-strata-consistent** | claim | a judgeable stratum contradicts the pooled headline | kit/gate | L41 |
| **G8-threshold-fitted-and-held** | claim | a threshold is hand-set, or its promised error bound broke on held-out data (unstable cut = WARN) | core | kit/threshold.ts |
| **G9-calibration-audited** | claim | a cost threshold relies on probabilities an audited evaluator doesn't call calibrated (n < 100 counts as not calibrated) | core | L42 |
| **G10-tree-consistent** | claim | the question tree disagrees with its own partial collapses (no tree = SKIP) | core | P34, L43 |

`kit/run.ts` runs G1–G4 on every spec and writes the suite into the result file (`gates`). Claim gates G5–G7 come from
`kit/gate/claim.ts`; G8–G10 are called by whatever fits thresholds, judges calibration, or runs a tree. Adding a gate
means adding it to `CATALOGUE` first. Exit codes are unchanged: 65 (G1), 3 (G2), 4 (G3), 2 (G4).
