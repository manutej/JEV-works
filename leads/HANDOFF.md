# leads/ handoff — U3–U5 + Q2, 2026-09-21

## 00 · Round 3 (Q2b, branch `feat/leads-paraphrase`) — read this first

Manu's three decisions (2026-09-22): merge Q2 (done, main f26b029); an escalation on an adversarial
row counts as correct (**scoring policy v2**, `evaluate.ts` SCORING POLICY; v1 always printed beside
it; v2 is post hoc for seeds 7/42/2718 and the output says so); build a paraphrase corpus.

| | |
|---|---|
| Corpus | seed `p<n>` = paraphrase variant: 20% `non_buyer` (ICP-shaped record, sender not buying), buyers written without regex keywords. **A stress test built against the regex** (templates written after reading its keyword lists; `paraphrase-templates.test.ts` proves 0 pattern hits, mutation-tested). Not a generalisation test. |
| Dev finding (p3001) | regex and current Jev both 0% on non-buyers. Jev's `buyingSignal` separated them at the confident ends (non-buyers 66/54/0, buyers 0/39/141), but stage 2 never read it. |
| Rule change | stage 2 rejects when `buyingSignal` ≤ 0.15. Dev replay: seed 42 changes 0 leads; p3001 rejects 50 non-buyers, 0 buyers. |
| Pre-registration | 158eae9, logged in META-PLAN Q2b before generation. Primary score v2. |
| **H1** paraphrase `p6029` | (a) coverage **93.0% FAIL**; (b) Jev **78.3%** vs regex **72.0%**, McNemar 71 vs 33, **p = 2.5e-4: Jev significantly better**; (c) non-buyers **40.0% vs 0%** |
| **H2** base `6011` | (a) **97.7% pass**; (b) Jev **90.3%** vs regex **92.0%**, p = 0.245: **no significant difference** (under v1 the regex would win, p = 0.013) |
| Predictions | 4 of 5 right; H1 (a) wrong |
| **Caveat on H1** | 565/600 holdout messages appear verbatim in dev p3001 (only 5 + 5 templates). **All 120 non-buyers are in the seen subset**, so H1 has *no* evidence about new wording. Split by novelty: seen n=565, Jev 77.7% vs regex 70.8% (71 vs 32, p = 1.5e-4); novel n=35 (22 clean_in_icp, 13 near_duplicate), 88.6% vs 91.4%, p = 1.0. The whole advantage is on wording the rule was tuned on. |
| **Prevention (Manu, 2026-09-22)** | `corpus/splits.json` declares every seed's role and fit seeds; `pipeline.ts` refuses undeclared seeds, and refuses a holdout whose messages were > 20% seen in its fit seeds unless run with `--accept-leakage`; `evaluate.ts` scores every holdout on seen vs novel messages with McNemar each, shows each subset's category mix, and warns above 20%. Tests: `splits.test.ts` (reproduces p6029's 565/600). Base corpora are ~61% seen by design (shared templates), so every base holdout now needs the flag: that is intended. |

**What it means.** When a record's shape and its message disagree, reading the message wins, and the
regex cannot. It only works once the pipeline *uses* the intent answer it was already getting. On
ordinary leads (H2) the change costs nothing measurable. But every non-buyer in the holdout reused dev
wording, so this shows the mechanism works on tuned wording and new records, nothing more.

**Next steps (not started):**
1. Honest version of H1: new non-buyer and buyer templates written **blind** by someone who has not seen
   `paraphrase-templates.ts` or the regex (a fresh agent with only the category definitions), then a
   fresh seed. That tests wording, not only records.
2. H1's coverage miss is 22 mid-band non-buyers. Leave it (acting only on confident ends is the design)
   or pre-register a mid-band policy.
3. Real data: the README's standing point is that synthetic results need a real sample before any claim.

## 0 · Round 2 (Q2, branch `feat/leads-literal-questions`)

§1–§8 below are round 1 (U3–U5, merged at 0cefc2d) and stay as the record. Round 2 changed one
stage-1 question and measured it once on a fresh seed.

| | |
|---|---|
| Change | Stage 1 gates on `senderWroteASentence` ("is this noise?") instead of `inboundSubstantive`, which also judged intent, stage 2's question. `inboundSubstantive` is still asked and recorded. |
| Dev (seed 42, not evidence) | coverage 14.3% → 96.7%; Jev 88.7% vs regex 93.2% |
| Pre-registration | 365bcc0, corrected in fc1c893 before the seed existed (I first misapplied P4's 0.11 band to an accuracy gap; the test is now exact McNemar). Logged in META-PLAN §4 before generation. |
| Holdout | seed 2718, one run. Overlap with seeds 42 + 7: full records 0, verbatim messages 369/600 (shared templates), names 171/567. |
| (a) ≥ 95% reach a verdict | **PASS**, 97.3% |
| (b) accuracy over all leads | Jev **88.5%** vs regex **91.0%**, Δ −2.5 pts, McNemar 30 vs 45 discordant, **p = 0.105: not different** |
| Prediction ("Jev below regex, p < 0.05") | **wrong** |
| Where the gap is | adversarial: Jev escalates 12/30 injection rows (right on all it decides). Ambiguous ties 46.7% / 46.7%. |
| Provenance | JEV_ID and answeredBy `jev-1.13.0`; tie fix e3df648 cherry-picked before the run (it also carries the orchestrator's doc edits; identical patch, drops out on rebase); 0 errors |
| Also done | `leads/` uses `lib/harness.ts` + `answeredBy()`; worktree symlink removed (Manu approved); tsc and 11/11 tests pass without it |

**What it means:** with the literal question the model stops escalating, and on this synthetic
corpus it performs about as well as the regex, neither significantly better nor worse. That is
the honest answer to the README's question, and it is the regex's answer too: on a surface-level
task, a two-line regex is as good.

**Candidate next steps (none started):**
1. Adversarial rows: Jev refuses to decide 40% of injections. Escalating an injection is arguably
   the *right* behaviour, but it is scored as wrong. Decide the policy (score "escalate" as correct
   for adversarial rows?) **before** any run, in writing: that is a scoring change, not a model change.
2. A corpus where the regex should fail: paraphrased intent, no keywords. That is where a model could
   earn its cost. It needs a new generator version and a fresh seed.
3. Or stop: the result stands, and it is a reasonable place to stop.

Branch `feat/leads-pipeline`, worktree `~/JEV-works-wt/leads-pipeline`, owned by session b4f08e.
Spec: `META-PLAN.md` §4 rows U3–U5, invariants I1–I11 (§2), anti-patterns (§6).
Registries (NETER, LESSONS, README, META-PLAN) are written only by the fan-in session (U9);
everything below that belongs there has been sent to it, and is listed in §6 so nothing is lost.

## 1 · Where things stand

| | |
|---|---|
| Result | The instrument is fixed and honest. The model **loses** to the regex on the one valid run. |
| Valid measurement | seed 7, `results/pipeline-7.json` + `results/eval-7.txt`, JEV_ID `jev-latest (direct)`, resolved version **not captured** |
| Headline | Jev 67.8% correct over all 600 leads vs regex 92.2% (Δ −24.4 pts, I6 ✓), coverage 69.7% |
| Pre-registered (a) ≥ 95% of leads reach a verdict | **FAIL** — 69.7% |
| Holdouts used | seed 42 (used for fitting the gate — not evidence), seed 7 (spent) |
| Tests | `node --test leads/code-gates.test.ts` 11/11; `npx tsc --noEmit` exit 0 |
| Independent review | a fresh agent reviewed the branch against this spec; every number recomputed from the committed files and matched. Its findings are resolved or carried below. |

## 2 · Spec tracking (done-checks verbatim from META-PLAN §4)

| Unit | Criterion | Status | Evidence |
|---|---|---|---|
| U3 | distinct names ≥ 600 − planted dups | **FAIL as written; intent met** — see deviation D1 | seed 42: 512 distinct = 572 named − 60 dups (28 garbage leads have empty names by design); seed 7: 514 |
| U3 | same seed → byte-identical file on 2 runs | PASS | `shasum` over two regenerations; reviewer reproduced for seeds 42 and 7 |
| U4 | merges = planted dups ± 5% | PASS | 60/60 on seeds 42 and 7, each to its true source (test) |
| U4 | "Acme Corp", 3 contacts, no domain → stays 3 | PASS | tests incl. the short-message cases the review broke on the first version |
| U5 | ≥ 95% of leads reach a verdict | **FAIL** | 69.7% on seed 7 |
| U5 | report has n, baseline, result, delta, falsified? | PASS | n 600 · regex 92.2% · Jev 67.8% · Δ −24.4 · falsified: yes, for this question set |
| U5 | artifact `pipeline-42.json` + eval | **DEVIATION D2** | seed 7 used as held-out instead |
| all | I7 tsc after every unit | PASS | |

## 3 · Commits (on `main` 8bfa12b)

| hash | what |
|---|---|
| 231484d | U3 unique corpus names |
| f0ca67b | U4 dedup = fingerprint + message containment |
| 6159e75 | stage-1 gate: `isRealBusiness` may reject, not block. **Pre-registration of the seed-7 criteria is in this message.** |
| d105cc0 | seed-7 run, FAIL recorded. Its message cites `651db1f` — that is 6159e75's pre-rebase hash; cite **6159e75**. |
| 7fbfbc4 | record the answering model version per call (`resolvedModel`, `resolvedModels`) |
| 22adbbc | dedup containment by whole words, ≥ 8 words (review finding: "hi" ⊂ "this") |
| c2bc002 | `evaluate.ts` leads with accuracy over all leads + coverage |
| (this) | README status + this handoff |

## 4 · Deviations from the spec (disclosed, not hidden)

- **D1 · U3 check.** "≥ 600 − planted dups" = 540 is unreachable: the garbage category plants empty
  names on purpose. Met the intent ("every named non-duplicate lead has a unique name"). Proposed
  amendment: *distinct normalised names = named non-duplicate leads.*
- **D2 · U5 artifact.** The plan names `pipeline-42.json`. Seed 42 was inspected to choose the gate
  change, so reporting it would violate I2 / "fitting on the data being reported". Seed 7 was
  generated fresh after the criteria were committed. `pipeline-42.json` remains the **pre-gate** run.
- **D3 · SolutionSketch before building** (§1). Written up front only for the gate change (as the
  pre-registration). For U3/U4 the reasoning is in commit messages, written after.
- **D4 · Result-file overwrite** (§6). The first rerun overwrote `pipeline-42.json` and
  `baseline-42.json` from the baseline commit; old versions survive only in git, no `*.prev.json`.
  Later overwrites (`eval-7.txt`) were copied first.
- **D5 · Scope.** Found and fixed a third bug (stage-1 gate) and added `resolvedModel` capture — both
  outside U3–U5 as written, both inside `leads/`.

## 5 · Retro (due after 3 units, §9)

- **What did the gates catch?** Each fix exposed the next defect: name collisions hid dedup merging
  516 leads, which hid the gate leaving 86% without a verdict. The pre-gate eval printed "Jev 100% vs regex 93.2%" at
  14.3% coverage. The independent review caught a false-merge bug that 6 passing tests had missed,
  because the tests' messages happened not to contain one another.
- **Where did reality diverge from the plan?** The plan assumed two bugs; there were three. The
  regex bar moved with the corpus (91.7% old → 93.2% seed 42 → 92.2% seed 7). The plan's single
  artifact (`pipeline-42`) conflicted with its own holdout rule once seed 42 was used for fitting.
- **Smallest plan change that prevents a recurrence.**
  1. Every unit that may change a gate declares its holdout seed in the plan row *before* the run.
  2. Every eval prints coverage next to accuracy (now true for leads; worth a check in the other scripts).
  3. Every result records the answering version, not the alias.
  4. Regression tests are written from an adversary's inputs, not the author's.

## 6 · Carried to U9 (the fan-in session writes these; sent by message)

1. Coverage comparison, same corpus: old gate **19.3% → 69.7%** on seed 7 (reviewer recomputed from
   the seed-7 answers). The d105cc0 message's "14.3% → 69.7%" mixes seeds 42 and 7; don't cite it.
2. Amend U3's done-check per D1.
3. Cite 6159e75 (not 651db1f) as the pre-registration.
4. Root `README.md` "Known broken, on purpose" (lines ~144–156) now says both bugs are unfixed.
5. Seed 7's resolved model version: not captured.

## 7 · Known limits and open defects

- **Dedup recall on real data is unmeasured** (see `README.md` status). Fingerprint is exact-match, so
  edited resubmissions are missed. Next corpus version could plant edited duplicates — that is a new
  corpus, not seed 42 or 7.
- **`pipeline.ts` error path** (pre-existing): if stage 2 or 3 throws, the catch returns `stage1: null`,
  dropping stage 1's `resolvedModel` and tokens. Fix: hold stage results in outer variables. 0 errors
  occurred on seed 7, so no reported number is affected.
- **Representative = lowest id**, not earliest `capturedAt` (pre-existing). Correct for this corpus (0/120
  wrong); on real data the "original" may be the later submission.
- Pairwise comparison is O(k²) per fingerprint bucket — fine here; a huge company record could make it slow.

## 8 · Next step (not started — needs Manu's go)

The bottleneck is `inboundSubstantive`: mid-band on 72/73 escalated out-of-ICP leads. "Real, specific
content" is a judgement of degree, not a literal question (P18). Proposed iteration:
1. Rewrite it as literal yes/no questions (e.g. "Does the message name a product, a number, or a date?").
2. **Before running:** commit the criteria and a fresh seed that has never been generated (not 42, not 7).
3. Run once (~1.2k calls, < $1). Report run 1 whatever it says (§6: no re-running until it looks good).

If that also fails, the README's own framing applies: the task is surface-level and the regex is enough.

## 9 · Environment and reproduce

- Run `.ts` with `/opt/homebrew/bin/node` (v25); v22 fails with ERR_UNKNOWN_FILE_EXTENSION.
- The key: `source ~/.zshrc` first (the session env may predate the export). Never print it (I8).
- Worktrees need `~/JEV-works-wt/jev-playground → ~/jev-playground` until `lib/harness.ts` (on
  `feat/jev-selector`) is on main; then switch `pipeline.ts`/`evaluate.ts` imports to
  `../lib/harness.ts`, use `answeredBy()` from `../lib/jev.ts`, and verify tsc with the symlink gone.
  Removing the symlink is a deletion (I10) — ask first.

```bash
cd leads
node generate-corpus.ts --n 600 --seed 7        # byte-identical to the committed corpus
node --test code-gates.test.ts                  # 11/11
node evaluate.ts --seed 7                       # reproduces the headline, no model calls
```
