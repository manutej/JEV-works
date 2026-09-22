/**
 * kit/run.ts — run any Jev question set from one JSON spec (see kit/README.md, kit/spec.schema.json).
 *
 *   node kit/run.ts <spec.json> [--dry-run] [--concurrency N] [--out path] [--accept-overlap]
 *
 * Order, every time: validate spec → privacy scan → text-level disjointness → (dry-run stops here) →
 * ask Jev → report. Two report modes, chosen by the data, not a flag:
 *   no labels  → question quality (label-free): JEV-SAFE / MARGINAL / MOVE-TO-CODE / NO-INFORMATION per question
 *   labels     → per-question accuracy AND coverage vs majority class and any supplied baseline, exact McNemar (I6)
 * Result files are never overwritten.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { summariseSet, renderTable, defects, type Reading } from '../question-bank/confidence.ts';
import { askAll, type Row } from './ask.ts';
import { isCorrect, majorityOf } from './score.ts';
import { g1SpecValid, g2Privacy, g3TextDisjoint, g4Coverage, renderSuite, suite, type GateResult } from './standard-gate.ts';
import { loadSpec, type Item, type Label, type Spec } from './spec.ts';
import { paired, type Paired } from './stats.ts';

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const specPath = args.find(a => a.endsWith('.json') && a !== opt('--out'));
if (!specPath) { console.error('usage: node kit/run.ts <spec.json> [--dry-run] [--concurrency N] [--out path] [--accept-overlap]'); process.exit(64); }

function resultPath(spec: Spec): string {
  const explicit = opt('--out');
  if (explicit) { if (existsSync(explicit)) throw new Error(`${explicit} exists; result files are never overwritten`); return explicit; }
  const dir = join(import.meta.dirname, 'results');
  mkdirSync(dir, { recursive: true });
  const base = `${spec.name}-${new Date().toISOString().slice(0, 10)}`;
  for (let k = 0; ; k++) { const p = join(dir, `${base}${k ? `-${k + 1}` : ''}.json`); if (!existsSync(p)) return p; }
}

// ---------------------------------------------------------------- pre-flight

let spec: Spec;
try { spec = loadSpec(specPath); }
catch (e) { console.error((e as Error).message); console.error(renderSuite(suite([{ ...g1SpecValid({}), why: 'spec rejected (see problems above)' }]))); process.exit(65); }
const gates: GateResult[] = [{ id: 'G1-spec-valid', stage: 'preflight', verdict: 'PASS', why: 'spec is valid', evidence: {} }];
const qids = Object.keys(spec.questions);
const hasSplit = spec.items.some(i => i.split);
const scored: Item[] = hasSplit ? spec.items.filter(i => i.split === 'test') : spec.items;
console.log(`spec ${spec.name}: ${qids.length} questions × ${scored.length} items${hasSplit ? ` (test split; ${spec.items.length - scored.length} fit)` : ''}`);

const g2 = g2Privacy(scored, spec.privacyScan !== false);
gates.push(g2);
if (g2.verdict === 'REFUSE') {
  const hits = (g2.evidence.hits as { itemId: string; kind: string }[]);
  console.error(`REFUSED (G2-privacy): ${hits.length} hit(s) in states bound for an external API: ` +
    hits.slice(0, 10).map(h => `${h.itemId}:${h.kind}`).join(', ') + '. Remove them, or set "privacyScan": false with a reason.');
  process.exit(3);
}
console.log(g2.verdict === 'PASS' ? 'privacy scan: 0 hits' : `privacy: ${g2.why}`);
const g3 = g3TextDisjoint(spec.items, { accepted: flag('--accept-overlap') });
gates.push(g3);
const disj = g3.verdict === 'SKIP' ? null : (g3.evidence as { fit: number; test: number; idOverlap: number; textOverlap: number; seenShare: number });
if (disj) console.log(`disjointness: fit ${disj.fit} / test ${disj.test} · id overlap ${disj.idOverlap} · text overlap ${disj.textOverlap} (${(disj.seenShare * 100).toFixed(1)}% seen)`);
if (g3.verdict === 'REFUSE') {
  console.error('REFUSED (G3-text-disjoint): the test split overlaps the fit split (L31/L40). Fix the split, or rerun with --accept-overlap and report seen vs novel.');
  process.exit(4);
}
const calls = scored.length;
console.log(`plan: ${calls} Jev calls (${qids.length} questions batched per call, P31)`);
if (flag('--dry-run')) { console.log('dry run: no calls made.'); process.exit(0); }

// ---------------------------------------------------------------- ask

const t0 = performance.now();
const { rows, model } = await askAll(spec, scored, { concurrency: Number(opt('--concurrency') ?? 4) });
const wallMs = Math.round(performance.now() - t0);
const byId = new Map<string, Row>(rows.map(r => [r.id, r]));
const answered = rows.filter(r => r.answers).length;
const coverage = answered / (rows.length || 1);
console.log(`\n${answered}/${rows.length} answered · wall ${wallMs}ms · model ${model} · answeredBy ${[...new Set(rows.map(r => r.answeredBy).filter(Boolean))].join(',')}`);

// ---------------------------------------------------------------- label-free: question quality

const byQuestion: Parameters<typeof summariseSet>[0] = {};
for (const id of qids) {
  const q = spec.questions[id];
  const readings: Reading[] = rows.flatMap((r): Reading[] => {
    const a = r.answers?.[id];
    if (!a) return [];
    if (a.type === 'noul') return [{ p: a.p }];
    if (a.type === 'score') return [{ level: a.score }];
    return [{ key: a.choice, p: a.probabilities[a.choice], entropy: a.entropy }];
  });
  byQuestion[id] = {
    kind: q.type === 'noul' ? 'boolean' : q.type,
    levels: q.type === 'score' ? q.criteria.length : undefined,
    optionCount: q.type === 'choice' ? Object.keys(q.criteria).length : undefined,
    readings,
  };
}
const quality = summariseSet(byQuestion);
console.log('\nquestion quality (label-free: are the questions ANSWERABLE, not are the answers right)');
console.log(renderTable(quality));
const { moveToCode, noInformation } = defects(quality);
if (moveToCode.length) console.log(`MOVE-TO-CODE: ${moveToCode.map(r => r.question).join(', ')}: never decisive; compute these in code.`);
if (noInformation.length) console.log(`NO-INFORMATION: ${noInformation.map(r => r.question).join(', ')}: answered the same way every time.`);

// ---------------------------------------------------------------- labelled: accuracy + coverage + paired tests

type Scorecard = {
  question: string; n: number; coverage: number; accuracy: number;
  majority?: { label: Label; fittedOn: 'fit split' | 'scored items (in-sample)'; accuracy: number; vsJev: Paired };
  baseline?: { name: string; accuracy: number; vsJev: Paired };
};
const scorecards: Scorecard[] = [];
for (const id of qids) {
  const q = spec.questions[id];
  const lab = scored.filter(i => i.labels && id in i.labels);
  if (!lab.length) continue;
  const jev = lab.map(i => isCorrect(q, byId.get(i.id)?.answers?.[id], i.labels![id]));
  const cov = lab.filter(i => byId.get(i.id)?.answers?.[id]).length / lab.length;
  const card: Scorecard = { question: id, n: lab.length, coverage: cov, accuracy: jev.filter(Boolean).length / lab.length };
  const fitLabels = spec.items.filter(i => i.split === 'fit' && i.labels && id in i.labels).map(i => i.labels![id]);
  const maj = majorityOf(fitLabels.length ? fitLabels : lab.map(i => i.labels![id]));
  if (maj !== undefined) {
    const m = lab.map(i => JSON.stringify(i.labels![id]) === JSON.stringify(maj));
    card.majority = { label: maj, fittedOn: fitLabels.length ? 'fit split' : 'scored items (in-sample)', accuracy: m.filter(Boolean).length / lab.length, vsJev: paired(jev, m) };
  }
  const withBase = lab.filter(i => i.baseline && id in i.baseline);
  if (withBase.length === lab.length) {
    const b = lab.map(i => JSON.stringify(i.baseline![id]) === JSON.stringify(i.labels![id]));
    card.baseline = { name: spec.baselineName ?? 'baseline', accuracy: b.filter(Boolean).length / lab.length, vsJev: paired(jev, b) };
  } else if (withBase.length) console.log(`note: ${id}: baseline given on ${withBase.length}/${lab.length} labelled items; skipped (a paired test needs all).`);
  scorecards.push(card);
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const verdict = (p: Paired, other: string) => p.different ? (p.b > p.c ? 'Jev better' : `${other} better`) : 'no difference shown';
if (scorecards.length) {
  console.log('\naccuracy over ALL scored items (non-answers count wrong) · paired exact McNemar (I6)');
  for (const c of scorecards) {
    console.log(`  ${c.question}: n=${c.n} · Jev ${pct(c.accuracy)} · coverage ${pct(c.coverage)}`);
    if (c.majority) console.log(`    vs majority "${String(c.majority.label)}" (${c.majority.fittedOn}) ${pct(c.majority.accuracy)} · b=${c.majority.vsJev.b} c=${c.majority.vsJev.c} p=${c.majority.vsJev.p} → ${verdict(c.majority.vsJev, 'majority')}`);
    if (c.baseline) console.log(`    vs ${c.baseline.name} ${pct(c.baseline.accuracy)} · b=${c.baseline.vsJev.b} c=${c.baseline.vsJev.c} p=${c.baseline.vsJev.p} · Δ CI95 [${c.baseline.vsJev.deltaCI95.map(x => x.toFixed(3)).join(', ')}] → ${verdict(c.baseline.vsJev, c.baseline.name)}`);
  }
} else console.log('\nno labels: label-free report only. Accuracy needs labels (NETER P20).');

// ---------------------------------------------------------------- gate + write

const minCov = spec.gate?.minCoverage;
gates.push(g4Coverage(coverage, minCov));
const gateReport = suite(gates);
console.log('\n' + renderSuite(gateReport));
const gate = minCov === undefined ? 'none' : gateReport.refusing.includes('G4-coverage') ? 'REFUSE' : 'PASS';
const out = resultPath(spec);
writeFileSync(out, JSON.stringify({
  kit: 1, spec: spec.name, specPath, model, answeredBy: [...new Set(rows.map(r => r.answeredBy).filter(Boolean))],
  startedAt: new Date(Date.now() - wallMs).toISOString(), wallMs, calls: rows.length, coverage,
  privacyScan: spec.privacyScan === false ? 'disabled by spec' : 'passed', disjointness: disj,
  gate: { minCoverage: minCov ?? null, verdict: gate }, gates: gateReport, quality, scorecards,
  items: rows.map(r => ({ ...r, correct: Object.fromEntries(qids.flatMap(id => {
    const it = scored.find(i => i.id === r.id);
    return it?.labels && id in it.labels ? [[id, isCorrect(spec.questions[id], r.answers?.[id], it.labels[id])]] : [];
  })) })),
}, null, 2) + '\n');
console.log(`\nresults → ${out}`);
process.exit(gate === 'REFUSE' ? 2 : 0);
