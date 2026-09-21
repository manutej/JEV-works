# P6 · Report — entropy vs garbage at n=214

Pre-registration: `program/P6-PREREG.md` (written before any call, not edited since).
Results: `program/results/p6-entropy.json`. Corpus: `program/p6-corpus.json`, built by
`program/p6-build-corpus.ts` (seed 20260921, byte-identical on rebuild).
Model: `jev-1.13.0 (direct)`, answeredBy `jev-1.13.0` on all 214 calls. 0 errors, 0 retries.
Calls: 214 for the run plus 2 for a shape smoke test, **216 in total**.

## Verdict

**P6 as registered is falsified on F2. Entropy is a good garbage signal, but top-probability is
nearly as good.** The registered claim has two halves. "Entropy separates garbage" holds: test AUC
0.978. "Where top-probability did not" does not hold: top-p's AUC is 0.952, and the gap (0.026) is
below the pre-registered 0.05 and below P4's 0.11 noise floor. The gap is consistently positive,
though: its bootstrap CI is [0.007, 0.049].

What P5/P6 got right, measured properly: a **conventional** top-p gate does not protect you.
Garbage still gets top-p around 0.85 (medians: emoji 0.84, off-topic 0.85, wrong-set 0.92). Top-p
separates only because clean input sits at ~1.00, so the working cut is near 0.96, not 0.8.

## Numbers (test half: 55 clean, 49 garbage; disjointness overlap 0 by text hash and by id)

