# DESIGN_POSITION — Jev over marketing copy

A question set for one literal state: a headline and the text directly under it. Built to read the
CETI site passes against `site-spec/` (position, language, voice) without asking Jev anything
relational. Status: **drafted, run once** (48 states, `jev-1.13.0` direct, 2026-09-30).

```bash
set -a && source .env && set +a          # TYPESAFE_API_KEY, never committed
node design-position.mjs                 # states.json in, run.jsonl out, tables on stdout
```

## Questions (all literal, one judgement each)

| id | kind | asks |
|---|---|---|
| `teamImplied` | boolean | headline alone: could a stranger read it as a firm arriving with a team to transform the company |
| `limitStated` | boolean | does the text under the headline define or limit the claim |
| `readerFirst` | boolean | does it open on the reader's situation before the service |
| `staffImplied` | boolean | does the wording imply more than one practitioner |
| `oneJob` | boolean | does it say the unit of work is one job the company already does |
| `toolsOwned` | boolean | does it say the work runs in tools the company already pays for |
| `register` | choice | pitch / explanation / teaching / manifesto |
| `hype` | score 0–3 | sells vs explains |

## notForJev

- Banned words (`03-language.md`) → regex in code, the baseline. Zero hits across 48 blocks.
- Prices and figures → regex in code. Figures appear from v3 onward.
- Which pass is best → aggregate per pass in code; no cross-item question.

## First run: validity of the questions themselves

| question | at ends | spread | verdict |
|---|---|---|---|
| toolsOwned | 94% | 0.170 | JEV-SAFE |
| limitStated | 81% | 0.374 | JEV-SAFE |
| oneJob | 77% | 0.234 | JEV-SAFE |
| staffImplied | 60% | 0.279 | JEV-SAFE |
| teamImplied | 42% | 0.115 | MARGINAL |
| hype | 33% | 0.258 | MARGINAL |
| readerFirst | 31% | 0.280 | MARGINAL |
| register | 15% | 3/4 keys | MOVE-TO-CODE (max H 0.76) |

`register` never becomes decisive: pitch vs manifesto is a judgement about intent, not a reading of
one block. Drop it or split it into two booleans. `teamImplied` hovers at p 0.1–0.5 on every block,
so the honesty-test flag (`teamImplied >= .85 AND limitStated <= .15`) fired on nothing; the
`limitStated` half of that test is the signal.

## First run: what the copy reads as, per pass

| pass | n | limitStated | oneJob | toolsOwned | hype | figures |
|---|---|---|---|---|---|---|
| spec 05-pages | 5 | 0.90 | 0.40 | 0.22 | 1.43 | 0 |
| Site (spec wording) | 6 | 0.90 | 0.51 | 0.20 | 1.23 | 0 |
| Site v2 | 6 | 0.86 | 0.28 | 0.27 | 1.29 | 0 |
| Site v3 | 7 | 0.59 | 0.07 | 0.06 | 1.89 | 2 |
| Site v4 | 7 | 0.33 | 0.07 | 0.06 | 2.17 | 1 |
| Site v5 (Main) | 9 | 0.29 | 0.07 | 0.05 | 2.28 | 1 |
| Manifesto | 8 | 0.37 | 0.06 | 0.04 | 2.12 | 1 |

Read as one line: the passes with a defined claim under every headline are the spec-worded one
and v2; v3 to v5 and the Manifesto trade the definition for a teaching pitch (twelve weeks,
5,000 people) and score as slogans. This is a reading, not an accuracy claim; there are no labels.
