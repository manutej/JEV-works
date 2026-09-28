# Handoff — Jev in front of a browser (Vibium)

Date 2026-09-28. Status: **contexts drafted and linted, runtime twins green in jev-tape, nothing measured live yet.**
Model pin `jev-1.13.0`. This file says what exists, what is claimed, and what the next keyed session must run.

## What exists

| Where | What |
| --- | --- |
| `kit/modules/contexts/browser.action-gate.json` | May this commit verb (click, press Enter, upload…) run now? 3 nouls + 1 score over one page snapshot. Escape-less by design (nouls); compose leans on the nouls until score indexing is confirmed live. |
| `kit/modules/contexts/browser.step-verify.json` | Did the page do what the step said? Module `step-verify` (claim vs evidence, choice with escape `unsupported`) and module `login-verify` (four literal leaves from the operator interview). |
| `kit/modules/items/browser-gate.items.json` | 43 clickable targets from six recorded pages (31 of them IANA nav links); 7 carry `mutatesWorld` / `spendsOrSends` labels where the truth is certain. |
| `kit/modules/items/browser-verify.items.json` | 4 before→after pairs with a claim, labelled for `step-verify`. |
| `kit/modules/items/browser-login.items.json` | 3 of those pairs labelled for `login-verify`. |
| `handoffs/vibium/interview-login-verify.md` | The operadic-interview answer sheet that produced `login-verify`. Passes `treelint.py` (1 documented star delegation). |
| `handoffs/vibium/toq-login-verify.yaml` | The same tree in `.toq` shape for the OC gate. Not frozen, not in `SLUGS`: promote only after it is answered on a real corpus. |
| jev-tape `src/vibium/`, `packs/`, `spec/SURFACES-VIBIUM.md` | The runtime: verb classes → speed paths, ≤ 2 POSTs per applied step, replay tape, redaction, C10 park. |

States were built by jev-tape's own `labelDiff()` and `excerpt()` from `jev-tape/fixtures/vibium/*.json`, so what the kit measures is what the runtime sends.

## First keyed run, 2026-09-28 (`jev-1.13.0 (direct)`)

The four commands below were run once. Results in `kit/results/browser-*-2026-09-28.json` and `kit/results/meta-question-quality-answerability-2026-09-28.json`.

| spec | n | p50 / p95 | label-free verdicts | on the labels |
| --- | --- | --- | --- | --- |
| action-gate | 43 | 186 / 240 ms | mutatesWorld JEV-SAFE (91% at ends), blastRadius JEV-SAFE (91%), reversible JEV-SAFE (72%), **spendsOrSends MARGINAL (40%)** | mutatesWorld 6/7, spendsOrSends 6/7 (n too small for McNemar) |
| step-verify | 4 | 255 / 304 ms | INSUFFICIENT-DATA (< 8) | outcome 4/4, errorShown 4/4, blocked 3/4 |
| login-verify | 3 | 269 ms | INSUFFICIENT-DATA (< 8) | signedInSignsShown 3/3, credentialErrorShown 3/3, interstitial 3/3, **loginFormGone 2/3** (0.64 on the closed-flash page) |
| vet (meta) | 7 questions | 241 / 270 ms | needsOtherRecords and twoQuestionsInOne sit mid-band (29% at ends) on our own questions | no labels |

Cost of all four: about $0.002. `score` answers are the expected level on a 0-based legend, with per-level probabilities alongside.

Live loop (jev-tape `npm run vibium` against `scripts/fixture-site.mjs`): the Login submit gated **escalate** on two different pages (mutatesWorld 0.79–0.81, reversible 0.39). A sign-in does change server state, so that is a fair answer to the question as worded; by rule 7 the threshold stays. The operator's compose applied the click and `login-verify` returned **true** in 503 ms. Second run: gate served from the tape, 0 POSTs for it.

What the numbers say to do next: `spendsOrSends` needs rewording or an escape (it is the least literal of the four and it sits mid-band on 60% of targets); `loginFormGone` should read `labelsRemoved` only, since "the text no longer asks for a password" pulled it toward the middle on a page whose flash still mentioned login; and the routine-commit decision (Login on an allowlisted host) belongs to the operator's `Policy`, not to a threshold.

## The larger sample: 74 labelled pages, 3 parallel workers (2026-09-28)

jev-tape `npm run corpus` ran 80 catalog rows (40 public pages × true and false claim) through three parallel Vibium sessions, each making its own Jev calls, in 88 s. 74 settled; 6 were stopped in code (PyPI bot check, gnu.org 429 under parallel load). Items: `kit/modules/items/browser-verify.corpus-2026-09-28.items.json`. Results: `kit/results/browser-step-verify-corpus-2026-09-28.json`.

