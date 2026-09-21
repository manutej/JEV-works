# HEKAT — what it is, and what integrating with it actually means

Findings from a read of the HEKAT corpus (2026-09-20), recorded because the useful
result was mostly negative and negative results evaporate if they stay in chat.

## HEKAT is a prompt template, not software

`~/.claude/commands/hekat.md` describes itself as *"HEKAT Query Builder — complexity-aware
orchestration (L1-L7) with unified categorical syntax"*. It is read by Claude Code as a command
template. Its own **Current Implementation Status** section is the clearest statement of what
exists: TIER 1 (callable) done; TIER 2 (complexity classification), TIER 3 (token tracking),
TIER 4 (consciousness learning) marked ⏳ Phase 2/3 — **not built**.

Confirmed aspirational by direct check:

| claimed | reality |
|---|---|
| `JUPITER/package.json` scripts `hekat:l1/l3/l5/l7` → `scripts/hekat-l*-example.ts` | `JUPITER/scripts/` **does not exist** |
| `detectHekatLevel()`, `assignAgents()`, `cacheStrategy()` in `HEKAT-INTEGRATION.md` | fenced TypeScript **in a doc**, not in `JUPITER/src/` |
| HEKAT complexity routing | prose only |

Confirmed real, by contrast: `cc2.0/src/functions/{observe,reason,create,verify}/` and
`JUPITER/src/{core,industries,mappings}/` are present and test-covered. It is specifically the
**HEKAT orchestration layer** that is prose.

## L1–L7 carries three incompatible definitions

Same labels, three different formulas, across three documents:

1. **`~/.claude/commands/hekat.md`** — token-budget and agent-count bands.
   *"L1: Ultra-Fast (600-1200 tokens), 1 agent"* … *"L7: Full Ensemble (12000-22000 tokens), 7+ agents"*.
2. **`JUPITER/docs/HEKAT-INTEGRATION.md`** — industry × function combinatorics.
   *"L1: Novice (Single Function, Single Industry)"* … *"L7: Genius (Universal Categorical
   Abstractions)"*, routed by `detectHekatLevel()` on `industries.length` / `functions.length` /
   an `abstraction` flag. **No token budget appears in that function at all.**
3. **`cc2.0/docs/theory/L7-HEKAT-SPECIFICATION-QUERY.md`** — no tier definition. It declares
   *"Orchestration Level: L7 (maximum complexity)"* and proceeds. L7 there means "this is hard,
   use the big ensemble".

These do not reconcile. A tier is therefore **not modelled** in `hotkeys.ts` — the conflict is
recorded as `TIER_DEFINITIONS_CONFLICT` instead. Choosing the canonical definition is a product
decision; encoding a guess would give the tier a type it has not earned.

## There is no type system to integrate with

HEKAT's surface is bracket-and-flag syntax over free text. Verbatim from `hekat.md`:

```
/hekat @mode:iterative [R>=>D>=>I] @quality:0.85
/hekat @skills:discover(domain=AUTH,relevance>0.7) "build authentication"
/hekat [P:R||D||A] "compare databases"
```

`@budget:18K`, `@quality:0.85`, `@tier:L5` are the only typed-looking values, and they are
untyped strings parsed by convention — no declared grammar or schema anywhere in the corpus.

Where JUPITER *does* have real types (`interface Functor<C1,C2>`, `interface Monad<M>` at
`JUPITER/docs/SPECIFICATIONS.md:42,69`) they belong to CC2.0's seven functions, and the docs never
formally connect them to HEKAT's query surface.

## Composition is asserted, never checked

Three notations used interchangeably: sequential `[R→D→I]`, parallel `[R||D||A]`, Kleisli-flavoured
iterative `[R>=>D>=>I]`. Nothing constrains which hotkey may follow which.

The nearest thing to a composition law is `L7-HEKAT-SPECIFICATION-QUERY.md:37`:

```
F(OBSERVE) = category-master ⊗ systems-thinking ⊗ abstraction-principles
```

