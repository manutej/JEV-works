> **Stale as of 2026-09-22 (MoE panel):** written before E5 (P33) and the cookbooks (P35) ran; see NETER window 6 for the current picture. Kept as the Q4 record.

# Q4 · Does the cheap baseline win on our tasks? (NETER open window 6)

Built 2026-09-21 from committed result files only. New numbers come from `program/q4-baselines.ts`,
which makes **0 model calls** and writes `program/results/q4-baselines.json`. That file is
byte-identical across reruns.

**How winners are decided.**
- **Accuracy:** an exact McNemar test on per-item correctness, with both systems scored on the same items.
  - b = items only Jev got right; c = items only the baseline got right.
  - The two systems differ only if p < 0.05.
  - A non-answer (escalation) counts as wrong.
- **AUC:** a paired bootstrap over items (2,000 resamples, seeded).
- P4's 0.11 is one answer's probability jitter across identical calls. It does not bound a gap
  between two systems' accuracies, so it is **not** used as a tie band here.
- Where per-item correctness can't be recovered from committed files, the table says so.

## Table

| task | data (n · split · in/out of sample) | cheap baseline (what · score) | Jev (score · coverage) | Δ (Jev − baseline) | paired test | winner | source |
|---|---|---|---|---|---|---|---|
| **leads: `qualified`** | 600 synthetic leads · seed 7, generated after the gate criteria were committed (6159e75) · **out-of-sample** (seed 42 was used for fitting and is not cited) | regex scorer (`leads/baseline.ts`) **92.2%** · majority "false" 50.2% | **67.8%** over all · coverage 69.7% · 97.4% on its own verdicts | **−0.243** | b=6, c=152, **p=1.1e-37** · vs majority: b=235, c=129, p=3e-8 | **baseline** (Jev beats majority) | `leads/results/eval-7.txt`, `pipeline-7.json`, `baseline-7.json`; tests in `program/results/q4-baselines.json` |
| **leads: `segment`** (4-way) | same 600 · seed 7 · out-of-sample | regex **94.0%** · majority "not_qualified" 43.3% | **54.8%** over all · coverage 69.7% · 78.7% on its own verdicts | **−0.392** | b=1, c=236, **p=2.2e-69** · vs majority: b=163, c=94, p=2e-5 | **baseline** (Jev beats majority) | over-all numbers **new** in `q4-baselines.json`; `eval-7.txt` prints only the own-verdict 78.7% |
| leads: injection resistance | 30 planted adversarial rows · seed 7 | regex followed the injected demand on 0/30 | 0/30 followed | 0 | no discordant items | no difference | `leads/results/eval-7.txt` |
| **P6: garbage detection** | 214 items, pre-registered · scored on the test half (55 clean, 49 garbage), fit and test halves disjoint · **out-of-sample** | length (−non-whitespace chars): AUC **0.852** | entropy AUC **0.978** · coverage 100% (214/214) | **+0.126** | paired bootstrap CI **+0.055…+0.204**, 0/2000 resamples ≤ 0 | **Jev** | `program/results/p6-entropy.json`, `P6-REPORT.md`; paired CI **new** in `q4-baselines.json` (`p6Garbage`) |
| **P6: clean-item classification** (toolKind 4-way + docGenre 2-way) | 104 clean items, labels by provenance · baselines fitted on the fit half (49), scored on the test half (55) · **out-of-sample** | **new:** naive Bayes over tokens **92.7%** · majority class 56.4% | **89.1%** on test half (85.6% on all 104) · coverage 100% | −0.036 vs NB · +0.327 vs majority | vs NB: b=3, c=5, **p=0.73** · vs majority: b=21, c=3, p=3e-4 | **no significant difference** vs NB · Jev beats majority | **new:** `q4-baselines.json` (`p6Classification`) |
| └ toolKind | test n=40 | NB 92.5% · majority 57.5% | 92.5% | 0.000 | vs NB: b=3, c=3, p=1.0 · vs majority p=0.003 | no difference vs NB · Jev beats majority | same |
| └ docGenre | test n=15 | NB 93.3% · majority 53.3% | 80.0% | −0.133 | vs NB: b=0, c=2, p=0.50 · vs majority p=0.125 | no significant difference (n=15 can't show one) | same |
| CETI hooks E2 (9-way formula choice) | 80 hooks · one pass, no split · Jev not fitted, keyword rules written before any result · **out-of-sample for both** | keyword rules **31.25%** · majority 26.25% | **33.75%** · coverage 100% (0 errors) | +0.025 vs keyword · +0.075 vs majority | **no paired test possible**: the file keeps Jev's per-item correctness, but not the hook text or the keyword prediction, and the corpus isn't committed | undecided (all three are weak) | `program/results/e2-entropy-agreement.json` |
| CETI hooks E1 (context: 5-model consensus, **not Jev**) | same 80 · one pass | keyword 31.25% | plurality of 5 models 48.75% · unanimous items 73.1% at 32.5% coverage | +0.175 | **no paired test possible** (per-item keyword predictions not in the file) | not a Jev comparison | `program/results/e1-consensus.json` |
| **CETI hooks E3: VOID** | holdout (39) ⊂ fit set (80), ids and texts 39/39 · **in-sample** | keyword *fitted on the same 80*: **89.7%** on the 39 | v2 wording: **74.4%** on the 39 · coverage 100% | −0.154, **in-sample** | b=1, c=7, p=0.070, **in-sample** | **void** (not significant even in-sample) | `git show feat/e3-blind-test:program/results/e3-blind.json` (`holdout.rows`) |
| context triage (keep/drop/escalate) | 119 tool outputs (`triage/items.json`) | none possible | 38 KEEP · 20 DROP · 61 ESCALATE (coverage 48.7%) | — | — | **no labels → no baseline possible** | `triage/triage-result.json`. `triage.ts` says its thresholds are "hand-set; refit on labelled items", and no labelled items exist |
| question bank (DOC_RELEVANCE, COURSE_QA, GRAPH_EDGES) | 18 + 16 + 16 states | none possible | confidence and at-ends rates only | — | — | **no labels → no baseline possible** | `question-bank/VALIDATION.md` |
| masked targets (E5, unrun) | 52 candidate fields across 23 source files in `~/Downloads`, not in the repo | majority-class share is already recorded per target (`majorityShare`, 0.129–0.984) | **no Jev run** | — | — | **can't tell** (labels exist, no Jev result) | `masked/targets.json` |

The in-sample and void rows are labelled as such. No row mixes seeds or rounds across seeds. Recomputing
the leads rows from the committed files reproduces 67.8% / 92.2% / 97.4% / 69.7% exactly. The
`qualified` McNemar result (6 vs 152) matches `leads/evaluate.ts` on `feat/leads-literal-questions`.

## Reading

- **Where the cheap baseline wins: leads, decisively, on both tasks.**
  - `qualified`: Jev is right on only 6 leads where regex is wrong, and regex is right on 152 where Jev is wrong.
  - `segment`: 1 vs 236.
  - Most of the gap is coverage (Jev gives no verdict on 30% of leads). But even on its own
    verdicts, Jev's segment accuracy (78.7%) is below regex's.
  - Caveat: the corpus is synthetic, and the same team wrote the generator and the regex. The regex may
    be matching the generator's own keywords, which can inflate its lead. It does not reverse the result.
- **Where Jev earns its place: detecting garbage input** (P6).
  - Entropy beats the length rule by +0.126 AUC, paired CI +0.055…+0.204.
  - The length rule catches every short piece of garbage but fails on long, plausible garbage
    (wrong-set AUC 0.42). Jev's signal is what catches those.
  - Jev also beats majority-class everywhere the test has enough items to show it. Majority-class is a strawman.
- **No significant difference: classifying clean tool outputs** (P6 labels).
  - A naive Bayes model fitted on 49 items scores 92.7%; Jev scores 89.1% on the same 55 items.
  - The two disagree on only 8 of those items (3 go to Jev, 5 to NB, p=0.73).
  - This is "no detectable difference at n=55", not proof they are equal. An 8-item disagreement
    can't show a gap of a few points.
- **Undecided:** CETI hooks. E2 has no paired test possible, and E3 is void (1 vs 7, p=0.07, in-sample).
- **No labels, so can't tell:** triage and the question bank. Masked targets have labels but no Jev run.
- **Pattern:** Jev clearly beats a cheap baseline only on judging *whether the input makes sense at all*.
  Where a baseline was fitted to the data, or written by the team that planted the labels, Jev loses
  or can't be told apart from it.
- **The one experiment that would decide it:** a small E5 run.
  - Take 2–3 masked targets that have text input columns and low leakage, split fit and test by a hash.
  - On the test half, run McNemar: Jev's `choice` vs the naive Bayes from `q4-baselines.ts`, fitted
    on the fit half.
  - Size it by the disagreements needed, not by accuracy. Here Jev and NB disagreed on about 15% of
    items. To tell a 5-pt gap from zero, about 300 test items is a reasonable start: ~300 calls,
    above the Q4 budget.
  - It would be the first comparison on real labels that nobody on this team planted.
