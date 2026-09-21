# Brief: jev operad repo (session: jev-operad)

**Where:** `~/jev/jev` (GitHub `manutej/jev`, clean clone) · **branch:** `feat/typesafe-direct` (create from its default branch).
**Commit locally. No push without Manu approving that push.**

## What the repo is
"A workbench for what is allowed and what is useful": colored operads map types to entities, cospans glue
systems (pushout), spans identify shared variables (pullback), masked-language simulations check a fill against
a port, and probability thresholds decide whether composition ships. TS (17 files) + Rust crates (4) + wasm.
It calls Jev through `src/lib/jev/seats.ts` with `model: "jev-1.13.0"`. The last commit added the question operad, a 16-seat fill
pipeline, a 100-per-concept generator, and fail-closed eval claims.

## Goals
1. Read `README.md`, `docs/`, `src/lib/jev/seats.ts` end to end. Write `PROGRESS.md` with how Jev is called today (gateway vs direct, auth, primitive names).
2. Add a **direct TypeSafe backend** behind the repo's existing seam, the same way JEV-works did: an adapter over
   `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer $TYPESAFE_API_KEY`. SDK `boolean` ⇄ wire `noul`,
   `{noul: p}` → `{probability: p}`; choice/score pass through; `confidence` kept in metadata; pin `jev-1.13.0`.
   Reference implementation: `~/JEV-works/lib/jev-direct.ts` and `lib/jev.ts` (read them, don't import across repos).
3. Verify: the repo's own tests/typecheck/build green; one real seat-fill run on direct vs the existing path, with answers compared (a |Δp| below 0.11 is noise).
4. **Fail-closed stays fail-closed.** If the direct path errors, the operad must not "compose on GREEN" by default.

## Do not
Push, deploy, change the pin to `jev-latest`, or put the key in anything that reaches a browser or wasm bundle.

## Kickoff prompt
```
Read ~/JEV-works/handoffs/README.md and jev-operad.md (git -C ~/JEV-works show feat/jev-selector:handoffs/jev-operad.md).
You are the jev-operad session in ~/jev/jev. Create branch feat/typesafe-direct, keep PROGRESS.md (results,
assumptions, HANDOFF). Use an agent team: one to map the repo, one to build the adapter, one to verify.
Commit locally; never push. Don't stop unless a push, a key-exposure risk, or a fail-closed invariant is at stake.
```
