# PROGRAM — manufacturing truth, then validating the manufacturer

## The problem, stated exactly

We want to know whether typed decisions work on real categories. That requires labels. We have
almost none: the one corpus that looked labelled turned out to carry only metadata the generating
pipeline assigned to itself (`pass1/FINDINGS.md`), so `NETER.md` P20 has blocked every accuracy
claim in this project.

Two escapes, and they check each other:

**Escape A — masking.** A categorical field that already exists in data *is* a label. Hide it,
predict it from the rest of the record, score against what you hid. No annotation required. Four
such targets exist on this machine (`masked/targets.json`), and one of them has a natural holdout.

**Escape B — consensus distillation.** Run N independent strong labellers over the same item. Where
they agree unanimously, treat the label as gold. Where they split, you have found a genuine category
boundary rather than a mistake.

Escape B is the scalable one — it works on any corpus, labelled or not. But it rests on an
assumption nobody has checked: **that unanimity implies correctness.** Escape A is the only thing
that can test that assumption, because it is the only place real labels exist.

So the programme is ordered: **use A to validate B, then use B at scale.** Running B first and
trusting it would be building a measuring instrument and calibrating it against itself.

## What we are actually building

Not a type checker. A **concept-type** checker.

A type check asks whether a value inhabits a declared shape — is this one of nine formula labels.
A concept check asks whether an underlying mechanism holds — does this text withhold information to
create tension, which is what `deprivation-moment` *means*. The first is surface matching and a
regex often wins it. The second is the judgement worth paying for, and it is the claim this
programme has to test rather than assume.

The output is a library of **coloured operads**: question sets with declared answer colours
(`question-bank/colors.ts`), declared polarity, verified answerability, measured accuracy against
real labels, and stated composition rules — so calls can be sequenced, typed, and routed
compositionally instead of by hand.

## Ground rules

Carried in from `NETER.md` and `LESSONS.md`, because every one of these was learned by violating it:

1. **A cheap baseline runs in every experiment.** Regex or majority-class. The leads baseline hit
   91.7% and the field's phishing regex hit 91.8% against 62.6% for one broad model question. An
   experiment without a baseline cannot tell you whether the model was needed.
2. **Holdouts are declared before fitting and not looked at.** Thresholds fitted and validated on
   one set report a fantasy.
3. **No verdict from thin data.** `confidence.ts` now returns `INSUFFICIENT-DATA` below 8
   observations, because NaN comparisons silently returned the *best* verdict.
4. **Polarity and colour are declared per question.** Averaging a cost with a benefit inverts the
   signal (L20); dividing a rubric level into a probability asserts calibration that does not exist
   (L17).
5. **Report losses.** A result showing the regex wins is the most useful outcome available, because
   it stops work that was not worth doing.
6. **Differences below 0.11 are not differences** (P4).

---

## E1 · Does unanimity mean correctness?

**The foundational experiment. Everything else is conditional on it.**

*Corpus.* `ceti-silver-hooks.json` — 80 items, `formula` field, 9 classes, majority 26%, leak 4%.
Real labels, authored by a human taxonomy, not by a pipeline labelling itself.

*Method.* Mask `formula`. Run **5 independent Opus labellers**, each seeing only `text` and `source`
and the 9 options, each blind to the others. Bucket items by agreement level (5/5, 4/5, 3/5, ≤2/5).

*Measure.* Accuracy against the true `formula`, **per agreement bucket**. Plus unanimity rate and
therefore coverage.

*Hypothesis.* Unanimous items are ≥95% accurate.

*Falsified if* unanimous accuracy is <95%, or if the 4/5 bucket is no worse than 5/5 — the latter
would mean unanimity carries no extra information and the whole filter is theatre.

*Why it matters.* If unanimity is not gold, consensus distillation cannot manufacture truth and the
programme stops here rather than three experiments later.

---

## E2 · Does model disagreement mark the same boundary as Jev's entropy?

*Corpus.* The same 80 items, now carrying an agreement level from E1.

*Method.* Run Jev's choice question over the 9 options on every item. Record the entropy of each
distribution. Correlate entropy against E1's agreement level, and against whether the item was
labelled correctly.

