# TypeSafe direct-API loop — progress log

Goal: let JEV-works call Jev directly via `TYPESAFE_API_KEY` (POST https://api.typesafe.ai/v1/systemone,
`Authorization: Bearer $TYPESAFE_API_KEY`), alongside the existing Vercel AI Gateway path.

Each loop iteration: read this file, do the first unchecked step, verify it, tick it, append a log line.
Never print the key. Key is exported in ~/.zshrc line 22 — prefix commands with `source ~/.zshrc 2>/dev/null &&`.

## Steps
- [x] 1. Read the official API reference (docs.typesafe.ai/llms.txt, /api) — record exact request/response schema below
- [x] 2. Direct smoke call with curl (one boolean question) — confirm key auth works
- [x] 3. `lib/jev-direct.ts`: typed client (fetch, no new deps) mirroring `evaluate()` inputs/outputs
- [x] 4. `lib/jev.ts`: one entry point choosing backend via `JEV_BACKEND=direct|gateway` (default: direct if key present)
- [x] 5. Port `probe-jev.mjs` + `triage/triage.ts` to the entry point; run both backends, compare answers
- [x] 6. `npx tsc --noEmit` passes; update README "Getting set up" + llms.txt with the direct path
- [x] 7. Record result in LESSONS.md / NETER.md if backends disagree or differ in latency

## Schema notes
POST https://api.typesafe.ai/v1/systemone · `Authorization: Bearer $TYPESAFE_API_KEY`
Body `{model:"jev-latest", state, questions:{id:{type:"noul"|"choice"|"score", instructions, criteria?}}}`
Answers: noul `{noul:p}` · choice `{choice, confidence, probabilities}` · score `{score, confidence, legend, probabilities}` (2dp)
Usage `{input_tokens, output_tokens}`; response `model` is the pinned version (jev-1.13.0).

## Log
- 2026-09-21 — loop created; key exported in ~/.zshrc; gateway OIDC refreshed and probe passing
- 2026-09-21 — steps 1–2: schema recorded; direct curl 200 in 0.22s (noul 0.36 vs gateway 0.38)
- 2026-09-21 — steps 3–4: lib/jev-direct.ts (EvaluationModelV4) + lib/jev.ts selector; tsc clean
- 2026-09-21 — step 5: 6 scripts ported; triage both backends: 117/119 agree, p50 131 vs 268ms
- 2026-09-21 — steps 6–7: README/llms.txt updated; NETER P10 resolved + iteration 3 ledger. LOOP COMPLETE.
