# leads/ — a three-stage Jev lead pipeline, built to be measured, not trusted

**Read this before reading any number this pipeline produces.**

## Current status (2026-09-21) — see `HANDOFF.md` for the full record

- Both diagnosed bugs are fixed (unique corpus names; dedup never merges on name alone), plus a
  third found behind them: stage 1 needed every boolean confident-true and left 86% of leads without a verdict.
- **Current code, valid measurements (scoring v2, jev-1.13.0), see `HANDOFF.md` §00:**
  base seed **6011**: Jev 90.3% vs regex 92.0%, no significant difference (p = 0.245), coverage 97.7%.
  Paraphrase seed **p6029** (a stress test built against the regex): Jev 78.3% vs regex 72.0%,
  **Jev significantly better** (p = 2.5e-4), coverage 93.0% (fails ≥ 95%). Its non-buyer wording
  was also in the dev seed, so it tests new records, not new wording.
- Seed 2718 measured the previous stage-2 rule (Jev 88.5% vs regex 91.0%, v1, p = 0.105).
- Earlier holdout: seed 7 measured the previous question set (Jev 67.8% vs regex 92.2%, 69.7%
  coverage, fail). **Seed 42 is the dev set**: `results/pipeline-42.json` is a dev run of the
  current code and is not evidence; `pipeline-42.prev.json` / `.before-gate.json` are the pre-gate run.
- **Dedup's known limit:** it matches how this corpus plants duplicates (identical firmographics,
  message verbatim or prefixed). Real resubmissions with an edited message, a re-scraped blurb,
  or an updated band are missed; recall on real data is unmeasured. The 60/60 match on seeds 42
  and 7 checks the generator against itself as much as it checks dedup.

The corpus in `corpus/` is **synthetic, with planted labels**. It was written to
exercise specific failure modes documented in `../NETER.md` (empty/garbage
inputs, prompt injection, near-duplicate records, genuinely ambiguous
segments) in known proportions. Every result this pipeline produces answers
**"do these questions discriminate the way they were designed to?"** — not
**"does this work on real leads."** Those are different questions with
different evidence bars. A real scrape, CRM export, or inbox parser can be
swapped in by producing the same `Lead[]` shape from `types.ts`; nothing else
in `pipeline.ts`, `baseline.ts`, or `evaluate.ts` needs to change. Whether the
*questions* still discriminate on real data is a new measurement, not an
inference from this one.

## Files

| file | what it does | makes model calls? |
|---|---|---|
| `types.ts` | `Lead`, `PlantedTruth` (kept separate, never seen by the pipeline), `ALL_SEGMENTS`, `ALL_ACTIONS` | no |
| `generate-corpus.ts` | synthesizes leads + planted truth, seeded and deterministic | no |
| `questions.ts` | the three Jev question sets (`STAGE1_ACQUISITION`, `STAGE2_QUALIFICATION`, `STAGE3_SALES`) + each set's `notForJev` list | no |
| `code-gates.ts` | dedup, exclusion list, territory lookup, token counting, score→rank sorting | no |
| `pipeline.ts` | runs stage 1 → 2 → 3 against Jev, one batched call per lead per stage | **yes** |
| `baseline.ts` | a keyword/regex qualifier — the cheap opponent Jev has to beat | no |
| `evaluate.ts` | scores `pipeline.ts` against planted truth and against `baseline.ts` | no (reads their JSON output; one non-evaluate HTTP call to the Gateway model catalog for live pricing) |

## Run it, in order

```bash
cd /Users/manu/JEV-works/leads

# 1. Generate the corpus (deterministic — same seed always gives the same corpus).
node generate-corpus.ts --n 600 --seed 42

# 2. Run the honest baseline first (NETER.md: "always beat a cheap baseline
#    first"). No API key needed.
node baseline.ts --seed 42

# 3. Run the pipeline against Jev. Needs auth — see .env.local below.
node --env-file-if-exists=/Users/manu/jev-playground/.env.local pipeline.ts --seed 42 --concurrency 8

# 4. Score everything.
node --env-file-if-exists=/Users/manu/jev-playground/.env.local evaluate.ts --seed 42
```

Only `pipeline.ts` needs the `--env-file-if-exists` auth flag for the actual
Jev calls. `evaluate.ts` only needs it because it makes one plain HTTP call
to the Vercel AI Gateway's model catalog for live pricing (`livePricing()` in
the shared harness) — if that fails or is omitted, it prints the token totals
without a dollar figure and continues.

Type-check everything with:

```bash
cd /Users/manu/JEV-works && npx tsc --noEmit
```

## What each stage does, and what it deliberately doesn't ask

Every question in `questions.ts` is answerable from **one** `Lead` record,
literally — no question compares two leads, checks a list, or asks for a
count (`NETER.md` P18, P21). Each question set carries a `notForJev` array
naming the judgement that was deliberately left out and the deterministic
check in `code-gates.ts` that replaces it — near-duplicate detection,
exclusion-list matching, territory lookup, and ranking are all there, and
none of them are questions.

Gating is on **distribution entropy**, not top probability (P5/P6): a lead
whose stage-1 booleans sit in the mid band is escalated, not silently forced
through on a coin-flip. Thresholds are spaced at least 0.7 apart (P4 says
0.11 is the noise floor; this pipeline uses far more margin than that).

A lead that fails stage 1's gate never reaches stage 2, and a lead stage 2
doesn't qualify never reaches stage 3 — both are recorded as savings in
`pipeline.ts`'s output, alongside leads that never reach *any* model call
because a code gate (duplicate, exclusion list) caught them first.

## What `evaluate.ts` reports

Per-question confidence/spread/verdict (same algorithm as
`../question-bank/measure-confidence.ts`), segment accuracy and per-segment
recall against a majority-class baseline, an abstention check (entropy on
garbage vs. clean inputs), an injection check (did the adversarial rows'
embedded instructions actually change the output), a threshold sweep on the
auto-qualify gate, calibration (reliability table, ECE, Brier) on the
qualified boolean, cost/throughput per stage, and a full baseline comparison
— including a head-to-head specifically on the ambiguous subset, where
neither system is expected to look great by design.

## Regenerating with a different corpus

`--seed` controls everything. A different seed gives a different corpus with
the same *proportions* (see `PROPORTIONS` in `generate-corpus.ts`) but
different content — useful for checking whether a conclusion is about the
questions or about one unlucky draw of synthetic text. `--n` scales the
corpus size; proportions round to the nearest lead and any rounding drift is
absorbed into the `clean_in_icp` bucket so the total is always exactly `--n`.