*Measure.* Spearman correlation of entropy with agreement level. Entropy distributions for the
unanimous vs split buckets, with medians. AUC of entropy as a predictor of "labellers disagreed".

*Hypothesis.* Entropy rises monotonically as agreement falls.

*Falsified if* |ρ| < 0.3, or if the entropy distributions of unanimous and split items overlap
substantially.

*Why it matters.* This is the highest-leverage result available. If it holds, **entropy is a
labels-free proxy for genuine category ambiguity** — meaning you can locate the soft boundaries of
any category, on any corpus, for $0.042 per million tokens and no annotation. That is the finding
that would make the rest of this scale. P6 already showed entropy separates garbage from clean; this
asks whether it also separates *hard* from *easy*, which is a strictly stronger and more useful
claim.

---

## E3 · Blind test: fit on consensus, validate on untouched real labels

*Corpora.* Fit on `ceti-silver-hooks.json` (80). Blind-validate on
`ceti-silver-hooks-approved.json` (39) — same schema, **never inspected until the run**.

*Method.* Build the choice question and its option descriptions from what E1's consensus revealed
about each class. Fit any thresholds on the 80. Then run once on the 39 and report.

*Measure.* Accuracy, macro recall, per-class recall on the holdout. The fit-to-holdout drop. Against
a keyword baseline built on the same 80.

*Hypothesis.* Holdout accuracy drops less than 5 points from fit, and beats the baseline.

*Falsified if* the drop exceeds 5 points (overfitting to the fit set) or the baseline wins.

---

## E4 · Concept probes versus type matching

**The experiment that tests the programme's central claim.**

*Corpus.* The 80 hooks, plus the 39-item holdout.

*Method.* Two question sets over identical items:
- **TYPE set** — one `choice` over the 9 formula names, asked directly.
- **CONCEPT set** — ~9 `boolean` probes for the *mechanisms* the formula names denote, never naming
  a formula: does this withhold something the reader wants; does it name a specific number and a
  timeframe; does it address the reader as a member of a called-out group; does it admit a flaw on
  the speaker's behalf; and so on. Recombine into a predicted class **in code**, by a rule declared
  before the run.

*Measure.* Accuracy of each set against real labels, on both fit and holdout. Per-class recall for
each. Which set wins on the items where E1's labellers split.

*Hypothesis.* The concept set matches or beats the type set overall, and beats it clearly on the
split items.

*Falsified if* the type set wins outright — which would mean surface matching suffices here and
concept decomposition is unjustified cost.

*Why it matters.* Concept decomposition is the expensive, interesting claim. It must earn its place
against the cheap direct question, on the same data, or be dropped.

---

## E5 · A recoverability map across every typed corpus on this machine

*Corpus.* Every categorical field in local JSON/JSONL/CSV that survives the four tests in
`masked/find-targets.py` — closed, populated, balanced, separable with low leakage.

*Method.* For each target: mask the field, ask a `choice` over its observed values, score against
truth, and score a majority-class and a keyword baseline alongside.

*Measure.* Per target — accuracy, lift over majority class, lift over keyword baseline, mean
entropy, and the fraction of items where entropy exceeds E2's ambiguity threshold.

*Output.* A table of **which concept-types in this data are recoverable at all**, ranked by lift
over the cheap baseline. That table is the raw material for the operad library: every row with real
lift is a validated question set with known colours and measured accuracy.

*Falsified as a programme if* no target shows meaningful lift over its keyword baseline — which
would say the recoverable structure in this data was always surface-level.

---

## Reporting contract

Every experiment reports, in this order: **n**, the baseline, the result, the delta, and whether the
hypothesis was falsified. Hypotheses are written above *before* any run, and are not edited
afterwards — if one turns out to be badly posed, that gets recorded as a finding rather than
silently rewritten.

Deferred, with the diagnosis already recorded: the leads pipeline needs its corpus name pool widened
(231 distinct names for 600 leads) and its no-domain dedup fallback fixed (name-only matching merged
516 leads against 60 planted duplicates). Both are real bugs; neither is on this critical path.
