# U6 — What does version drift cost? (NETER window 5)

`program/drift.ts` sends the same states and the same questions to Jev three times per state over
the direct API:

| arm | requested id | purpose |
|---|---|---|
| pinned A | `jev-1.13.0` | reference |
| latest | `jev-latest` | the unpinned alias whose drift we're pricing |
| pinned B | `jev-1.13.0` | run-to-run noise floor (A/A), to test P4's ~0.11 band |

The three calls for each state run back to back in shuffled order, so a load spike can't pass for
a version difference. Every call records `answeredBy()`, because `jev-latest` resolves on the
server.

**Corpus:** 50 real states from the existing banks: DOC_RELEVANCE (18), COURSE_QA (16) and
GRAPH_EDGES (16). That's 10 questions: 7 boolean, 2 score and 1 choice. GRAPH_EDGES is in only
because it's the one choice set with a corpus. Without it, a choice flip rate couldn't be
measured.

**|Δp|:** for booleans it's |Δprobability|. For choice and score it's the largest per-option
change across the returned distribution (L∞). A **flip** is a boolean that crosses 0.5, a choice
that changes its pick, or a score whose most likely level (argmax) changes. `score` itself is the
expected level (e.g. 1.16), so it's reported as `meanScoreDelta` and doesn't count toward flips.

**Rule (hand-set, not fitted):** a question has MOVED if either condition holds:

- its pinned-vs-latest p95 |Δp| is ≥ 0.11 **and** above its own pinned-vs-pinned p95
- latest flips ≥ 3 more answers than pinned-vs-pinned

If no question moves, the verdict is `no drift`.

## Run it

```sh
cd /Users/manu/JEV-works && source ~/.zshrc >/dev/null 2>&1
/opt/homebrew/bin/node program/drift.ts        # Node 25; ~6 s, 150 calls, ≈$0.004
```

- **Output:** it writes `program/results/drift-<YYYY-MM-DD>.json` and streams to
  `runs/drift.jsonl` through `RunLog`.
- **Rate limit:** concurrency is capped at 4. Calls that fail with 429 or 5xx are retried with
  exponential backoff, at most 5 retries.
- **Weekly rerun:** before writing, the script reads the newest earlier `drift-*.json` and records
  `sincePrevious`, which holds:
  - whether the resolved version of `jev-latest` changed
  - the previous verdict
  - per-state |Δp| between then-latest and now-latest (the week-over-week drift)
  - the same diff for then-pinned vs now-pinned (the control)

  A rerun on the same day diffs against the file it's about to overwrite.

## What it measured — 2026-09-21

All numbers come from `results/drift-2026-09-21.json`: 150/150 calls, 0 failures, 0 retries.

**`jev-latest` currently *is* `jev-1.13.0`.** All 50 latest calls and all 100 pinned calls
reported `jev-1.13.0`. So today's pinned-vs-latest comparison is itself an A/A test, and no drift
is possible by construction. The run doesn't price a version change yet. It sets the noise
baseline and tests the rule against a known null.

| n = 170 answers | median \|Δp\| | p95 \|Δp\| | max \|Δp\| | flips |
|---|---|---|---|---|
| pinned vs pinned (noise) | 0.010 | 0.040 | 0.150 | 2 (1.2%) |
| pinned vs latest | 0.010 | 0.040 | 0.150 | 4 (2.4%) |
| latest, run 1 vs run 2 (`sincePrevious`) | 0.010 | 0.050 | 0.120 | 6 (3.5%) |

- **Verdict: no drift.** No question moved.
- **Choice flip rate** (GRAPH_EDGES.relationship, n=16) is 0.125 both for pinned vs pinned and
  for pinned vs latest.
- **Latency p50 / p95**, for comparison with P10's direct figure of 131 / 276 ms:
  - pinned A: 120 / 240 ms
  - latest: 115 / 258 ms
  - pinned B: 115 / 292 ms

**Per-question noise floor.** On booleans and scores the probabilities are much tighter than
P4's 0.11:

- pinned-vs-pinned p95 ≤ 0.05 and max ≤ 0.07 on every one of the 9 non-choice questions (run 2;
  run 1 reached p95 0.066 on isRunnableExample)
- the choice question is wider: GRAPH_EDGES.relationship reached p95 0.135 and max 0.15 between
  two identical pinned calls

So the 0.11 band from P4, measured on one state, is too loose for booleans and slightly too
tight for a 5-way choice with a flat distribution.

**Argmax is not perfectly stable.** P4 saw 20/20 identical picks on one state. Here, identical
pinned calls changed the pick on 2 of 16 GRAPH_EDGES states. Every flip in either comparison, 6
in total, happened on an answer whose original margin was ≤ 0.04: a boolean within 0.04 of 0.5,
or a choice whose top two options were within 0.04. No confident answer flipped.

**The rule was calibrated on this A/A null, and that's disclosed here.** The first run of the day
used a stricter rule: any single flip more than pinned-vs-pinned counted as a move. It returned
`drift detected` on `isRunnableExample`, with 1 latest flip against 0 noise flips, on a
comparison where the two models were identical. That's a false positive. The first run's numbers:

- noise p95 0.060, max 0.110
- latest p95 0.050, max 0.130

Its JSON was overwritten by run 2, and its verdict survives as `sincePrevious.previousVerdict`.
Two changes followed, and they're the only thresholds tuned after seeing data:

- the flip rule now needs an excess of ≥ 3 flips
- score flips are now read from the argmax level instead of the expected-value scalar, which had
  counted 12/18 "flips" on unchanged distributions

## Cost of drift, as far as it can be priced today

It can't be priced yet, because the alias hasn't moved. Two things are established:

- **The detection cost is tiny.** 150 calls cost $0.004 and take 6 s, so a weekly run is
  essentially free.
- **The detector has a known null.** On a true A/A comparison at n=16–18 per question, noise
  produces up to 2 flips and |Δp| up to 0.15 on a choice question. Any future "drift" smaller
  than that is indistinguishable from resampling.

The first week in which `sincePrevious.latestResolvedToChanged` is `true` is the first real
measurement.

## Registry proposal

Proposed NETER text. It replaces window 5 in §5 and adds a ledger note. The orchestrator writes it.

```
5. **What does version drift cost?** Instrumented, not yet answered: `program/drift.ts` (weekly, ~$0.004).
   2026-09-21: `jev-latest` resolves to `jev-1.13.0` (50/50 calls), so pinned-vs-latest is an A/A test —
   no drift; A/A noise p95 |Δp| 0.04, max 0.15 (choice), booleans/scores ≤ 0.07. Answered the first week
   `latestResolvedToChanged` is true.
```

Proposed amendment to P4, for the orchestrator to decide on:

```
P4 addendum (n=50 states, A/A, 2026-09-21): the 0.11 band is question-shaped — booleans/scores p95 ≤ 0.07 over two runs,
a flat 5-way choice reaches 0.15. Argmax flipped on 2/16 choice states, but only where the top-2 margin was
≤ 0.04; no confident answer flipped.
```
