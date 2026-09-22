/**
 * cookbooks/_shared/selective.ts — POST-HOC: re-fit each domain's gate with kit/threshold.ts (fitSelective + judgeCalibration)
 * on the FIT split's answers, freeze it, and check on the TEST split's answers whether its error bound held.
 *
 *   /opt/homebrew/bin/node cookbooks/_shared/selective.ts      → cookbooks/<domain>/results/selective-posthoc.json
 *
 * Why post-hoc: kit/threshold.ts landed (feat/op-consist) after these cookbooks' rules were frozen and scored. This uses
 * the answers already collected (no Jev calls, nothing re-asked) and does not replace the frozen rule of record.
 * kit/threshold.ts is not on this branch, so it is read from git at a pinned commit into a temp dir and imported.
 *
 * Scores gated:
 *   binary  the frozen logistic score (weights from rule.frozen.json), and the direct noul's raw p where Jev was asked one
 *   choice  TypeSafe confidence on the decision question; "correct" is the event; accept side only (a low confidence
 *           does not predict a particular other class, so there is no reject side)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOMAINS, ROOT } from './load.ts';

const PIN = '756bdef';
const tdir = join(tmpdir(), `jev-threshold-${PIN}`, 'kit');
mkdirSync(tdir, { recursive: true });
for (const f of ['threshold.ts', 'stats.ts']) writeFileSync(join(tdir, f), execFileSync('git', ['show', `${PIN}:kit/${f}`], { cwd: ROOT, encoding: 'utf8' }));
const T = await import(join(tdir, 'threshold.ts')) as typeof import('../../kit/stats.ts') & Record<string, any>;
const { fitSelective, applyGate, judgeCalibration, bootstrapCuts, clopperPearsonUpper } = T;

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const r3 = (x: number | null) => (x === null ? null : +x.toFixed(3));
const conf = (probs: Record<string, number>) => { const v = Object.values(probs), k = v.length; return Math.max(0, Math.min(1, (k * Math.max(...v) - 1) / (k - 1))); };

const summary: string[] = [];
for (const id of DOMAINS) {
  const d = join(ROOT, id), out = join(d, 'results', 'selective-posthoc.json');
  if (existsSync(out)) { console.error(`${id}: ${out} exists; not overwritten`); continue; }
  const frozen = read(join(d, 'rule.frozen.json')), meta = read(join(d, 'items.meta.json')) as { id: string; labels: Record<string, unknown> }[];
  const label = new Map(meta.map(m => [m.id, m.labels[frozen.target]]));
  const rows = (f: string) => (read(join(d, 'results', f)).items as { id: string; answers?: Record<string, any> }[]).filter(r => r.answers);
  const fit = rows('fit.json'), test = rows('test.json');
  const maxErr: number = frozen.kind === 'binary' ? frozen.band.maxAutoError : frozen.gate.maxAutoError;
  const gates: Record<string, unknown>[] = [];

  const binaryGate = (name: string, score: (a: Record<string, any>) => number) => {
    const pf = fit.map(r => score(r.answers!)), yf = fit.map(r => label.get(r.id) === true);
    const pt = test.map(r => score(r.answers!)), yt = test.map(r => label.get(r.id) === true);
    const g = fitSelective(pf, yf, maxErr);
    const o = applyGate(g, pt, yt);
    gates.push({ score: name, maxError: maxErr, calibrationFit: judgeCalibration(pf, yf), calibrationTest: judgeCalibration(pt, yt),
      fitted: { acceptAtOrAbove: r3(g.hi), rejectAtOrBelow: r3(g.lo), fit: g.fit }, stability: bootstrapCuts(pf, yf, maxErr), test: o });
    summary.push(`${id.padEnd(17)} ${name.padEnd(26)} cuts accept≥${g.hi === null ? '–' : g.hi.toFixed(3)} reject≤${g.lo === null ? '–' : g.lo.toFixed(3)} · fit cov ${(g.fit.coverage * 100).toFixed(0)}% · test cov ${(o.coverage * 100).toFixed(0)}% err ${(o.errorRate * 100).toFixed(1)}% (≤${maxErr * 100}%? ${o.held ? 'held' : 'BROKEN'}; CP95 ${(o.errorUpper95 * 100).toFixed(1)}%) · calib fit: ${judgeCalibration(pf, yf).calibrated ? 'ok' : 'no'}`);
  };

  if (frozen.kind === 'binary') {
    const { w, b } = frozen._exact;
    const lr = (a: Record<string, any>) => 1 / (1 + Math.exp(-(b + (frozen.features as string[]).reduce((s, f, j) => {
      const [q, opt] = f.split('='); return s + (opt !== undefined ? (a[q].probabilities[opt] ?? 0) : a[q].p) * w[j];
    }, 0))));
    binaryGate('frozen logistic score', lr);
    if (fit[0].answers![frozen.target]) binaryGate(`direct noul ${frozen.target}`, a => a[frozen.target].p);
  } else {
    const pf = fit.map(r => conf(r.answers![frozen.target].probabilities)), yf = fit.map(r => r.answers![frozen.target].choice === label.get(r.id));
    const pt = test.map(r => conf(r.answers![frozen.target].probabilities)), yt = test.map(r => r.answers![frozen.target].choice === label.get(r.id));
    const g = fitSelective(pf, yf, maxErr);
    const acc = g.hi === null ? [] : pt.map((p, i) => i).filter(i => pt[i] >= g.hi!);
    const errs = acc.filter(i => !yt[i]).length;
    const o = { n: pt.length, coverage: acc.length / pt.length, accepted: acc.length, errors: errs, errorRate: acc.length ? errs / acc.length : 0, errorUpper95: clopperPearsonUpper(errs, acc.length), held: acc.length === 0 || errs / acc.length <= maxErr };
    gates.push({ score: `confidence on ${frozen.target} (event: Jev correct)`, maxError: maxErr, calibrationFit: judgeCalibration(pf, yf), calibrationTest: judgeCalibration(pt, yt),
      fitted: { acceptAtOrAbove: r3(g.hi), fit: { n: g.fit.n, acceptN: g.fit.acceptN, acceptErrors: g.fit.acceptErrors, acceptErrUpper: g.fit.acceptErrUpper, coverage: g.fit.acceptN / g.fit.n } },
      stability: bootstrapCuts(pf, yf, maxErr), test: o });
    summary.push(`${id.padEnd(17)} ${'choice confidence'.padEnd(26)} cut accept≥${g.hi === null ? '– (never)' : g.hi.toFixed(3)} · fit cov ${(g.fit.acceptN / g.fit.n * 100).toFixed(0)}% · test cov ${(o.coverage * 100).toFixed(0)}% err ${(o.errorRate * 100).toFixed(1)}% (≤${maxErr * 100}%? ${o.held ? 'held' : 'BROKEN'}; CP95 ${(o.errorUpper95 * 100).toFixed(1)}%)`);
  }
  writeFileSync(out, JSON.stringify({ posthoc: true, threshold: `kit/threshold.ts @ ${PIN} (feat/op-consist)`, what: 'gate re-fitted with fitSelective on fit answers, applied once to test answers; no Jev calls; frozen rule of record unchanged', gates }, null, 2) + '\n');
}
console.log(summary.join('\n'));
