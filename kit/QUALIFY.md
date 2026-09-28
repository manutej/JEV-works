# Qualifying Jev for a new domain

The kit's purpose is not benchmark wins. It is a **repeatable way to decide whether, where and how far Jev can be trusted in a
domain nobody has measured yet**, and to keep that decision honest as it scales to many domains. Operadic composition is the
customisation mechanism: a new domain is *composed* from reusable question modules into a typed tree, and every claim about it
passes the same named gates (`kit/GATES.md`).

Two regimes, and the method differs between them:

- **Anchored:** some ground truth exists (labels, outcomes, a human-checked sample). You *measure*.
- **Unanchored:** no ground truth. You *estimate, bound and escalate*, and you buy the smallest anchor that makes the estimate valid.

Most real domains start unanchored. The steps below say which regime each belongs to.

---

## Q0 · Scope and state (both regimes)
Write the domain's scope before any data: language, channel, record shape, what is out of scope (L47). Decide the unit Jev reads
(one record: P18/P21). Anything needing comparison, counting or other records goes to code, not to Jev.

## Q1 · Compose the question tree (both): the operadic step
Build a `kit/modules` Context (the one format: `kit/SCOPE.md`). Its modules are reusable literal questions (Atoms) with declared
polarity, the fields they read, and an escape option for every choice (P5: without one, noise gets confident wrong answers).
Compose them into a **typed tree** (`kit/oc`): root judgement ← mid judgements ← literal leaves, with an explicit rule at each node.
**Customising for a new or nuanced situation = swapping or adding a subtree**, not rewriting the set. The rest of the tree, and
its measured history, carries over.
Gates: **G1** (spec), `kit/modules` lint M1–M7 (the question meta-type).

## Q2 · Label-free qualification of the tree (unanchored)
Run the tree's partial collapses (`kit/oc`: direct / mid / decomposed / subtree). Where the parts disagree with the whole, the
disagreeing edge names the bad question or the wrong combining rule, **without any labels** (P34: all three first trees refused
and were localised). Run the label-free quality report too: questions that never become decisive go to code (`kit/run.ts`).
Gates: **G10** (tree consistent). REFUSE means *fix the tree*, not *ship with caveats*.
Caveat: consistency ≠ correctness. A tree can be consistently wrong (P34, L43).
Pairwise questions (A vs B, any shortlist or rank step): ask **both candidate orders** and gate on the averaged aligned
probability (`kit/gate/route.ts` `alignedPairProbability`); order reversal flipped 3–11% of decisions in arXiv:2609.26550,
several times the A/A noise, and an invalid answer in either order defers.

## Q3 · Buy the smallest anchor (moves unanchored → anchored)
Ground truth is bought, not assumed. Size it **before** collecting anything:
- For a bounded gate: `minItemsForBound(maxError)` correct auto-decisions on each side (5% → 59, 10% → 29).
- For a comparison: enough items for ≥ 8 discordant pairs (G6), which usually means 150+.
- For calibration: ≥ 100 held-out items, or the audited evaluator says "too few" (L42).
Draw the anchor from the domain's real stream, stratified, and **over-sample where the label-free signals disagree** (Q2
failing edges, high entropy): that is where the labels buy the most. **Audit the labels on the low-confidence stratum first**: in
arXiv:2609.26550 the items Jev was unsure about on HaluEval were mostly the mislabeled ones (24 of 26 shared "misses" carried labels
the evidence did not support), so a cut fitted there is fitted on label noise.
Before fitting anything, report the **error-detection AUROC** of confidence against correctness on the anchor (`program/stats.ts`
`auc`, positive = error, score = 1 − q), overall and on the adversarial stratum. In the paper it was 0.74–0.92 where the cascade
worked and 0.518 on reference-free prose, where mean max-probability was still 0.90 and no threshold helped. Near 0.5 the domain is
`not-supported` (route: a person), not a threshold problem; `fitSelective` will find no cut and that is the right answer. Keep it disjoint from everything used to write the questions
(**G3**: id, text and 8-word runs, L31/L40/L45).

## Q4 · Evaluate the evaluators (the panel is audited, not trusted)
When model judges stand in for humans (labelling, grading, a comparator), the panel is itself an instrument and gets audited
like one (L42). What the lab has measured (E1, NETER P24–P29): five diverse models on 80 human-labelled items were right on
unanimous items only **73%** of the time. Where 4 of 5 agreed they were right only **29%** (the danger zone). The consensus vote
(48.75%) was **below the best single model** (50%). So:
1. **Never treat agreement as truth.** Agreement measures shared bias as readily as correctness (P25).
2. **Use a panel of different families**, not several models of one family. Same-family judges converge (L45), and a panel of
   one family is one judge counted several times.