That asserts composition is licensed by tensor structure. **No checker exists** — not at build
time, not at runtime. Likewise *"Categorical coherence: ≥0.95"* is a threshold on a quantity whose
type is never declared, so nothing prevents an agent from performing exactly the `Level → Prob`
division that `question-bank/colors.ts` forbids on measured grounds (P14, L17).

## fp-ts is already a bridge nobody crosses

- `cc2.0/package.json` depends on `fp-ts@^2.16.2` — real.
- Exactly **one** file imports it: `cc2.0/src/core/category/FpTsInterop.ts`.
- **Zero** files import that file.
- The real `Either`, `Functor`, `Monad` in `cc2.0/src/core/category/` are hand-rolled with no
  fp-ts import.
- CC2.0's own CLAUDE.md: *"Philosophy: use fp-ts where it solves real problems, not everywhere."*
  Currently it solves none.
- Of CC2.0's seven functions with categorical labels (Comonad / Functor / Applicative / IO-Monad /
  Profunctor), **four are marked "📋 Spec only"** — prose, not code.

Practical note for anyone importing it here: fp-ts 2.x publishes no `exports` map and ships CJS
under `lib/`, so `import … from 'fp-ts/Either'` is a **directory import** that pure ESM rejects with
`ERR_UNSUPPORTED_DIR_IMPORT`. Use `'fp-ts/lib/Either.js'`; the CJS interop namespace-imports
cleanly and `chain`/`match` work as expected.

## Operads: one bullet

`JUPITER/docs/SPECIFICATIONS.md:703`, under *"### Advanced Categorical Structures"*, in a list of
future work beside "2-Categories", "Enriched categories", "Topos theory applications":

```
- Operad structures
```

That is the entire operad content of the corpus. No definition, no example, no mention of colours.
So `question-bank/colors.ts` is not integrating with an existing treatment — **it is the only one
that exists.**

## What was built here instead

Given the above, "integrate HEKAT with fp-ts and the coloured operad" cannot mean wiring two
implementations together. It means building the typed layer HEKAT describes and does not have. The
smallest real version:

- **`hotkeys.ts`** — the twelve TIER-1 hotkeys with declared input and output colours. Two disjoint
  colour families, because most hotkeys emit **artifacts** (`Query`, `Findings`, `Spec`, `Code`,
  `Report`, `Plan`) rather than judgements. Coercing `[R] Research` into a `Prob` would assert the
  same false commensurability L17 records.
- **The bridge** — `[V] Verify`, `[C] Code-review`, `[T] Test` emit judgements, so their outputs are
  decision-coloured and enter `colors.ts`'s algebra. Those three are also exactly where a
  typed-decision call could substitute for an agent. `[V]` is the strongest candidate: literal,
  single-state, one claim at a time. `[T]` is the weakest — *running* a suite is code, not a
  judgement; predicting whether it passes is a judgement and a much worse one.
- **`check-chain.ts`** — parses all three notations and validates the chain, returning
  `Either<Violation[], TypedChain>`. This is the one place fp-ts earns its keep: a validation that
  either yields a typed result or a list of violations is exactly `Either`.

Worked examples:

```
[R→D→I]        LEGAL   Findings → Spec → Code
[R||A]→S→D     LEGAL   (Findings + Report) → Report → Spec
[I→R]          ILLEGAL Implement consumes Spec but receives Query
[D→I→C→D]      ILLEGAL Design consumes Query|Findings|Report but receives Level
```

The last one is the cross-boundary catch: a severity **Level** from code-review feeding a design
step, caught by the same coercion table that caught this project's own `density / 3` bug.

## Open, needing a decision that is not mine

1. **Which L1–L7 definition is canonical?** Until one is chosen, tiers stay untyped.
2. **Are the declared hotkey signatures right?** They are *proposed* — HEKAT defines none, so these
   are the smallest set that makes chains checkable. `[A] Analyze` accepting a raw `Query` was a
   correction made after `[R||A]` was wrongly rejected; there may be more such gaps.
3. **Should `checkComposition` gate execution, or only warn?** It currently only reports.
