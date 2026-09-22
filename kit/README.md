# kit/ — run any Jev question set from one JSON file

Write your questions the way TypeSafe documents them, add the items to ask about, and run:

```bash
cd ~/JEV-works && source ~/.zshrc >/dev/null 2>&1
node kit/run.ts kit/examples/support-routing.json --dry-run   # validate + checks + call count, no API calls
node kit/run.ts kit/examples/support-routing.json             # ask Jev, report, write kit/results/<name>-<date>.json
node --test kit/kit.test.ts                                    # core tests, no API calls
```

Use `/opt/homebrew/bin/node` (v25). `/usr/local/bin/node` v22.17 can't run `.ts`.

## The spec (`kit/spec.schema.json`; point your editor's `$schema` at it)

```jsonc
{
  "name": "support-routing",                      // lowercase-kebab; names the result file
  "questions": {                                   // EXACTLY the `questions` object of POST /v1/systemone
    "dept":   { "type": "choice", "instructions": "Which team?", "criteria": { "billing": "…", "none": "Not a support request" } },
    "urgent": { "type": "noul",   "instructions": "Is it blocking work right now?" },
    "effort": { "type": "score",  "instructions": "How much work?", "criteria": ["trivial", "some", "a lot"] }
  },
  "items": [                                       // or "itemsFile": "path/relative/to/spec.json"
    { "id": "t01", "state": { "message": "…" },   // state = what Jev reads: text, JSON object, or array
      "labels":   { "dept": "billing", "urgent": false, "effort": 1 },   // optional ground truth
      "baseline": { "dept": "billing" },                               // optional cheap baseline's prediction
      "split": "test" }                                                // optional: fit | test, declared before the run
  ],
  "baselineName": "keyword rule",
  "gate": { "minCoverage": 0.95 },                 // exit 2 (REFUSE) below it
  "model": "jev-1.13.0",                           // optional; default is lib/jev.ts's pinned version
  "decision": { … },                               // optional; decision rules, owned by kit/gate/
  "privacyScan": true                              // default; states go to an external API
}
```

`"type": "boolean"` (the AI SDK's name) is accepted and normalised to `noul`. Labels: `noul` → true/false (Jev is right when p ≥ 0.5 matches); `choice` → an option key; `score` → a level index (nearest level).

## What a run does, in order (it stops at the first failure, before spending anything)

1. **Validate**: every problem is listed at once, labels are checked against their questions (exit 65).
2. **Privacy scan**: emails, phone numbers, API keys, private keys and bearer tokens in any state bound for the API are refused. Matches are reported by item id and kind; the matched text is never printed (exit 3).
3. **Disjointness**: when splits are declared, test items are checked against fit items by id AND by normalised text, the unit the model reads (L31, L40). Any overlap is refused; `--accept-overlap` overrides it, and the overlap is reported (exit 4).
4. `--dry-run` stops here and prints the call count.
5. **Ask**: one call per item with all questions batched (P31 shows batching doesn't contaminate), through `lib/jev.ts` (direct, pinned). Every row records `answeredBy`.
6. **Report**:
   - **Question quality, always, label-free:** JEV-SAFE / MARGINAL / MOVE-TO-CODE / NO-INFORMATION per question (`question-bank/confidence.ts`).
   - **With labels:** per question, accuracy over ALL scored items (a non-answer counts as wrong) and coverage beside it. Jev is compared with the majority class (fitted on the fit split when there is one) and with your baseline, using **exact McNemar** plus a seeded bootstrap CI. Never the 0.11 band (I6).
7. **Write** `kit/results/<name>-<date>[-n].json`: never overwritten, with per-item raw answers so other tools (`kit/gate/`) can re-decide without re-asking.

## Standard gates
Every run passes the same named gates, G1–G10 (`kit/GATES.md`, `kit/standard-gate.ts`), and the suite verdict is written into the result file. Any REFUSE refuses the claim.

## Modules

| file | what | pure? |
|---|---|---|
| `spec.ts` | types, validator, `loadSpec`, noul⇄boolean translation | yes (reads the file) |
| `stats.ts` | `mcnemarExact`, `paired` (McNemar + bootstrap CI), `normEntropy`, seeded `rng` | yes: **the lab's single McNemar** |
| `checks.ts` | `privacyScan`, `disjointness`, `seenShare(items, fit, textOf)` | yes |
| `score.ts` | `isCorrect`, `majorityOf` | yes |
| `ask.ts` | `askAll(spec, items)` → rows via lib/jev.ts + RunLog | calls Jev |
| `run.ts` | the CLI | calls Jev |
| `standard-gate.ts` | the gate contract, catalogue G1–G10, core gates, `suite` | yes |
| `threshold.ts` | fitted thresholds, calibration evaluators and their audit | yes |
| `gate/` | decision rules, scoring policies, splits and leakage refusal, claim gate (E1–E5). **Owned by the leads session** | |

## Rules it enforces, so you don't have to remember them
Pinned model and `answeredBy` recorded (L36) · coverage beside accuracy (retro §9.2) · paired tests for accuracy gaps (I6) · holdout disjointness at text level (L31, L40) · never overwrite a result (D4) · privacy before any external call.

Small sets get honest answers. The bundled example has n=10, so "no difference shown" against the keyword rule is the correct output, not a bug.
