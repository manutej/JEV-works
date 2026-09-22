# OC gate: operadic consistency on three frozen question trees

**Date** 2026-09-22 · **Agent under test** Jev, `jev-1.13.0 (direct)`, answered by `jev-1.13.0` on every call ·
**Calls** 1,272 (cap 1,350; 0 retries, 0 failures; $0.023) · **Branch** `feat/op-consist` ·
**Code** `program/oc-{tree,data,run,analyze,review}.ts` (run/scoring code and the verdict rule committed in `aeb0923` before any call) ·
**Data** `program/results/oc-<slug>.json` (every raw p, per-collapse answers, context ids), `program/results/oc-summary.json` ·
**Gate records** `.toq/<slug>/consist-report.yaml` · **Review page** `program/oc-review.html`

The purpose of this run is **question quality**. When the same agent answers the same tree through four
different collapses and the answers don't agree, some question or compose rule is ambiguous or wrong. The
disagreement shows where, and it doesn't need a single label to do so. Consistency is not correctness, and
this report keeps the two apart.

## Verdicts

| tree | n | OC rate (all 4 agree) | oc_signal (worst pair) | worst edge | verdict |
|---|---|---|---|---|---|
| hotpot-type | 150 | **86.0%** [79.5, 90.7] | 0.893 | `L*-M2` 26.7% | **REFUSE** |
| leads-qualified | 150 | **52.0%** [44.1, 59.9] | 0.520 | `L*-M1` 86.0% | **REFUSE** |
| doc-admit | 18 | **66.7%** [43.8, 83.7] | 0.667 | `L*-M2` 22.2% | **REFUSE** |

The tree rule was declared in code before the run: ACCEPT iff OC ≥ 0.90 and no edge group disagrees on more
than 10% of items. All three trees are refused. That is a finding about the trees. Each refusal points to one
or two specific questions, and those are listed below.