| question | kind | at ends | verdict | on labels |
| --- | --- | --- | --- | --- |
| outcome | choice | 82% | **JEV-SAFE** | **98.6%** (73/74) vs majority 50%; McNemar b=36 c=0, p = 2.9e-11; coverage 100% ≥ declared 90% |
| errorShown | noul | 100% | NO-INFORMATION | unlabelled; answered false every time |
| blocked | choice | 97% | NO-INFORMATION | unlabelled; answered none every time |

The runtime's own verdicts on the same run: 73 decided, 73 right, 0 wrong, 1 escalate (entropy rule 0 fired on the WCAG quick reference at 0.78). Jev p50 170–178 ms under three-way parallel load.

NO-INFORMATION on the two supporting questions is a corpus gap, not a question defect: this catalog holds only normal pages. On the eight-page bench `blocked` was the question that caught the Cloudflare wall. Add 404 / 500 / login-wall / consent rows before judging them.

Caveats that keep this an estimate: the claims were written with the pages known (L31, in-sample), the false claims are mostly wrong-subject claims (easy), thresholds are hand-set (G8 would refuse), and there is no fit/test split (G3 skipped). The next run needs claims written blind by a second author from a scope brief (L47), a hash split, and rows with actions so the gate gets the same sample size.

## Next: ten agents, recordings, and calibration (designed 2026-09-28, not launched)

jev-tape `docs/PARALLEL-SPEND.md` and `scripts/workflow-parallel-corpus.js`: ten Sonnet drivers over `fixtures/vibium/catalog-100.json` (140 rows, 70 pages, 18 kinds) with per-row Vibium recordings and Grok fallback on Jev escalates; ten Haiku labellers read each recording's last screenshot and answer the claim from the image alone; `scripts/calibrate.ts` scores Jev's probabilities (Brier, reliability bins, per-kind ends accuracy) against rows where the catalog label and the screenshot label agree, and lists disagreements as findings. Recording smoke passed (zips with actions and screenshots) and already found one wrong catalog label. The launch waits on the operator's answers to `handoffs/vibium/interview-use-cases.md`, which reorder the catalog. The verify context gained `contentType` in its state (lint-clean).

## What is claimed, and what is not

Claimed: the loop shape and its POST budget (twin-tested), the question shapes (M1–M7 lint), and that every relational judgement in a browser step has a named code replacement (`notForJev`). Not claimed: any accuracy, coverage, or that `auto` is safe. `n` is 43 gate targets (7 labelled) and 4 pairs. G4 and G6 will refuse any headline from this, correctly.

## Next keyed session, in order (kit/QUALIFY.md Q1–Q3)

```bash
cd ~/JEV-works && source ~/.zshrc
node kit/modules/cli.ts vet  kit/modules/contexts/browser.step-verify.json /tmp/vet.json && node kit/run.ts /tmp/vet.json          # Jev vets the questions themselves
node kit/modules/cli.ts spec kit/modules/contexts/browser.action-gate.json  action-gate  kit/modules/items/browser-gate.items.json   /tmp/gate.json   && node kit/run.ts /tmp/gate.json
node kit/modules/cli.ts spec kit/modules/contexts/browser.step-verify.json  step-verify  kit/modules/items/browser-verify.items.json /tmp/verify.json && node kit/run.ts /tmp/verify.json
node kit/modules/cli.ts spec kit/modules/contexts/browser.step-verify.json  login-verify kit/modules/items/browser-login.items.json  /tmp/login.json  && node kit/run.ts /tmp/login.json
```

Read, per question: atEnds and spread (label-free), then correctness on the few labels. Expect `outcome` to be the weakest: it compares a claim with evidence, which is the least literal question in the set (P21). If it comes back MOVE-TO-CODE, `step-verify` keeps `errorShown` and `blocked` only and non-literal claims go to `vibium check`. Record the score level indexing the first live gate answer shows and fix the `blastRadius` rules accordingly.

Then grow the corpus: `cd ~/jev-tape && npm run vibium -- … --corpus states.json` appends every snapshot of a live flow. Over-sample where the collapses of `toq-login-verify.yaml` disagree (Q3). Buy the anchor from that stream, not from these four pairs.

## Rails that bind here

C5: Jev never computes the URL change, the diff, a count, or a retry; those are in code and the state carries their result as a value. C10: pay / send / delete targets park before any POST. P5: every choice has an escape option. L1: no gate on a conjunction of confidences; the compose rules use single-end conditions. L22: the runtime's `loadPack` fails closed on a drifted copy; the kit's lint is the same rule set.
