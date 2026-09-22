/**
 * cookbooks/_shared/readme.ts — write cookbooks/<domain>/README.md and cookbooks/README.md from the result files.
 *
 *   /opt/homebrew/bin/node cookbooks/_shared/readme.ts
 *
 * Prose comes from stories.ts, numbers from load.ts (kit results + decide.ts output). Nothing is typed by hand.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMAINS, load, ROOT, type Loaded } from './load.ts';
import { STORIES } from './stories.ts';
import { bounded, calibrationNote, gateRows, suiteSummary } from './present.ts';

const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(1)}%`);
const pf = (p: number) => (p < 0.001 ? p.toExponential(1) : String(+p.toPrecision(2)));
const reading = (p: { p: number; b: number; c: number }, other: string) => (p.p < 0.05 ? (p.b > p.c ? 'Jev better' : `${other} better`) : 'no difference shown');
const ins = (q: any) => (typeof q.instructions === 'string' ? q.instructions : JSON.stringify(q.instructions));

const licenceBox = (L: Loaded) => { const x = STORIES[L.id].licence; return `> **Licence: ${x.terms}.** ${x.use}  \n> *Verified:* ${x.verified}`; };
const mWarn = (L: Loaded) => { const n = Object.entries(L.questions).filter(([, q]: [string, any]) => q.type === 'noul' && !(q.criteria && q.criteria.true !== undefined && q.criteria.false !== undefined)).length; return n ? `; ${n} M6 warning(s): nouls without criteria.true/false, left as measured rather than reworded after the test` : ''; };
function readme(L: Loaded): string {
  const S = STORIES[L.id], V = S.verdict(L), d = L.decision, f = d.forced, g = d.gated;
  const qRow = (id: string) => L.quality.test.find(r => r.question === id);
  const rule = L.kind === 'binary'
    ? `Binary. A logistic regression (L2, λ = 1, fitted on the 100 fit items) over ${L.frozen.features.map((x: string) => `\`${x}\``).join(', ')}.\n\nFrozen weights: ${Object.entries(L.frozen.weights).map(([k, v]) => `\`${k}\` ${v}`).join(' · ')} · bias ${L.frozen.bias}.\n\nDecide "yes" when the score ≥ **${L.frozen.threshold.t}**; act automatically outside the escalate band **[${L.frozen.band.lo}, ${L.frozen.band.hi})**, send the band to a human.`
    : `Choice. The decision is Jev's pick on \`${L.target}\`. Act automatically when TypeSafe's confidence, (k·peak − 1)/(k − 1), is ≥ **${L.frozen.gate.confidenceAtLeast}**; send the rest to a human.`;
  const why = L.kind === 'binary' ? `- **Cut:** ${L.frozen.threshold.how}. ${L.frozen.threshold.why}\n- **Band:** widest band whose auto-decided fit items stayed within ${pct(L.frozen.band.maxAutoError)} error (fit coverage ${pct(L.frozen.band.fitCoverage)}, fit error ${pct(L.frozen.band.fitAutoError)}). ${L.frozen.band.why}`
    : `- **Gate:** lowest confidence at which auto-accepted fit items stayed within ${pct(L.frozen.gate.maxAutoError)} error (fit coverage ${pct(L.frozen.gate.fitCoverage)}, fit error ${pct(L.frozen.gate.fitAutoError)}). ${L.frozen.gate.why}`;
  const kw = new Map(d.strata.map(s => [JSON.stringify(s.label), s]));
  return `# ${S.title} (${S.area})

> ${S.oneLine}

${licenceBox(L)}

**Gate suite (kit/standard-gate.ts): ${suiteSummary(L).verdict}**${suiteSummary(L).refusing.length ? ` (refused by ${suiteSummary(L).refusing.join(', ')}; ${suiteSummary(L).codes.join(', ')})` : ''}${suiteSummary(L).warnings.length ? ` · warnings: ${suiteSummary(L).warnings.join(', ')}` : ''} · post-hoc headline vs naive Bayes: **${suiteSummary(L).posthocVerdict}**${suiteSummary(L).posthocCodes.length ? ` (${suiteSummary(L).posthocCodes.join(', ')})` : ''}. Details: [results/gates.json](results/gates.json) and the Gates section below.

**Verdict: ${V.label}.** ${V.text}

Page: [demo/${L.id}.html](../../demo/${L.id}.html)${existsSync(join(ROOT, L.id, 'NOTES.md')) ? ' · detailed data notes: [NOTES.md](NOTES.md)' : ' · data notes: the header of [prepare.ts](prepare.ts)'}

## The problem
${S.problem}

**Data:** [${S.dataset.name}](${S.dataset.url}). **Licence:** ${S.dataset.licence}.${S.dataset.licenceNote ? ` ${S.dataset.licenceNote}` : ''}
${S.dataset.citation}

**What Jev reads:** ${S.stateNote}

## Question module
The registry form of this set is [context.json](context.json) (kit/modules format, feat/kit; passes meta-type M1–M7 with 0 errors${mWarn(L)}). The runnable kit spec is [spec.json](spec.json); both carry the same measured wording.

| id | type | purpose | polarity |
|---|---|---|---|
${Object.entries(L.questions).map(([id, q]) => `| \`${id}\` | ${q.type} | ${(S.roles[id] ?? '').replace(/\|/g, '\\|')} | ${L.polarity[id]} |`).join('\n')}

## The question set (as measured)
One call per item, all questions batched (P31). "ends" = the share of test answers that reached a confident end (kit label-free quality report).

| question | type | instructions | role / polarity | test quality |
|---|---|---|---|---|
${Object.entries(L.questions).map(([id, q]) => `| \`${id}\`${id === L.target ? ' **(decision)**' : ''} | ${q.type}${q.type === 'choice' ? ` (${Object.keys(q.criteria).join(', ')})` : ''} | ${ins(q).replace(/\|/g, '\\|')} | ${(S.roles[id] ?? '').replace(/\|/g, '\\|')} | ${qRow(id)?.verdict ?? ''}, ends ${qRow(id) ? Math.round(qRow(id)!.atEnds * 100) : '–'}% |`).join('\n')}

Why these are literal: each asks about the one record in front of Jev, answerable by reading it: no counting, arithmetic, dates, cross-record comparison or degree judgement (NETER P18, P21; L37). Every choice has an escape option (P5).

**What the label-free quality pass changed**
${S.changes.map(c => `- ${c}`).join('\n')}

## Not for Jev
| judgement | instead |
|---|---|
${S.notForJev.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}

## The decision rule
${rule}

**How the thresholds were chosen** (fit split only, frozen in [rule.frozen.json](rule.frozen.json) and committed before any test call):
${why}

## Results (test split, n = ${d.n}, one labelled run, \`${L.model}\`, answered by \`${L.answeredBy.join(', ')}\`)

| system | accuracy (all items) | vs Jev rule: only Jev right / only other right | exact McNemar p | reading |
|---|---|---|---|---|
| **Jev, frozen rule** | **${pct(f.jevAccuracy)}** | | | |
${L.direct && L.kind === 'binary' ? `| Jev, one broad question \`${L.direct.question}\` (kit scorecard, p ≥ 0.5) | ${pct(L.direct.accuracy)} | vs keywords: ${L.direct.vsBaseline.b} / ${L.direct.vsBaseline.c} | ${pf(L.direct.vsBaseline.p)} | ${reading(L.direct.vsBaseline, 'keywords')} (vs keywords) |\n` : ''}| Keyword lists, fit split only (**declared baseline**) | ${pct(f.baselineAccuracy)} | ${f.vsBaseline.b} / ${f.vsBaseline.c} | ${pf(f.vsBaseline.p)} | ${reading(f.vsBaseline, 'keywords')} |
| Naive Bayes on ${L.strong.trainN} labelled rows (**post-hoc**) | ${pct(L.strong.forced.accuracyB)} | ${L.strong.forced.b} / ${L.strong.forced.c} | ${pf(L.strong.forced.p)} | ${reading(L.strong.forced, 'naive Bayes')} |
| Majority class ("${String(d.majority)}", from fit) | ${pct(f.majorityAccuracy)} | ${f.vsMajority.b} / ${f.vsMajority.c} | ${pf(f.vsMajority.p)} | ${reading(f.vsMajority, 'majority')} |

**Coverage:** Jev answered ${L.items.filter(i => i.pred !== null).length}/${d.n}. **Gated:** the frozen gate acted on ${pct(g.coverage)} (${g.autoN}) at ${pct(g.autoAccuracy)} accuracy and held ${g.escalated} for a human; on those same auto-decided items the keyword lists scored ${pct(g.baselineOnSameItems)}.${g.vsBaselineOnSameItems ? ` (McNemar ${g.vsBaselineOnSameItems.b}/${g.vsBaselineOnSameItems.c}, p = ${pf(g.vsBaselineOnSameItems.p)})` : ''}

**By true label (L41: a pooled result must not hide a stratum going the other way)**

| label | n | Jev | keywords | p | naive Bayes | p |
|---|---|---|---|---|---|---|
${L.strong.strata.map(s => { const k = kw.get(JSON.stringify(s.label))!; return `| ${String(s.label)} | ${s.n} | ${pct(s.jev)} | ${pct(k.baseline)} | ${pf(k.p)} | ${pct(s.strong)} | ${pf(s.p)} |`; }).join('\n')}

Sources: [results/test.json](results/test.json) (kit), [results/decision-test.json](results/decision-test.json) (frozen rule), [results/strong-baseline-test.json](results/strong-baseline-test.json) (post-hoc). Fit: [results/fit.json](results/fit.json); pilot: [results/pilot.json](results/pilot.json). Calls: pilot ${L.calls.pilot}, fit ${L.calls.fit}, test ${L.calls.test}.

The naive Bayes was added after the test run, because the declared keyword lists (fitted on 100 items) were near chance in several domains. It does not alter the declared comparison (the keyword row above); it answers "would a cheap model with far more labels have done as well?", and where that changes the practical verdict (job-postings), the verdict line says so.

## Gates
Standard suite from [results/gates.json](results/gates.json) (\`cookbooks/_shared/gates.ts\`, no Jev calls). G5–G7 test the **declared** headline: the frozen rule vs the fit-only keyword lists, with true labels as strata (they partition the headline; Holm-corrected).

| gate | verdict | why |
|---|---|---|
${gateRows(L).map(r => `| ${r.id} | ${r.verdict}${r.code ? ` (${r.code})` : ''} | ${r.why.replace(/\|/g, '\\|')} |`).join('\n')}

**Post-hoc headline** (frozen rule vs naive Bayes): suite **${suiteSummary(L).posthocVerdict}**${suiteSummary(L).posthocWhy ? `: ${suiteSummary(L).posthocWhy}` : ''}.

### Bounded gate (POST-HOC, kit/threshold.ts)
The method was chosen after the test run: \`fitSelective\` on the fit readings, \`applyGate\` once on the test readings, \`bootstrapCuts\` for stability. The frozen rule stays the record beside it.

| | score | budget | cuts (fitted on fit) | fit coverage | test coverage | test error (95% upper) | bound held | stable |
|---|---|---|---|---|---|---|---|---|
| **post-hoc bounded gate** | ${bounded(L).score} | ${pct(bounded(L).maxError)} | ${bounded(L).cuts} | ${pct(bounded(L).fitCoverage)} | ${pct(bounded(L).testCoverage)} | ${bounded(L).testCoverage ? `${pct(bounded(L).testError)} (${pct(bounded(L).testErrorUpper)})` : '–'} | ${bounded(L).held === null ? 'n/a: nothing auto-decided' : bounded(L).held ? 'yes' : '**no**'} | ${bounded(L).unstable ? 'no (G8.unstable)' : 'yes'} |
| frozen rule (record) | | | | | ${pct(L.decision.gated.coverage)} | ${pct(L.decision.gated.autoAccuracy === null ? null : 1 - L.decision.gated.autoAccuracy)} | no bound was promised | |

${bounded(L).text}

**Calibration:** ${calibrationNote(L)}

## Where it fails
${S.fails(L).map(x => `- ${x}`).join('\n')}

## Honest limits
${S.limits.map(x => `- ${x}`).join('\n')}
- The regression and its cut are fitted on the same 100 fit items, so fit-split numbers are optimistic; only the test numbers above are claims.
- n = ${d.n}: differences of a few points are not detectable; per-label numbers are small samples.

## Reproduce
\`\`\`bash
cd JEV-works && source ~/.zshrc >/dev/null 2>&1
node cookbooks/${L.id}/prepare.ts                        # fetch + build spec.json (seeded; byte-identical)
node kit/run.ts cookbooks/${L.id}/spec.json --dry-run    # privacy scan, disjointness, call count
node kit/run.ts cookbooks/${L.id}/spec.pilot.json        # label-free quality pass (30 calls)
node kit/run.ts cookbooks/${L.id}/spec.fit.json  --out cookbooks/${L.id}/results/fit.json
node cookbooks/_shared/decide.ts cookbooks/${L.id} fit  cookbooks/${L.id}/results/fit.json    # freezes rule.frozen.json
node kit/run.ts cookbooks/${L.id}/spec.json      --out cookbooks/${L.id}/results/test.json
node cookbooks/_shared/decide.ts cookbooks/${L.id} test cookbooks/${L.id}/results/test.json   # scored once
STRONG_BASELINE=1 node cookbooks/${L.id}/prepare.ts && node cookbooks/_shared/compare-strong.ts cookbooks/${L.id}
\`\`\`
Use \`/opt/homebrew/bin/node\` (v25). decide.ts refuses to re-fit a frozen rule or re-score a test.
`;
}

const all = DOMAINS.map(load);
for (const L of all) writeFileSync(join(ROOT, L.id, 'README.md'), readme(L));
const calls = all.reduce((s, L) => s + L.calls.pilot + L.calls.fit + L.calls.test, 0);
writeFileSync(join(ROOT, 'README.md'), `# Jev cookbooks: six domains on public data

Each cookbook asks Jev (TypeSafe's typed-decision model) a small set of literal questions about real public records, fits every threshold on a fit split, and scores the frozen rule **once** on 150 held-out items against a declared keyword baseline (fitted on the fit split only) and, post-hoc, a naive Bayes trained on 10–20× more labels. Paired exact McNemar throughout (kit/stats.ts). Pages: [demo/index.html](../demo/index.html).

| domain | data (licence) | question set | Jev rule | keywords (declared) | naive Bayes (post-hoc) | frozen gate: acts on / accuracy | bounded gate (post-hoc): acts on / held | gate suite · vs NB | verdict |
|---|---|---|---|---|---|---|---|---|---|
${all.map(L => { const S = STORIES[L.id], f = L.decision.forced, V = S.verdict(L); return `| [${S.title}](${L.id}/README.md) (${S.area}) | [${S.dataset.name.split(' (')[0]}](${S.dataset.url}) (${S.dataset.licence}) | ${Object.entries(L.questions).map(([id, q]) => `\`${id}\` ${q.type}`).join(', ')} | **${pct(f.jevAccuracy)}** | ${pct(f.baselineAccuracy)} (p = ${pf(f.vsBaseline.p)}) | ${pct(L.strong.forced.accuracyB)} (p = ${pf(L.strong.forced.p)}) | ${pct(L.decision.gated.coverage)} / ${pct(L.decision.gated.autoAccuracy)} | ${pct(bounded(L).testCoverage)} / ${bounded(L).held === null ? 'n/a' : bounded(L).held ? 'held' : 'broke'} | ${suiteSummary(L).verdict}${suiteSummary(L).codes.length ? ` (${suiteSummary(L).codes.join(', ')})` : ''} · ${suiteSummary(L).posthocVerdict}${suiteSummary(L).posthocCodes.length ? ` (${suiteSummary(L).posthocCodes.join(', ')})` : ''} | **${V.label}** |`; }).join('\n')}

n = 150 test items per domain; accuracy counts every item; coverage (answered) was 100% everywhere. ${calls} Jev calls in total (pilot + fit + test), \`${all[0].model}\`, answered by \`${[...new Set(all.flatMap(L => L.answeredBy))].join(', ')}\`.

## Method (identical in every domain)
1. \`prepare.ts\` fetches the public data by URL, masks emails and phone numbers, and draws 100 fit + 150 test items with seed 20260922 (disjoint by id and text; the kit refuses overlap). The keyword baseline is fitted on the fit split only.
2. Questions are literal, about one record, typed, with declared polarity and an escape option on every choice. A 30-item label-free pilot rates each question; MOVE-TO-CODE / NO-INFORMATION questions are reworded or moved to the Not-for-Jev list **before** any labelled run.
3. The fit run's answers fit the decision rule (\`_shared/decide.ts\`): a logistic regression + cost- or precision-based cut + an escalate band for binary tasks, a confidence gate for choices, each within a stated error budget. The rule is frozen and committed before any test call.
4. One labelled test run per domain; the frozen rule is applied once; results never overwritten.

Each domain also has \`context.json\`, the same questions in the kit/modules registry format, linted with \`node kit/modules/cli.ts lint\`: M1–M7 pass in all six (0 errors; 23 M6 warnings, nouls without criteria.true/false, left as measured). Each README's Gates section carries the standard suite (kit/standard-gate.ts, results/gates.json) and a post-hoc bounded gate from kit/threshold.ts (fitSelective, applyGate, bootstrapCuts) on the already-collected readings.

Git order (after the rebase onto main): questions and splits (c39d097) → pilot, fit, frozen rules (d980b77) → test results (c6c5329).

## Changes made by the quality pass
${all.map(L => STORIES[L.id].changes.map(c => `- **${L.id}:** ${c}`).join('\n')).join('\n')}

## Shared code
- \`_shared/lib.ts\`: cached public fetch, seeded stratified sampling, masking, keyword and naive Bayes baselines, spec writer.
- \`_shared/decide.ts\`: fit / freeze / apply-once decision rules. \`_shared/compare-strong.ts\`: post-hoc baseline comparison.
- \`_shared/load.ts\`, \`_shared/stories.ts\`, \`_shared/readme.ts\`, \`../demo/build.ts\`: pages and READMEs generated from result files.

\`kit/threshold.ts\` did not exist on main or feat/op-consist when this was built, so thresholds use decide.ts's documented methods.
`);
console.log(`wrote ${all.length} READMEs + cookbooks/README.md`);
