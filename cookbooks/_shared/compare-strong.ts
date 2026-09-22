/**
 * cookbooks/_shared/compare-strong.ts — POST-HOC: the frozen Jev decision vs a naive Bayes trained on 10–20× more labels.
 *
 *   node cookbooks/_shared/compare-strong.ts <domainDir>   → <domainDir>/results/strong-baseline-test.json
 *
 * Reads results/decision-test.json (Jev's frozen-rule predictions, already scored once) and baseline.strong.json
 * (written by `STRONG_BASELINE=1 node prepare.ts`). No Jev calls; nothing is re-fitted; the declared comparison against
 * the fit-only keyword baseline stays the test of record. Same paired test as everywhere (kit/stats.ts).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { paired } from '../../kit/stats.ts';
import type { Label } from '../../kit/spec.ts';

const dir = resolve(process.argv[2] ?? '');
const out = join(dir, 'results', 'strong-baseline-test.json');
if (existsSync(out)) { console.error(`REFUSED: ${out} exists`); process.exit(4); }
const dec = JSON.parse(readFileSync(join(dir, 'results', 'decision-test.json'), 'utf8')) as { items: { id: string; label: Label; pred: Label | null; auto: boolean }[] };
const strong = JSON.parse(readFileSync(join(dir, 'baseline.strong.json'), 'utf8')) as { name: string; trainN: number; trainCounts: Record<string, number>; source: string; predictions: Record<string, Label> };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const jev = dec.items.map(d => d.pred !== null && same(d.pred, d.label));
const nb = dec.items.map(d => same(strong.predictions[d.id], d.label));
const all = paired(jev, nb);
const autoIdx = dec.items.map((d, i) => (d.auto ? i : -1)).filter(i => i >= 0);
const onAuto = autoIdx.length ? paired(autoIdx.map(i => jev[i]), autoIdx.map(i => nb[i])) : null;
const strata = [...new Set(dec.items.map(d => JSON.stringify(d.label)))].map(k => {
  const idx = dec.items.map((d, i) => (JSON.stringify(d.label) === k ? i : -1)).filter(i => i >= 0);
  const p = paired(idx.map(i => jev[i]), idx.map(i => nb[i]));
  return { label: JSON.parse(k), n: idx.length, jev: +p.accuracyA.toFixed(3), strong: +p.accuracyB.toFixed(3), b: p.b, c: p.c, p: p.p };
});
const res = { posthoc: true, what: 'frozen Jev decision (forced) vs naive Bayes trained on labelled source rows outside fit and test', strongBaseline: { name: strong.name, trainN: strong.trainN, trainCounts: strong.trainCounts, source: strong.source }, forced: all, gatedSameItems: onAuto, strata };
writeFileSync(out, JSON.stringify(res, null, 2) + '\n');
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`${dir.split('/').pop()}: Jev ${pct(all.accuracyA)} vs NB(${strong.trainN}) ${pct(all.accuracyB)} · b=${all.b} c=${all.c} p=${all.p}${onAuto ? ` · on Jev's auto items: ${pct(onAuto.accuracyA)} vs ${pct(onAuto.accuracyB)} p=${onAuto.p}` : ''}`);
for (const s of strata) console.log(`  ${JSON.stringify(s.label)} n=${s.n}: Jev ${pct(s.jev)} vs NB ${pct(s.strong)} (b=${s.b} c=${s.c} p=${s.p})`);
