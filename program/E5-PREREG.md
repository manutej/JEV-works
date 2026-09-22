# E5 pre-registration: masked targets, Jev vs naive Bayes

Written and committed **before any Jev call**. Approved by Manu on 2026-09-22 ("go ahead with E5").
Branch `feat/e5-masked`. One run per target, and no stop rules. If something breaks, it gets fixed and
the fix is disclosed. Nothing is re-run to improve a number.

## Targets (fixed by the orchestrator)

| target | field hidden | Jev state (all Jev sees) | source |
|---|---|---|---|
| `hotpot` | `type` (bridge / comparison) | `{question}` only. No `answer`, `supporting_facts` or `context` | HotpotQA dev-distractor sample, 822 rows (first path in `masked/targets.json`) |
| `housing` | `furnishingstatus` (furnished / semi-furnished / unfurnished) | the other 12 columns, raw values | `/Users/manu/Downloads/Housing.csv`, 545 rows |
| `faf` | `trade_type` (1 / 2 / 3) | the other 10 columns, **codes decoded** via `FAF6_Metadata.xlsx` (states, foreign regions, modes, SCTG2 commodities; units from the dictionary) | `FAF6.0_State.csv`, 599,529 rows → 600 sampled |

Code: `program/e5-data.ts` handles data, splits, the privacy scan and NB. `program/e5-questions.ts` holds the Jev questions.

## Splits (seed 20260922)

- Split key: HotpotQA `_id`, or the 0-based data-row index for the CSVs. `sha256("e5:20260922:split:<target>:<key>")`,
  top 32 bits / 2³² < 0.5 → FIT, else TEST.
- TEST is capped at 300 by keeping the 300 test items with the smallest `sha256("e5:20260922:cap:<target>:<id>")`. The rest are never scored.
- FAF sampling: the 600 data rows with the smallest `sha256("e5:20260922:sample:faf:<row index>")`, read in two
  streaming passes (the file is never loaded as one string).
- Printed by `node program/e5-data.ts` before the run:

| target | fit | test (scored) | over cap, unscored | id overlap fit∩test | identical-state overlap |
|---|---|---|---|---|---|
| hotpot | 405 (bridge 334, comparison 71) | 300 | 117 | **0** | 0 |
| housing | 263 (furnished 68, semi 103, unfurnished 92) | 282 | 0 | **0** | 0 |
| faf | 314 (1: 80, 2: 129, 3: 105) | 286 | 0 | **0** | 0 |

Total Jev calls planned: 868 (budget ≤ 950 including retries). Only the TEST half is sent to Jev.

## Privacy scan (done before any call)

Every state (fit and test) is scanned for emails, phone-like patterns (formatted NANP, `+` international,
runs of ≥10 digits) and credential-like strings (`sk-/pk-` keys, AWS keys, `password=`/`token:`, and opaque
runs of ≥40 chars). A hit halts that target. Result: **0 hits in 822 + 545 + 600 states.** The run re-scans
and refuses to call Jev for a target that has any hit. The only files read are these three public files and the
FAF data dictionary. No other file from `masked/targets.json` is opened.

## Jev questions (verbatim; `program/e5-questions.ts`)

A single `choice` question per target. The descriptions come from the field's meaning and the FIT half only.

**hotpot.** *"HotpotQA labels each multi-hop question by the kind of reasoning it needs. Which type is this question?"*
- `bridge`: Bridge: first find an entity the question only describes, then answer a fact about that entity.
- `comparison`: Comparison: the question names two entities and compares them on one property, or asks whether both share it.

**housing.** *"This row describes one house for sale: price, area, rooms, floors, parking, and yes/no amenities. What is its furnishing status?"*
- `furnished`: Furnished: the house comes with its furniture.
- `semi_furnished`: Semi-furnished: the house comes with some furniture or fittings, not a full set.
- `unfurnished`: Unfurnished: the house comes without furniture.

**faf.** *"This row is one 2022 US freight flow from the Freight Analysis Framework, codes decoded. What type of trade is it?"*
- `domestic` (→ 1): Domestic: moved from a US origin to a US destination.
- `import` (→ 2): Import: moved from a foreign origin to a US destination.
- `export` (→ 3): Export: moved from a US origin to a foreign destination.

The FAF descriptions paraphrase the dictionary's own "Trade Type" sheet.

## Baselines (fit on FIT, scored on TEST)

- **Naive Bayes.** Multinomial, Laplace α = 1, ties go to the first class in sorted order (mirrors `program/q4-baselines.ts`).
  - hotpot: word and punctuation tokens of `question`, using the q4 tokenizer.
  - housing and faf: `col=value` tokens over the raw columns. Declared quantity columns are binned into
    four bins by FIT-half quartiles: housing `price`, `area`, and faf `tons_2022`, `value_2022`. Housing
    `bedrooms`, `bathrooms`, `stories` and `parking` have ≤ 10 distinct values, so they stay categorical, as do
    all FAF codes. An empty cell is the token `col=`.
- **Majority class** of the FIT half: hotpot `bridge`, housing `semi-furnished`, faf `2`.

## Test of record

- Per-item correctness on TEST. A Jev non-answer (error, budget exhausted, or an option outside the set) counts as **wrong**.
  Coverage is reported beside accuracy.
- **Exact McNemar**, Jev vs NB, two-sided. b = Jev right and NB wrong, c = NB right and Jev wrong. The two differ
  iff p < 0.05. b, c and p are reported. Jev vs majority is reported the same way.
- **Paired bootstrap 95% CI** for Δ = acc(Jev) − acc(NB). 2000 resamples, mulberry32 seed 4 (as in q4).
- The 0.11 band is **not** used for any accuracy gap (META-PLAN I6). P4 applies only to per-answer jitter.

## Predictions (written before the run)

| target | prediction | falsified iff |
|---|---|---|
| hotpot | **Jev ≥ NB** | McNemar p < 0.05 with c > b (NB significantly better) |
| housing | **NB ≥ Jev**, and neither system beats majority significantly | McNemar Jev-vs-NB p < 0.05 with b > c; *secondary:* either system beats majority with p < 0.05 |
| faf | **Both ≥ 0.95 accuracy, no significant difference** | either accuracy < 0.95, or McNemar p < 0.05 |

## Known properties of the targets, disclosed before the run

- **FAF `trade_type` is structurally leaked.** Across all 599,529 rows, trade_type = 1 ⇔ `fr_orig` and
  `fr_dest` are both empty, 2 ⇔ `fr_orig` (and `fr_inmode`) are set, and 3 ⇔ `fr_dest` (and `fr_outmode`) are set.
  This was counted with python over the full file before the prereg. Both systems see those columns. For NB they
  are the tokens `fr_orig=` and `fr_orig=80x`. Jev sees them decoded as `foreign_origin_region: none / Europe …`.
  The target is kept as the orchestrator fixed it, so on FAF this experiment measures whether Jev reads a
  decoded record correctly, not whether it infers a hidden category. Jev does get meaningful text: every
  code is decoded to names from the dictionary.
- **HotpotQA labels are noisy.** The FIT half contains "Who is older, Annie Morton or Terry Richardson?" labelled
  `bridge`. The labels are scored as given.
- **Housing** has no text. It is 12 numeric or yes/no fields, and furnishing status is plausibly weakly determined by them.
