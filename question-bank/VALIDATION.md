# Question bank validation — DOC_RELEVANCE, COURSE_QA, GRAPH_EDGES

States built: DOC_RELEVANCE 18 `{question, chunk}` states, COURSE_QA 16 prose-section
states, GRAPH_EDGES 16 `{first, second}` states. All from real text, no invented filler.
Saved at:

- `/Users/manu/JEV-works/question-bank/doc-relevance-states.json` — real doc chunks pulled
  from `/Users/manu/JEV-works/node_modules/ai/docs/**/*.mdx` (tool calling, streaming,
  embeddings, middleware, error handling, memory), paired with plausible developer
  questions. Mix of: answers-the-question, same-topic-but-irrelevant, pure conceptual
  overview, pure API signature.
- `/Users/manu/JEV-works/question-bank/course-qa-states.json` — real prose sections from
  `/Users/manu/JEV-works/NETER.md` and `/Users/manu/jev-playground/README.md`, standing in
  for generated course sections. Mix of jargon-heavy/dense and plain-language/concrete.
- `/Users/manu/JEV-works/question-bank/graph-edges-states.json` — real `{first, second}`
  pairs built from NETER.md/README.md content: stated dependencies, a stated contradiction
  (P10), a specialises pair (embed/embedMany), peer/unrelated pairs, and inferred-not-stated
  relationships.

Run as: `node --env-file-if-exists=/Users/manu/jev-playground/.env.local
question-bank/measure-confidence.ts <SET_KEY> <states.json>` from `/Users/manu/JEV-works`.
All three ran clean (no crashes, no failed states). CLASSIFICATION skipped per instructions
(empty `criteria`).

## DOC_RELEVANCE (drafted, 5 questions × 18 states, 33.2s)

| question | kind | mean conf | at ends | spread | verdict |
|---|---|---|---|---|---|
| answersTheQuestion | boolean | 0.881 | 100% | 0.439 | JEV-SAFE |
| versionRisk | boolean | 0.691 | 67% | 0.277 | JEV-SAFE |
| isApiSurface | boolean | 0.640 | 50% | 0.341 | JEV-SAFE |
| isRunnableExample | boolean | 0.533 | 39% | 0.271 | MARGINAL |
| specificity | score | 0.624 | 39% | 0.268 | MARGINAL |

MOVE-TO-CODE: none. NO-INFORMATION: none.

## COURSE_QA (drafted, 4 questions × 16 states, 33.2s)

| question | kind | mean conf | at ends | spread | verdict |
|---|---|---|---|---|---|
| hasConcreteExample | boolean | 0.768 | 75% | 0.182 | JEV-SAFE |
| plainLanguage | score | 0.770 | 69% | 0.117 | JEV-SAFE |
| assumesUndefinedTerm | boolean | 0.664 | 63% | 0.139 | JEV-SAFE |
| teachesOneThing | boolean | 0.470 | 25% | 0.172 | MARGINAL |

MOVE-TO-CODE: none. NO-INFORMATION: none.

## GRAPH_EDGES (suspect, 3 questions × 16 states, 1.1s)

| question | kind | mean conf | at ends | spread | verdict |
|---|---|---|---|---|---|
| relationship | choice | 0.465 | 38% | 0.244 | MARGINAL |
| statedNotInferred | boolean | 0.408 | 6% | 0.223 | MOVE-TO-CODE |
| directional | boolean | 0.208 | 0% | 0.122 | MOVE-TO-CODE |

MOVE-TO-CODE (2): `statedNotInferred`, `directional`. NO-INFORMATION: none.

The `suspect` label in bank.ts is confirmed: 2 of 3 questions never leave the mid band.
`directional` never once reached an end across 16 states — the worst result of the whole run.

## Which questions to cut / move, and what replaces them

- **GRAPH_EDGES.directional** (0% at ends, worst result overall). "Would this be false if
  the two items were swapped?" is a counterfactual Jev cannot evaluate from one pair. Cut it
  from Jev entirely. Replace with a static lookup keyed by the `relationship` label:
  `depends_on`→true, `specialises`→true, `contradicts`→false/symmetric, `mentions`→true,
  `unrelated`→n/a. Directionality is a property of the chosen label, not an independent
  judgment about the pair — it belongs in a code constant.

- **GRAPH_EDGES.statedNotInferred** (6% at ends). This is NETER.md P21's exact shape —
  reasoning about the provenance of a claim across two items. Don't ask it of every
  candidate pair (that's what drags the mean down); scope it to a text-model escalation
  call fired only on edges where `relationship` already landed in a confident band. Asking
  it universally is the deterministic path to the mid band.

- **GRAPH_EDGES.relationship** itself is only MARGINAL (38%). Since `recombine` currently
  gates acceptance on `statedNotInferred`, and that gate is broken, the set as specified
  accepts almost nothing cleanly right now. Don't ship GRAPH_EDGES until `directional` is
  removed and `statedNotInferred` is rescoped as above.

- **DOC_RELEVANCE.isRunnableExample / specificity** (both MARGINAL, 39% at ends) — not
  broken, but the weakest pair in an otherwise clean set. Cheapest fix: `isRunnableExample`
  is often answerable deterministically (regex for a fenced code block containing an
  import/call, e.g. a \`\`\`ts fence with a function call inside it). Pulling that out in
  code would let Jev's `specificity` question focus purely on prose density, likely
  sharpening its ends.

- **COURSE_QA.teachesOneThing** (MARGINAL, 25% at ends) — the weakest question in that set.
  "One idea vs. several" is a structural judgment. Replace with a deterministic heuristic
  (e.g. more than one H2 heading, or more than three distinct code blocks, in a single
  section ⇒ likely multi-topic) and reserve Jev for the borderline cases that heuristic
  doesn't resolve, rather than asking it of every section.