3. **Qualify each judge on an anchor set with known truth** before it judges anything unknown: per-judge accuracy, per-class
   recall, calibration (judgeCalibration on held-out data), and the **error-correlation matrix** between judges. Two judges that
   err on the same items add nothing.
4. **Re-qualify on every model version** (P4/drift): a judge's score is tied to its `answeredBy` version, like Jev's.
5. Anchor sets the lab already has with real metrics: the six cookbook test splits (P35), HotpotQA type (P33), the CETI
   80 (E1, P24–P29), and the leads planted-truth corpora. Each judge's accuracy there is its reference card.

## Q5 · Is this a Jev domain, or an any-LLM domain? (anchored)
Compare Jev with **general LLMs given the same literal questions and options** (the first run is `feat/comparator`, with Haiku 4.5),
and with a cheap non-LLM baseline. Paired exact McNemar, Holm across domains, coverage beside accuracy (**G6, G7**). Also a
**robustness / contamination probe** for public benchmarks: paraphrase the inputs, and relabel the options to neutral codes. A
large drop means memorised surface or label names, not reading. A domain where a general LLM ties Jev is still useful; the
question is then cost and latency, not capability.
Record the outcome as the Context's **envelope** (`kit/gate/route.ts` `Envelope`: `use | validate-first | escalate | not-supported`,
the vocabulary of arXiv:2609.26550 Table 2). Its measured shape for jev-1.13.0 on public judging work: within three points of the
strongest judge on ordinary preference, evidence-grounded factuality and final-answer adjudication (`use`); 10–20 points behind on
checking a multi-step derivation or resisting a more elaborately written wrong answer (`escalate`, whatever the confidence); near
chance for every judge on reference-free prose (`not-supported`). The envelope routes before confidence does.

## Q6 · Thresholds by method (anchored)
Fit every threshold on the fit split, never by hand (**G8**): a selective gate with a Clopper-Pearson error bound (`fitSelective`),
or a cost cut only on probabilities an audited evaluator calls calibrated (**G9**). Apply it frozen to held-out data once and
report whether the promised bound held. Escalating everything is an honest answer when the anchor is too small (L44).
What a fitted cut may *do* is decided one step later: `kit/gate/route.ts` turns the verdict into an Ormus route (`auto / review /
block / escalate_human`) under the action's effect class (reversible × blast) and an error budget declared per class before the data;
`auto` rides only on a cut that was fitted, held, and is within budget. The doctrine and the cross-repo vocabulary map are in
jev-elder `fusion/DECISION-CALIBRATION.md`.

## Q7 · The claim (anchored)
Any claim ("Jev qualifies for domain D at error ≤ e on scope S") passes the standard suite: G1–G10, strata consistent with the
headline (L41), policy declared before the data (G5). A dev run is NOT-A-HOLDOUT, whatever its numbers.

## Q8 · Unanchored at scale: estimating quality with no ground truth
When a domain runs at volume and labels stay scarce, use these, in order of trust:
1. **Prediction-powered inference (PPI).** Label a small random sample (Q3). Use the model (or panel) on everything, and
   correct its estimate using the gap measured on the labelled sample. The result is an unbiased accuracy estimate with a valid
   confidence interval from a few hundred labels, however large the stream. This is the default for "how good is it on the
   unlabelled 100,000?".
2. **Planted probes.** Mix items with known answers into the live stream (synthetic, blind-written by an author with the scope
   in the brief, L47, and checked for n-gram overlap, L45). Their error rate bounds the error on the stream, as long as they
   resemble it (check G3 the other way round: not too alien either).
3. **Latent-class estimation** (e.g. Dawid–Skene) over a *qualified, multi-family* panel estimates each judge's error rates
   without labels. It is valid only if judges err roughly independently, which E1 shows they often don't (P25). So it is only a
   screening signal, cross-checked against 1 or 2.
4. **Label-free internal signals:** tree consistency (G10; predicted correctness on HotpotQA, P34), entropy on the choices
   (P6), and escape-option rate. These say **where** to look; they never say **how good**. Route high-disagreement items to the
   anchor (active labelling).
5. **Drift watch:** the weekly drift suite (`program/drift.ts`) pins the model version, and any change triggers re-qualification (Q4, Q5).

Never report an unanchored accuracy as a measurement. Report it as an estimate with its method and interval, or as "unknown,
escalating".

## Q9 · Record and re-qualify
Every result carries `JEV_ID` + `answeredBy`, its gate suite, and its regime (anchored / unanchored-estimate). Re-run Q2 on any
tree change, Q4 on any judge-model change, Q5–Q7 on any Jev version change or scope change.

---

### What this protocol does *not* claim
- That a tree passing G10 is correct (consistency is necessary, not sufficient).
- That model agreement is truth (P24–P28).
- That results on public benchmarks transfer to private domains (Q5's contamination probe exists because they may not).
- That thresholds transfer between domains. They are refitted per domain (Q6).
