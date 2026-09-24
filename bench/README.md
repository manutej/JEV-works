# Live bench

Browser workbench: load a question set, edit questions, paste state, rerun Jev with `TYPESAFE_API_KEY`.

The offline experiment tracker stays at `dashboard/index.html`. This page is the live loop.

## Run

TypeSafe does not reliably send CORS headers, so the browser talks to `bench/proxy.mjs`.

```bash
cd /Users/manu/JEV-works
node bench/proxy.mjs
python3 -m http.server 4173
```

Open http://127.0.0.1:4173/bench/

Paste the TypeSafe key. It lives in `sessionStorage` only. Use Forget when done.
Leave the endpoint on `http://127.0.0.1:8787/v1/systemone`.

## Packs

From `question-bank/bank.ts`. Bank `boolean` maps to API `noul`.
You can also import a JSON file `{ state, questions }`.

## Gates

Same rules as `question-bank/confidence.ts`:
- Noul ACT when p ≤ 0.15 or p ≥ 0.85
- Choice ACT when entropy H < 0.15
- Score ACT when the weighted score sits on a rubric level
- Relevance questions (`onTopic`, `answersTheQuestion`) checked first; a confident no HOLDs the rest

Connectors (Email, Docs, File) are stubs for the next slice through `jev-playground`.
