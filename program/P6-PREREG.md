# P6 · Pre-registration — does entropy separate garbage from clean input at n≈200?

Written 2026-09-21 **before any Jev call** for this experiment. Not edited after the run; any
defect in what follows is recorded in `P6-REPORT.md` as a finding, not fixed here.

## Claim under test (NETER P6, as registered)

> Distribution entropy is the usable uncertainty signal. Normalised entropy separated garbage
> (0.30–0.61) from unambiguous input (0.00–0.05) with a ~6× margin, where top-probability did not.
> — n=10 cases, one 3-way routing question (`jev-playground/experiments/exec-adversarial.ts`).

## Hypothesis

On a held-out half of ~200 items, the normalised entropy of a **choice** answer ranks
"garbage / no right answer" inputs above "clean / unambiguous" inputs, well enough to gate on, and
better than top-probability does.

## Questions (both from `question-bank/bank.ts`)

Entropy is only defined on a choice. Booleans are excluded: for a two-way distribution, entropy
is a monotone function of |p − 0.5|, so it would tie top-probability by construction.

`ROUTING.destination` and `GRAPH_EDGES.relationship` are **excluded**. Each has a catch-all option
(`other`, `unrelated`), so empty or off-topic input *has* a correct answer under them and cannot be a
"no right answer" item. `CLASSIFICATION` is the only bank template with no catch-all. Its abstain
gate is a separate boolean, `onTopic`. It is instantiated twice, with different labels over
different corpora, so that a result is not one question's quirk:

| id | bank set | question | options | clean corpus |
|---|---|---|---|---|
| `toolKind` | CLASSIFICATION.label | which kind of tool result is this | shell_output · file_contents · file_changed · message_receipt | `triage/items2.json`, labelled by its existing `tool` field |
| `docGenre` | CLASSIFICATION.label | which kind of written material is this | library_docs · research_note | `question-bank/doc-relevance-states.json` (chunks) → library_docs; `question-bank/course-qa-states.json` → research_note |

Each call also asks `CLASSIFICATION.onTopic` (boolean, same call, no extra cost). Its reading is a
**secondary** comparator: it is the bank's own recommended abstain gate.

## Corpus (`program/p6-corpus.json`, built by `program/p6-build-corpus.ts`, seed 20260921)

**Clean (target ≥100).** An item is clean only if its correct option follows from an existing
label: the `tool` field for tool outputs, and the source file for documents. The rules are
deterministic and fixed here:
- `toolKind`: Bash→shell_output, Read→file_contents, Write/Edit→file_changed,
  SendMessage→message_receipt. Excluded: `hadSecret` items, outputs with <40 non-whitespace chars
  (too short to carry a determinable answer), and Agent outputs (their text asks not to be quoted).
  Caps are taken in file order, to stop near-templated confirmations from dominating the class:
  shell_output ≤40, file_changed ≤12, message_receipt ≤8, file_contents all.
- `docGenre`: every doc-relevance chunk → library_docs. Every course-qa text → research_note,
  **except** any course-qa text that shares an exact 60-character substring with a doc-relevance
  chunk. Those are doc-derived, so their provenance is ambiguous.
- Every state is truncated to 4,000 characters, well under the P3 ceiling.

**Garbage (target ≥100): 55 per question, seeded, labelled by construction.** For each question:

| kind | n | construction |
|---|---|---|
| empty | 1 | `""` |
| whitespace | 3 | spaces, tabs and newlines |
| emoji | 8 | 1–3 emoji |
| fragment | 8 | 2–8 characters cut from a corpus text |
| foreign-noise | 8 | random characters from CJK, Cyrillic, Arabic and Devanagari, grouped like words (not sentences) |
| lorem | 8 | 1–4 lorem-ipsum sentences |
| off-topic | 10 | templated sentences about cooking, weather, gardening and sport |
| wrong-set | 9 | a real state from the *other* question's corpus. Prose goes to `toolKind`. Tool outputs go to `docGenre`, and only those that match none of `/jev\|sdk\|\bai\b\|model\|embed\|tool\|api/i`. |

## Split (L31)

The split key is the SHA-256 of the state text: first 8 hex digits, parity. Even → **fit**,
odd → **test**. Because the key is the text, the same text always lands in the same half, even when
it appears under both questions (a tool output is clean for `toolKind` and wrong-set garbage for
`docGenre`). Before any call, the script prints the overlap count between fit and test, by text hash
and by item id. **Both counts must be 0, or the run aborts.** It also prints n per class per half.
If any class/half has n < 40, the run is reported as `INSUFFICIENT-DATA` for that cell.

Anything that sets a threshold (entropy cut, top-p cut, length cut) is fit **only on the fit half**.
The test half is scored **once**.

## Metrics (all on the test half)

- **Primary:** AUC of normalised entropy (`colors.ts` `entropy()`) as a predictor of `garbage`.
- **Comparison:** AUC of `1 − topProbability` for the same prediction.
- **Baseline (ground rule 1, I5):** AUC of `−(non-whitespace character count)`, i.e. "short input is
  garbage". If this matches entropy, that is the result.
- **Secondary:** AUC of `1 − p(onTopic)`.
- **Margin:** p5(entropy | garbage) − p95(entropy | clean). Positive means the tails do not overlap,
  which is the claim as worded ("0.30–0.61 vs 0.00–0.05"). Also reported: median(garbage) /
  median(clean).
- **Gate:** the threshold is chosen on the fit half by Youden's J (max TPR − FPR). On test, report
  garbage caught (TPR), clean wrongly flagged (FPR) and balanced accuracy. This is done for
  entropy, top-p and length alike.
- **CIs:** 95% bootstrap on each test AUC (2,000 resamples, stratified by class, seeded), plus the
  bootstrap CI of the paired difference AUC(entropy) − AUC(top-p).
- **Descriptive only:** per question, per garbage kind, Jev's accuracy on clean items, and AUC
  restricted to clean items Jev answered correctly.

## Falsifier (fixed now)

P6 is **falsified** if either holds on the test half:
- **F1:** AUC(entropy) < 0.85, i.e. not usable as a gate.
- **F2:** AUC(entropy) − AUC(top-p) < 0.05, i.e. not better than top-probability, which is the
  distinctive half of the claim.

These are recorded as flags, not falsifiers of P6 itself:
- **I5:** AUC(length baseline) ≥ AUC(entropy) − 0.05. Entropy would then add nothing over a length
  check on this garbage mix.
- **Wording:** margin ≤ 0 means the registered ranges ("0.30–0.61 vs 0.00–0.05") do not replicate
  as disjoint ranges, even if AUC is high.
- Per ground rule 6, the entropy/top-p difference is reported alongside the P4 noise floor (0.11).
  A difference below 0.11 is not treated as evidence of a *large* advantage.

## Budget and hygiene

- One call per item (~220 calls). Budget < 600 including retries.
- Concurrency 4. `maxRetries: 0` in the SDK. Our own backoff retries 429/5xx/timeouts, up to 5
  attempts. Every attempt counts toward the budget.
- Model is `JEV` from `lib/jev.ts` (direct, pinned `jev-1.13.0`). Results record `JEV_ID` and the
  per-call `answeredBy()`.