| signal | test AUC | 95% CI | fit-half gate | test: garbage caught | test: clean flagged |
|---|---|---|---|---|---|
| **entropy** (`colors.ts` `entropy()`) | **0.978** | 0.953–0.996 | H ≥ 0.143 | 95.9% | 18.2% |
| 1 − top-probability | 0.952 | 0.913–0.984 | top-p ≤ 0.96 | 93.9% | 23.6% |
| length baseline (−non-ws chars) | 0.852 | 0.775–0.918 | ≤ 269 chars | 85.7% | 40.0% |
| 1 − p(onTopic) (bank's abstain gate) | 0.901 | — | onTopic ≤ 0.52 | 79.6% | 7.3% |

- **Delta:** entropy − top-p = +0.026 (CI 0.007–0.049). Entropy − baseline = +0.126.
- **I5 flag:** not raised. The length baseline is 0.126 AUC behind, well outside the 0.05 band. It
  catches every short garbage kind (whitespace, emoji, fragments, foreign noise: AUC 1.00), but it
  fails on long garbage (wrong-set 0.42, lorem 0.82).
- **Wording flag:** raised. The ranges are **not disjoint**: garbage p5 = 0.226 < clean p95 = 0.269,
  a margin of −0.043. Garbage spans 0.11–1.00. Clean spans 0.00–0.54, median 0.00. The registered
  "0.30–0.61 vs 0.00–0.05, ~6× margin" came from 10 hand-picked cases and does not survive as ranges.

**Descriptive, not pre-registered** (test half):
- Top-p < 0.8 (a conventional cut) catches 59.2% of garbage and flags 3.6% of clean. Top-p < 0.9
  catches 79.6% and flags 7.3%.
- H ≥ 0.30 (the registered lower bound) catches 83.7% of garbage and flags 3.6% of clean. At equal
  clean cost, it catches 24 points more garbage than top-p < 0.8. This is where entropy's practical
  edge shows.
- The fit-half gate (H ≥ 0.143) flags 10 clean items, 9 of them `shell_output`. Heterogeneous shell
  text is the genuinely hard clean class, not a labelling error.
- On the 2-option question (`docGenre`), entropy and top-p have **identical** AUC (0.9936). With two
  options, entropy is a monotone function of top-p. Every bit of entropy's advantage comes from the
  4-option question (`toolKind`: 0.969 vs 0.953). Expect the advantage to grow with option count,
  and to be exactly zero for booleans.
- Per question (test cells < 40, so INSUFFICIENT-DATA by the prereg rule; indicative only):
  toolKind entropy 0.969 / top-p 0.953 / length 0.863. docGenre 0.994 / 0.994 / 0.905.
- The hardest garbage kinds for every signal: **wrong-set** (a real state sent to the wrong
  question: entropy AUC 0.92, median H 0.34, top-p median 0.92) and **off-topic** prose (0.97,
  median H 0.40). The three garbage items with top-p ≥ 0.96 are two wrong-set items and one
  off-topic item. Garbage that *looks like* the domain is the case entropy handles worst, and
  garbage is only this easy when it is visibly junk.
- Jev's accuracy on clean items: 85.6% (89/104). Errors: shell_output→file_contents 7,
  research_note→library_docs 5, library_docs→research_note 2, file_contents→shell_output 1. With
  misanswered clean items removed, test AUC is entropy 0.983 / top-p 0.965. The result does not
  depend on them.
- Exploratory: TypeSafe's own `providerMetadata.typesafe.confidence` gives test AUC 0.958, about the
  same as top-p.

## Assumptions and limits

1. **The garbage mix is a choice, and AUC depends on it.** 20 of 55 garbage items per question are
   short (empty, whitespace, emoji, fragment), which flatters the length baseline. 19 are long
   and plausible (10 off-topic, 9 wrong-set). A corpus weighted toward wrong-set garbage would pull every
   signal down; entropy fell to 0.92 on that kind alone.
2. **Clean labels are by provenance** (the `tool` field and the source file), so they are right by
   construction but not always *visible* in the text. A Bash `grep` of a `.d.ts` file is labelled
   shell_output but reads like file contents. This biases the clean class toward higher entropy,
   which is conservative for P6.
3. **Deviation from the brief:** the question-bank `*-states.json` corpora hold 74 states in total,
   too few for ≥100 clean items with unambiguous labels. The tool-output clean items come from
   `triage/items2.json`, the 151-item source corpus from which the bank's measured CONTEXT_TRIAGE
   set was sampled. Its `tool` field is the existing label.
4. **"≥2 sets" is met as two CLASSIFICATION.label instantiations**, with different options (4
   and 2) over different corpora. ROUTING and GRAPH_EDGES were excluded on principle: each has a
   catch-all option (`other`, `unrelated`) that gives empty or off-topic input a correct answer. The
   report flags this as a finding in its own right. **P5/P6-style "no right answer" only exists
   when the option set has no catch-all.** With a catch-all, the right behaviour is to pick it
   confidently, and entropy would (correctly) stay low.
5. One garbage fragment (`"─\nEXIT=0"`) plausibly *is* shell output. It stays in, per the prereg.
6. `empty` fell in the fit half for both questions, so the test half has no `""` item. Its fit-half
   readings are in the results file.
7. Single run, one model version, one day. P4 says individual probabilities move ±0.11, and the AUC
   differences here are smaller than that.
8. `medianRatio` is null in the JSON because the clean median entropy is exactly 0. The ratio is
   unbounded, which is not informative.

## Registry proposal

Replace the NETER P6 row with:

```
| P6 | **Entropy separates garbage; top-probability nearly does too, if you threshold it near 1.** Held-out half of a pre-registered n=214 corpus (104 clean, 110 garbage, two choice questions): AUC entropy **0.978** [0.953–0.996] vs 1−top-p **0.952** [0.913–0.984] vs a length baseline 0.852. Entropy's edge (+0.026, CI 0.007–0.049) is real but below P4's noise floor, and it is **zero on a 2-option choice** (entropy is then a function of top-p), so it grows only with option count. What P5 warned about still holds at the *conventional* cut: top-p < 0.8 caught 59% of garbage; entropy ≥ 0.30 caught 84% at the same 3.6% clean cost. The n=10 ranges do not replicate: garbage spans 0.11–1.00, clean 0.00–0.54, with tails overlapping (garbage p5 0.23 < clean p95 0.27). Hardest garbage is plausible-looking: a real state sent to the wrong question (entropy AUC 0.92). "No right answer" exists only when the options have no catch-all. | our run, n=214, pre-registered, fit/test disjoint, jev-1.13.0 (`program/P6-REPORT.md`) | **measured here — original wording falsified (F2)** |
```

The line in NETER.md's open-questions list, "Does entropy separation (P6) hold at n=200?", can be
closed as answered: separation holds, and the distinctive claim over top-p does not.
