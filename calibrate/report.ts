/**
 * report.ts — the calibration report over the label store (Step 5).
 *
 *   node --experimental-strip-types calibrate/report.ts [--labels runs/labels] [--exclude ids.json] [--drift runs/drift] [--out calibrate]
 *
 * Per pack × question, by label source (never pooled): n; agreement (hand vs model, implied vs model,
 * hand vs implied where both exist); share of model answers at the ends vs the mid band; for noul
 * questions with enough labels, calibration (ECE, Brier), a selective gate fitted on the FIT split
 * with its Clopper-Pearson bound, labeled *fitted*, and its outcome on the TEST split; the declared
 * noise band; and a drift stub that reads the latest re-ask of the frozen fixtures. PREREG rules:
 * time split at FIT_CUT, never shuffle; excluded ids (fixtures, samples) enter no number; no verdict
 * under MIN_N observations. Writes report.md and report.json; the Hub renders the JSON. Also the only writer of the
 * `fitted` block of jev-elder/hub/wiring/thresholds.json (--thresholds <file>), per PREREG §8; gate.mjs consumes it.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applyGate, bootstrapCuts, calibration, clopperPearsonUpper, fitSelective, judgeCalibration } from '../kit/threshold.ts';

export const PREREG = { fit_cut: '2026-09-27T00:00:00Z', min_n: 8, mid: [0.4, 0.6] as const, choice_top: 0.6, max_error: 0.10, noise_band: { noul: 0.07, score: 0.07, choice: 0.15 }, verdict: { safe: 0.85, marginal: 0.70 } };
type Row = Record<string, any>;

export function readStore(dir: string): Row[] {
  if (!existsSync(dir)) return [];
  const rows: Row[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.jsonl')).sort()) for (const l of readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)) rows.push(JSON.parse(l));
  return rows;
}
const identity = (r: Row) => [r.source, r.id, r.pack, r.q_key, r.label_source, r.labeled_by].join('|');
export function latest(rows: Row[]): Row[] { const m = new Map<string, Row>(); for (const r of rows) { const k = identity(r); const p = m.get(k); if (!p || String(r.labeled_at ?? '') >= String(p.labeled_at ?? '')) m.set(k, r); } return [...m.values()]; }
const pct = (x: number | null) => (x == null ? '–' : (100 * x).toFixed(0) + '%');
const num = (x: number | null, d = 2) => (x == null ? '–' : x.toFixed(d));

export type Cell = {
  pack: string; q_key: string; primitive: string | null;
  n: { none: number; hand: number; implied: number; hand_usable: number; implied_usable: number; both: number };
  agreement: { hand_vs_model: number | null; implied_vs_model: number | null; hand_vs_implied: number | null };
  bands: { ends: number; mid: number; mid_share: number | null };
  calibration: null | { source: 'hand' | 'implied'; n: number; ece: number; brier: number; judged: string; gate: { lo: number | null; hi: number | null; coverage: number; error_upper95: number; fitted: true; fit_n: number } | null; test: { n: number; coverage: number; error_rate: number; error_upper95: number; held: boolean } | null; unstable: boolean | null };
  verdict: 'JEV-SAFE' | 'MARGINAL' | 'MOVE-TO-CODE' | 'NO-INFORMATION' | 'INSUFFICIENT-DATA';
  why: string;
};

function labelOf(r: Row): boolean | string | number | null {
  if (r.label_source === 'hand') { if (r.human_verdict === 'cannot_tell') return null; if (r.label_value !== null && r.label_value !== undefined) return r.label_value; if (r.human_verdict === 'agree') return r.primitive === 'noul' ? (r.model_p >= 0.5) : r.model_answer; if (r.human_verdict === 'disagree' && r.primitive === 'noul') return !(r.model_p >= 0.5); return null; }
  if (r.label_source === 'implied') return r.label_value ?? null;
  return null;
}
const modelSide = (r: Row) => (r.primitive === 'noul' ? (typeof r.model_p === 'number' ? r.model_p >= 0.5 : null) : r.model_answer);
const same = (a: unknown, b: unknown) => a !== null && b !== null && a !== undefined && b !== undefined && String(a) === String(b);
const isMid = (r: Row) => (r.primitive === 'noul' ? typeof r.model_p === 'number' && r.model_p >= PREREG.mid[0] && r.model_p <= PREREG.mid[1] : typeof r.model_p === 'number' ? r.model_p < PREREG.choice_top : false);

export function cells(allRows: Row[], exclude = new Set<string>()): Cell[] {
  const rows = latest(allRows).filter((r) => !r.aggregate && !exclude.has(r.id) && r.model_p !== undefined);
  const byQ = new Map<string, Row[]>();
  for (const r of rows) { const k = `${r.pack}\u0000${r.q_key}`; if (!byQ.has(k)) byQ.set(k, []); byQ.get(k)!.push(r); }
  const out: Cell[] = [];
  for (const [k, rs] of byQ) {
    const [pack, q_key] = k.split('\u0000');
    const none = rs.filter((r) => r.label_source === 'none'), hand = rs.filter((r) => r.label_source === 'hand'), implied = rs.filter((r) => r.label_source === 'implied');
    const modelById = new Map(none.map((r) => [r.id, r]));
    const primitive = none[0]?.primitive ?? hand[0]?.primitive ?? implied[0]?.primitive ?? null;
    // a labeled row carries the model side itself when it was made from a model row; else join on id
    const pairs = (src: Row[]) => src.map((r) => { const m = r.model_p != null ? r : modelById.get(r.id); const y = labelOf(r); return m && y !== null ? { r, m, y } : null; }).filter(Boolean) as { r: Row; m: Row; y: any }[];
    const hp = pairs(hand), ip = pairs(implied);
    const agree = (ps: typeof hp) => (ps.length ? ps.filter(({ m, y }) => same(modelSide(m), y)).length / ps.length : null);
    const both = hp.map((h) => ({ h, i: ip.find((i) => i.r.id === h.r.id) })).filter((x) => x.i);
    const ends = none.filter((r) => !isMid(r)).length, mid = none.filter(isMid).length;
    let calib: Cell['calibration'] = null;
    const src = hp.length >= PREREG.min_n ? { name: 'hand' as const, ps: hp } : ip.length >= PREREG.min_n ? { name: 'implied' as const, ps: ip } : null;
    if (src && primitive === 'noul') {
      const fit = src.ps.filter(({ r }) => String(r.ts) < PREREG.fit_cut), test = src.ps.filter(({ r }) => String(r.ts) >= PREREG.fit_cut);
      const p = src.ps.map(({ m }) => m.model_p as number), y = src.ps.map(({ y }) => y === true || y === 'true');
      const c = calibration(p, y); const j = judgeCalibration(p, y);
      let gate: any = null, testOut: any = null, unstable: boolean | null = null;
      if (fit.length >= PREREG.min_n) {
        const fp = fit.map(({ m }) => m.model_p as number), fy = fit.map(({ y }) => y === true || y === 'true');
        const g = fitSelective(fp, fy, PREREG.max_error); const o = applyGate(g, fp, fy);
        gate = { lo: g.lo, hi: g.hi, coverage: o.coverage, error_upper95: o.errorUpper95, fitted: true, fit_n: fit.length };
        const b = bootstrapCuts(fp, fy, PREREG.max_error, 100); unstable = (b as any).unstable ?? null;
        if (test.length) { const t = applyGate(g, test.map(({ m }) => m.model_p as number), test.map(({ y }) => y === true || y === 'true')); testOut = { n: test.length, coverage: t.coverage, error_rate: t.errorRate, error_upper95: t.errorUpper95, held: t.held }; }
      }
      calib = { source: src.name, n: src.ps.length, ece: c.ece, brier: c.brier, judged: (j as any).verdict ?? JSON.stringify(j), gate, test: testOut, unstable };
    }
    const a = agree(hp), ai = agree(ip);
    let verdict: Cell['verdict'], why: string;
    const basis = hp.length >= PREREG.min_n ? { name: 'hand', a } : ip.length >= PREREG.min_n ? { name: 'implied', a: ai } : null;
    if (!basis) { verdict = none.length && mid + ends >= PREREG.min_n && mid / (mid + ends) > 0.5 ? 'NO-INFORMATION' : 'INSUFFICIENT-DATA'; why = basis ? '' : `fewer than ${PREREG.min_n} usable labels (hand ${hp.length}, implied ${ip.length})` + (verdict === 'NO-INFORMATION' ? `; ${pct(mid / (mid + ends))} of model answers sit in the mid band` : ''); }
    else if (basis.a! >= PREREG.verdict.safe) { verdict = 'JEV-SAFE'; why = `${basis.name} agreement ${pct(basis.a)} on n=${basis.name === 'hand' ? hp.length : ip.length}`; }
    else if (basis.a! >= PREREG.verdict.marginal) { verdict = 'MARGINAL'; why = `${basis.name} agreement ${pct(basis.a)}; gate on the ends, review the middle`; }
    else { verdict = 'MOVE-TO-CODE'; why = `${basis.name} agreement ${pct(basis.a)}; the question is not answered from this state`; }
    out.push({ pack, q_key, primitive, n: { none: none.length, hand: hand.length, implied: implied.length, hand_usable: hp.length, implied_usable: ip.length, both: both.length }, agreement: { hand_vs_model: a, implied_vs_model: ai, hand_vs_implied: both.length ? both.filter(({ h, i }) => same(h.y, i!.y)).length / both.length : null }, bands: { ends, mid, mid_share: mid + ends ? mid / (mid + ends) : null }, calibration: calib, verdict, why });
  }
  return out.sort((a, b) => a.pack.localeCompare(b.pack) || a.q_key.localeCompare(b.q_key));
}

export function driftStub(dir: string) {
  if (!existsSync(dir)) return { status: 'not run', note: 'no drift runs; run node hub/wiring/drift.mjs in jev-elder' };
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort(); if (!files.length) return { status: 'not run', note: 'no drift runs' };
  const d = JSON.parse(readFileSync(path.join(dir, files[files.length - 1]), 'utf8'));
  return { status: d.verdict ?? 'unknown', ran_at: d.ran_at, file: files[files.length - 1], fixtures: d.compared ?? d.fixtures?.length ?? 0, max_abs_delta: d.max_abs_delta, band: d.band, drifted: (d.fixtures ?? []).filter((f: any) => f.verdict !== 'within band').map((f: any) => `${f.fixture}:${f.q_key}`) };
}

/** PREREG §8, as code (mirrored in jev-elder/hub/wiring/gate.mjs, which refuses a file that disagrees). */
export function inForce(e: { lo: number | null; hi: number | null; unstable: boolean | null; test: { held: boolean } | null }) {
  if (e.lo == null && e.hi == null) return false;
  if (e.unstable) return false;
  if (e.test && !e.test.held) return false;
  return true;
}
/** The `fitted` entries of hub/wiring/thresholds.json: one per cell whose gate was fitted. Nothing else writes them. */
export function fittedEntries(cs: Cell[], fittedAt = new Date().toISOString()) {
  return cs.filter((c) => c.calibration?.gate).map((c) => {
    const k = c.calibration!, g = k.gate!;
    const e = { pack: c.pack, q_key: c.q_key, primitive: 'noul' as const, source: k.source, lo: g.lo, hi: g.hi, fit_n: g.fit_n, coverage: g.coverage, error_upper95: g.error_upper95, max_error: PREREG.max_error, unstable: k.unstable ?? false, test: k.test, fit_cut: PREREG.fit_cut, fitted_at: fittedAt, in_force: false, why: '' };
    e.in_force = inForce(e);
    e.why = !e.in_force ? (e.lo == null && e.hi == null ? 'no side reaches the error bound' : e.unstable ? 'unstable under resampling' : 'test split did not hold') : `stable; ${e.test ? `held on ${e.test.n} test labels` : 'no test labels yet'}`;
    return e;
  });
}
/** Rewrites only `fitted` (and its provenance) in an existing thresholds file; `declared` and `overrides` are never touched. */
export function writeThresholds(file: string, cs: Cell[], fittedAt = new Date().toISOString()) {
  const t = JSON.parse(readFileSync(file, 'utf8'));
  if (t.kind !== 'jev-thresholds') throw new Error(`${file} is not a jev-thresholds file`);
  t.fitted = fittedEntries(cs, fittedAt); t.fitted_written_by = 'JEV-works/calibrate/report.ts'; t.fitted_written_at = fittedAt;
  writeFileSync(file, JSON.stringify(t, null, 2) + '\n');
  return t.fitted as ReturnType<typeof fittedEntries>;
}