The FROZEN hashes were verified in code before the first call. The trees were not edited, and their `status`
was not flipped to `gated` (the skill's step 6), because they are frozen. The consist-report files are the
gate record instead.

## How it was run

Each item was answered four ways, each as a separate, stateless Jev call with its own `context_id`:

- **direct**: ask R alone.
- **mid**: ask the M nodes in one call, then compose them to R with R's rule.
- **decomposed**: ask every leaf in one call, then compose leaves to M and M to R.
- **highrisk**: ask the declared high-risk M directly, and the other Ms' leaves, in one call. Then compose.

Answers are thresholded at p ≥ 0.5 (the declared `bool-exact-at-0.5`), and every raw p is kept. Each edge
group is localized by comparing:

- **`L*-Mi`**: Mi asked directly (from `mid`) vs Mi composed from its leaves (from `decomposed`).
- **`M*-R`**: R asked directly vs R composed from the directly asked Ms.

An inconsistent item's failing edge is its deepest disagreeing edge that actually flips R.

**Correction made after the run:** 3 hotpot items were first tagged "highrisk-only". On inspection, M1 and M2
both disagreed on them, and neither flipped R alone, but both together did. The rule now reports such items
under both edges ("jointly load-bearing"). No raw data or verdict changed.

**Replication check (free, no extra calls):** the high-risk M is asked twice per item, beside different
siblings in two separate calls.

| tree | node | p95 \|Δp\| | max \|Δp\| | flips across 0.5 |
|---|---|---|---|---|
| hotpot-type | M2 | 0.05 | 0.08 | 5/150 |
| leads-qualified | M3 | 0.02 | 0.05 | 4/150 |
| doc-admit | M1 | 0.02 | 0.03 | 0/18 |

All three are inside P4's bool band of 0.07, and the flips are near-0.5 items by construction. So batch
composition does not move the answers (P31 holds). The disagreements below are not noise from batching.

## hotpot-type: is this HotpotQA question a comparison?

**Pairwise agreement:**

| | mid | decomposed | highrisk |
|---|---|---|---|
| direct | 95.3% | 90.7% | 92.0% |
| mid | | 91.3% | 96.7% |
| decomposed | | | 89.3% |

**Edges, worst first:**

| edge | disagree | flips R | deciding p within 0.07 of 0.5 | pivotal leaves (heuristic) |
|---|---|---|---|---|
| `L*-M2` (declared high-risk) | **40/150 = 26.7%** | 10 | 15 | L3 33, L4 28 |
| `L*-M1` | 11/150 = 7.3% | 4 | 8 | L1 10, L2 10 |
| `M*-R` | 7/150 = 4.7% | 7 | 1 | M1 7, M2 5 |

The declared high-risk edge was the right call: M2 is the one question that breaks.

**Edge 1: `L*-M2`, M2 = L3 OR L4.** It fails in both directions.

- **M2 says yes, the leaves say no (22 items).** These are shared-attribute questions. L3 finds no comparison
  word, and L4 correctly says the answer is not one of the named things.
  - "What profession does H. L. Mencken and Albert Camus have in common?" M2 0.96, L3 0.41, L4 0.27. Gold:
    comparison.
  - "Woman's Era and Naj are what kind of magazines?" M2 0.91, L3 0.13, L4 0.32. Gold: comparison.
  - "What type of profession does Ithu Engal Neethi and Shoba Chandrasekhar have in common?" M2 0.93, L3 0.31,
    L4 0.22. Gold: **bridge**.
- **M2 says no, the leaves say yes (18 items).** L3 fires on a comparison word that is only a descriptor.
  - "The first book in the Sprawl Trilogy won what three awards?" M2 0.45, L3 0.95. Gold: bridge.
  - This direction rarely reaches the root, because M1 already says no.

**What is at fault:**

- **The M2 wording, for the first direction.** "How those named things relate on a single shared property"
  literally includes "what do they have in common". HotpotQA's gold labels call 19 of these 22 items
  **bridge**, and only 3 comparison. So the leaves follow the dataset's definition and M2 does not. R's wording
  shares M2's reading: direct R said yes on all four hotpot "have in common / what kind" errors.
- **The L3 wording, for the second direction.** It is pure word-spotting: "first" and "largest" fire even when
  they describe a single entity.
- **Open question:** E5 (P33) already suspected label noise in exactly this question family. Deciding which
  reading is intended is a decision for Manu, not something the gate can settle.

**Edge 2: `L*-M1`, M1 = L1 AND L2.** 7.3%, under the 10% bar. 8 of the 11 are within the jitter band. The
leaf at fault is **L2**, whose connective list is literal:

- "Is the building located at 200 West Street taller than the one at 888 7th Avenue?" M1 0.85, L2 0.49
  ("than" is not in L2's list). Composed M1 is no, although gold is comparison.
- "What station broadcast the episode … of the series created by Max Mutchnick and David Kohan?" M1 0.19,
  L2 0.80. L2 fires on an "and" that joins co-creators, not compared things.
- "Ellie Goulding worked with what other writers on her third studio album, Delirium?" M1 0.15, L2 0.57.
  L2 fires with no connective at all.

This over-firing is also why `highrisk` (M1 composed from leaves) is the least accurate collapse. Direct was
right on 10 items where highrisk was wrong, and highrisk on 2 where direct was wrong: exact McNemar p = 0.039.

**Correctness (gold `type`, logged only):**

- **Accuracy:** direct 92.7%, mid 90.7%, decomposed 91.3%, highrisk 87.3%. The majority guess scores 82.7%.
- **OC vs correctness:** the direct answer is right on **124/129 = 96.1%** of OC-consistent items vs
  **15/21 = 71.4%** of inconsistent ones.
  - Fisher exact two-sided **p = 0.0011**.
  - Bootstrap 95% CI of the difference: [+6.4, +45.3] pts.
  - **On this tree, OC does track correctness locally.**
- **Direct vs decomposed:** 8 vs 6 discordant, exact McNemar **p = 0.79**, no significant difference.

## leads-qualified: is this lead worth handing to sales now?

**Pairwise agreement:**

| | mid | decomposed | highrisk |
|---|---|---|---|
| direct | **52.0%** | 94.7% | 94.7% |
| mid | | **57.3%** | **57.3%** |
| decomposed | | | 100% |

Everything that involves `mid` collapses. Everything else agrees at about 95%.

**Edges, worst first:**

| edge | disagree | flips R | deciding p within 0.07 of 0.5 | pivots |
|---|---|---|---|---|
| `L*-M1` | **129/150 = 86.0%** | 64 | **0** | L1 129, L2 129 |
| `M*-R` | 72/150 = 48.0% | 72 | 7 | M1 64 |
| `L*-M3` (declared high-risk) | 19/150 = 12.7% | **0** | 19 | L5 19 |
| `L*-M2` | 1/150 = 0.7% | 0 | 1 | — |

**Edge 1: `L*-M1`.** M1, "Is there a real, specific company behind this record?", was answered **no on all
150 records** (p 0.05–0.38, never above 0.38). Its leaves said yes at ≥ 0.95 wherever a company and a sentence
were present.

- lead-0107, "Northwind Parallax Dynamics", B2B SaaS, 1000+, "evaluating vendors … live by Q3. Budget is
  $5k/mo": M1 0.16, L1 0.97, L2 0.99. Gold: qualified.
- lead-0029, "Vertex Orchard Collective", Cybersecurity, 1000+: M1 0.17, L1 0.97, L2 0.99. Gold: qualified.
- lead-0007, "Bluepeak Lantern Technologies", B2B SaaS, 51–200: M1 0.26, L1 0.98, L2 0.99. Gold: qualified.

**The M1 wording is at fault.** "Is there a *real* company" asks Jev to vouch for something no single record
can show, which breaks P21's rule that a question must be answerable from the one record in front of it. Jev
answers "can't tell", i.e. no, confidently and on every record. None of the disagreements is near 0.5. As a
result, `mid` scores 51.3%, exactly the majority guess (direct vs mid McNemar 68 vs 4, p = 5e-16). The leaves
are fine; this is the literal-leaves lesson (L37) working as intended.

**Edge 2: `M*-R`.** 64 of the 72 are M1 again, seen one level up. The other 8 have their own cause:

- **What happens:** direct R says a weak yes (0.51–0.67) on "We're a lean IT consulting / systems integration
  shop … growing fast … enterprise-grade yesterday — budget …" leads with 1–10 employees. M2 says no.
  - lead-0365, IT Consulting, 1–10: R 0.51, M2 0.22. Gold: **qualified**.
  - lead-0395, Systems Integration, 1–10: R 0.57, M2 0.33. Gold: not qualified.
  - lead-0467, Restaurants, message in Russian: R 0.58, M2 0.03. Gold: not qualified.
- **Where the blame splits:**
  - **R's wording:** "in our target profile" is not defined inside R, so direct R cannot apply the ICP list.
  - **The compose rule vs the planted truth:** 6 of the 8 "lean shop" leads are qualified in truth-42, yet the
    tree's M2 = L3 AND L4 (> 10 employees, listed industries) rejects all 8 by construction. The tree encodes a
    stricter qualified rule than the corpus does. Deciding which rule is intended is a spec decision.

**The declared high-risk edge, `L*-M3`.** It never flipped R (0/19): all 19 are near-threshold L5 readings on
"Do you offer a version for personal / hobby use? We're not a company…" (L5 0.50–0.61 vs M3 0.31–0.49), plus
a Japanese message. L5's wording, "active intent … rather than idle curiosity", is ambiguous for a pricing
question from a non-company. It is low priority, because M2 already rejects these leads.

**Correctness (truth-42 `trueQualified`, logged only):**

- **Accuracy:** direct 94.0%, decomposed 92.7%, highrisk 92.7%, mid 51.3%. The majority guess scores 51.3%.
- **OC vs correctness:** direct is right on 73/78 = 93.6% of consistent items vs 68/72 = 94.4% of inconsistent
  ones. Fisher **p = 1.0**, bootstrap CI [−7.7, +7.1] pts. **No relation.**
  - The reason is instructive: nearly all the inconsistency comes from one broken question that fails on every
    item, whatever the item's difficulty. With a defective node in the tree, OC measures the tree, not the
    item.
- **Direct vs decomposed:** 5 vs 3 discordant, exact McNemar **p = 0.73**, no significant difference.

## doc-admit: should this documentation chunk go into the prompt? (label-free, n = 18)

**Pairwise agreement:**

| | mid | decomposed | highrisk |
|---|---|---|---|
| direct | 83.3% | **66.7%** | 72.2% |
| mid | | 83.3% | 77.8% |
| decomposed | | | 94.4% |

**Edges:**

| edge | disagree | flips R | deciding p within 0.07 of 0.5 |
|---|---|---|---|
| `L*-M2` | **4/18 = 22.2%** | 3 | 1 |
| `M*-R` | 3/18 = 16.7% | 3 | 3 |
| `L*-M1` (declared high-risk) | **0/18** | — | — |

**The pattern:** every one of the 6 direct-vs-decomposed disagreements runs the same way. Direct says don't
admit; decomposed admits through M2 on an **off-topic** chunk that contains code:

- **What happens:** the decomposed path admits 16/18 chunks; the direct path admits 10/18.
  - doc:1, "How do I require human approval before a tool executes?" with a chunk on *tool order and prompt
    caching*: direct R 0.06, M2 0.10. Leaves L3 0.60, L5 0.83, so composed M2 is yes and the chunk is admitted.
  - doc:11, "How can I log … using middleware?" with a *Guardrails* chunk: direct R 0.29, M2 0.41. L3 0.93,
    L5 0.95, so it is admitted.
  - doc:3, "What are the benefits of streaming …?" with an *Embeddings* chunk: direct R 0.05. Mid M2 is 0.51,
    right at the threshold. This is the `M*-R` edge.
- **What is at fault: the leaf set and the compose rule.**
  - M2's own text is question-relative ("how to do *the thing*"). Its leaves L3–L5 only describe the chunk
    ("defines a callable surface", "has runnable code", "exact names"), and none of them mentions the question.
  - R = M1 OR M2 then admits any code-bearing chunk, relevant or not.
  - The tree mirrors `question-bank/bank.ts` DOC_RELEVANCE `recombine` (per its compose_witness), so **that
    recombine rule has the same hole**. That is worth a look independently of this tree.
- **The declared high-risk edge, M1-R, was perfectly consistent.**

## Which questions are good

- **Good, keep as is:**
  - leads L1–L4.
  - leads L6.
  - hotpot L1 and L4.
  - doc M1 with L1/L2: 0 disagreements. The declared high-risk edge was clean.
  - leads M2/M3 as M-level questions.
- **Borderline:**
  - hotpot L2 (literal connective list).
  - leads L5 (hobby-use messages).
- **Broken:**
  - leads M1: unanswerable from one record.
  - hotpot M2 and R: they read "have in common" as a comparison, against the dataset.
  - hotpot L3: word-spotting.
  - doc-admit M2's leaf set: no relevance condition.

## Proposed rewordings (proposals only, not run)

A reworded tree is a **new** tree. It gets a new slug and its own FROZEN hash, and is gated separately.

| tree | node | now | proposed |
|---|---|---|---|
| leads | M1 | Is there a real, specific company behind this record? | Does this record name a specific company and include a readable message from someone at it? *(literal, one record, P21)* |
| leads | R | …a real company, in our target profile, with someone showing intent to buy? | Is this lead worth handing to sales now: a specific named company in B2B software, fintech, developer tools, cybersecurity or cloud infrastructure with more than ten employees, whose contact shows intent to buy? *(profile stated inline; first decide whether "lean but growing fast" shops qualify, since truth-42 says 6 of 8 do)* |
| leads | L5 | …express an active intent to evaluate or purchase, rather than idle curiosity? | Does the message ask to evaluate, trial, buy or get pricing for the product for an organisation, rather than only asking what it is? |
| hotpot | M2 | Does the question ask how those named things relate on a single shared property? | Does the question ask which of the named things has more or less of a property, or whether they share it (answer: one of them, or yes/no), rather than asking for the value of a property they share? *(binds HotpotQA's reading; the alternative is to add a leaf "asks what they have in common" to M2's OR and accept that HotpotQA labels most of these bridge)* |
| hotpot | R | …compare two or more named things on one shared property… | same binding as M2: "…compare two or more named things with each other (which is more, or do they share X), rather than ask for a fact…" |
| hotpot | L3 | Does the question contain a comparison word such as …? | Does the question use a comparison word (…) to compare the named things with each other, rather than to describe one of them (as in "the first book in the series")? |
| hotpot | L2 | Are those named things joined by 'and', 'or', 'both' or 'either'…? | Are those named things set against each other with 'and', 'or', 'both', 'either', 'than' or 'which of', as the things being asked about, rather than one describing the other or being listed as co-authors of something else? |
| doc | M2 compose | (L3 OR L4) AND L5 | (L3 OR L4) AND L5 AND **L6**, with L6 = "Is the code or API in this chunk for the function, option or task the stated question asks about?" |

## Registry proposal

For the main session; this session does not write registries.

- **NETER, new P (measured here):** a deep OC gate localizes defective questions without labels.
  - Four collapses, 318 items, `jev-1.13.0 (direct)`, 1,272 calls.
  - Each of the three frozen trees was refused, and each refusal named one question:
    - leads M1 disagrees on 86% of items and is never near 0.5; `mid` falls to the majority guess, 51.3%.
    - hotpot M2 disagrees on 26.7%.
    - doc-admit M2's leaf set disagrees on 22%.
  - OC vs correctness is **tree-dependent**:
    - hotpot: consistent 96.1% vs inconsistent 71.4% direct accuracy, Fisher p = 0.0011.
    - leads: 93.6% vs 94.4%, p = 1.0, because its inconsistency is one broken node failing uniformly.
  - Direct vs decomposed accuracy shows no significant difference on either labelled tree (McNemar p = 0.79,
    0.73).
- **NETER P31 corroborated:** the same question asked in two different batches moved p95 |Δp| 0.05 / 0.02 /
  0.02 (n = 150 / 150 / 18), inside the P4 bool band.
- **NETER P21 corroborated:** an M-level question that asks for verification beyond the record ("is there a
  *real* company") collapses to always-no (0/150 yes).
- **LESSONS, new L:**
  - **Happened:** the leads tree's OC rate would have "predicted" nothing about correctness (Fisher p = 1),
    because one defective node made every item inconsistent.
  - **Rule:** before reading OC as an item-level confidence signal, check that no single edge accounts for most
    of the inconsistency. If one does, OC is measuring the tree; fix the tree first. This is the skill's blame
    order (tree → edge → agent), shown on data.
- **question-bank:** DOC_RELEVANCE `recombine` (= M1 OR ((L3 OR L4) AND L5)) admits off-topic code-bearing
  chunks. On the 18 states, the decomposed path admits 16 and the direct question admits 10; all 6 differences
  are off-topic API or code chunks. Proposal: add the relevance leaf L6 above.
- **Queue:** decide the intended readings before re-freezing:
  - hotpot: "have in common" = comparison or bridge?
  - leads: do "lean but growing fast" shops qualify?

  Then gate the reworded trees as new frozen slugs.