export function render(cs: Cell[], meta: Record<string, unknown>, drift: ReturnType<typeof driftStub>) {
  const stamp = (v: Cell['verdict']) => ({ 'JEV-SAFE': '◆ JEV-SAFE', MARGINAL: '◐ MARGINAL', 'MOVE-TO-CODE': '⊘ MOVE-TO-CODE', 'NO-INFORMATION': '⊘ NO-INFORMATION', 'INSUFFICIENT-DATA': '± INSUFFICIENT-DATA' })[v];
  const lines = [
    '# Calibration report', '', `Generated ${meta.generated_at} from ${meta.labels_dir} (${meta.rows} rows, ${meta.excluded_ids} excluded ids: fixtures and samples). PREREG: time split at ${PREREG.fit_cut}, no verdict under ${PREREG.min_n} labels, mid band ${PREREG.mid[0]}–${PREREG.mid[1]}, selective gate max error ${PREREG.max_error}, noise band noul/score ${PREREG.noise_band.noul} · choice ${PREREG.noise_band.choice} (declared, not measured here). Hand and implied labels are never pooled.`, '',
    '| pack · question | none | hand | implied | hand↔model | implied↔model | hand↔implied | mid band | verdict |', '|---|---|---|---|---|---|---|---|---|',
    ...cs.map((c) => `| ${c.pack.replace('works.kit.', '')} · ${c.q_key} | ${c.n.none} | ${c.n.hand_usable}${c.n.hand !== c.n.hand_usable ? ` (${c.n.hand})` : ''} | ${c.n.implied_usable} | ${pct(c.agreement.hand_vs_model)} | ${pct(c.agreement.implied_vs_model)} | ${c.n.both ? pct(c.agreement.hand_vs_implied) : '–'} | ${pct(c.bands.mid_share)} | ${stamp(c.verdict)} |`), '',
    '## Fitted thresholds (labeled fitted; applied only to items after the fit date)', '',
    ...(cs.filter((c) => c.calibration).length ? cs.filter((c) => c.calibration).map((c) => { const k = c.calibration!; return `- **${c.q_key}** (${k.source}, n=${k.n}): ECE ${num(k.ece)}, Brier ${num(k.brier)}, judged ${k.judged}` + (k.gate ? `; gate lo ${num(k.gate.lo)} · hi ${num(k.gate.hi)} · coverage ${pct(k.gate.coverage)} · error bound ${pct(k.gate.error_upper95)} *fitted* on ${k.gate.fit_n}` + (k.unstable ? ' · unstable under resampling' : '') : '; no gate: fewer than 8 fit-split labels') + (k.test ? `; test n=${k.test.n} coverage ${pct(k.test.coverage)} error ${pct(k.test.error_rate)} (bound ${pct(k.test.error_upper95)}) ${k.test.held ? 'held' : 'NOT held'}` : ''); }) : ['- none: no question has 8 usable labels yet']), '',
    '## Drift (frozen fixtures re-asked)', '', `- ${drift.status}${'ran_at' in drift ? ` · ${drift.ran_at} · ${drift.fixtures} answers compared · max |Δp| ${num(drift.max_abs_delta as number)} vs band ${typeof drift.band === 'object' && drift.band ? Object.entries(drift.band as Record<string, number>).map(([k, v]) => `${k} ${v}`).join(' · ') : String(drift.band)}` : ''}${(drift as any).drifted?.length ? ` · drifted: ${(drift as any).drifted.join(', ')}` : ''}${'note' in drift ? ` · ${drift.note}` : ''}`, '',
    '## Why each verdict', '', ...cs.map((c) => `- ${c.pack.replace('works.kit.', '')} · ${c.q_key}: ${c.why}`), '',
  ];
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!)) {
  const args = process.argv.slice(2); const flag = (n: string, d: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const root = path.resolve(import.meta.dirname, '..');
  const labels = path.resolve(flag('--labels', path.join(root, 'runs/labels'))), out = path.resolve(flag('--out', path.join(root, 'calibrate')));
  const excl = args.includes('--exclude') ? new Set<string>(JSON.parse(readFileSync(path.resolve(flag('--exclude', '')), 'utf8'))) : new Set<string>();
  const rows = readStore(labels); const cs = cells(rows, excl); const drift = driftStub(path.resolve(flag('--drift', path.join(root, 'runs/drift'))));
  const meta = { generated_at: new Date().toISOString(), labels_dir: path.relative(root, labels), rows: rows.length, excluded_ids: excl.size, prereg: PREREG };
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'report.md'), render(cs, meta, drift));
  writeFileSync(path.join(out, 'report.json'), JSON.stringify({ kind: 'jev-calibration-report', ...meta, drift, cells: cs }, null, 1) + '\n');
  const thr = flag('--thresholds', path.resolve(root, '../jev-elder/hub/wiring/thresholds.json'));
  const fitted = existsSync(thr) ? writeThresholds(thr, cs, meta.generated_at) : null;
  console.log(`report: ${cs.length} cells · verdicts ${JSON.stringify(cs.reduce((a: any, c) => ((a[c.verdict] = (a[c.verdict] ?? 0) + 1), a), {}))} → ${path.relative(root, out)}/report.{md,json}` + (fitted ? ` · thresholds: ${fitted.length} fitted (${fitted.filter((e) => e.in_force).length} in force) → ${path.relative(root, thr)}` : ' · thresholds: no file, not written'));
}
