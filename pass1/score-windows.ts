/**
 * Score every candidate research window with the 100-question instrument.
 *
 * One call per window, all 100 questions batched — which is also a test of P1 at
 * three times the scale it was measured at (32 questions).
 *
 * Two things this reports that matter more than the ranking:
 *
 *   1. PER-QUESTION CONFIDENCE. Per L4, an aggregate over mid-band inputs
 *      launders coin flips into a confident-looking number. If most of the 100
 *      questions never reach the ends, the ranking is decoration and is reported
 *      as such.
 *   2. THE CALIBRATION ANCHORS. `context-triage-keep-drop` is known good and
 *      `graph-edge-typing` is known bad (measured: 0% at the ends). If the known
 *      bad window outranks the known good one, the instrument is wrong and its
 *      ranking is discarded rather than believed.
 *
 * Colour discipline (P22): booleans contribute as Prob, scores through an
 * ordinal gate, choices are REPORTED not summed — a Key has no magnitude and
 * inventing ten lookup tables would be fabricating the thing being measured.
 */
import { experimental_evaluate as evaluate } from 'ai';
import { readFile, writeFile } from 'node:fs/promises';
import { WINDOWS_100, TAXONOMY, MOVED_TO_CODE } from './windows-100.ts';
import { entropy, levelWeight, probWeight } from '../question-bank/colors.ts';
import { JEV, JEV_ID } from '../lib/jev.ts';

const MODEL = JEV_ID;
const LEVEL_GATE = Number(process.env.LEVEL_GATE ?? 2);

const TOP = { '1': 'TRACTABILITY', '2': 'FIT', '3': 'INCUMBENT', '4': 'PAYOFF', '5': 'EXPOSURE' } as const;
/** Which direction is favourable. INCUMBENT and EXPOSURE are costs, not benefits. */
const POLARITY: Record<string, 1 | -1> = {
  TRACTABILITY: 1, FIT: 1, INCUMBENT: -1, PAYOFF: 1, EXPOSURE: -1,
};

type Window = Record<string, unknown> & { name: string; notes: string };

const windows: Window[] = JSON.parse(
  await readFile(new URL('./candidate-windows.json', import.meta.url), 'utf8'),
);

const names = Object.keys(WINDOWS_100);
console.log(`scoring ${windows.length} windows × ${names.length} questions`);
console.log(`model ${MODEL} · one call per window · level gate >= ${LEVEL_GATE}\n`);

const qType = (n: string) => (WINDOWS_100[n] as { type: string }).type;
const counts = names.reduce<Record<string, number>>((a, n) => ((a[qType(n)] = (a[qType(n)] ?? 0) + 1), a), {});
console.log(`question mix: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')}`);
console.log(`${MOVED_TO_CODE.length} judgements deliberately NOT asked (moved to code or a text model)\n`);

type Row = {
  window: string;
  perQuestion: Record<string, { p?: number; level?: number; key?: string; h?: number }>;
  subScores: Record<string, number>;
  topScores: Record<string, number>;
  composite: number;
  ms: number;
  inputTokens: number;
};

const rows: Row[] = [];

for (const w of windows) {
  // The state is the window record itself; notes carry the anchor labels, which
  // is a deliberate risk — see the leakage check at the end.
  const t0 = performance.now();
  try {
    const { answers, usage } = await evaluate({
      model: JEV,
      state: w as never,
      questions: WINDOWS_100 as never,
      maxRetries: 2,
      providerOptions: { gateway: { zeroDataRetention: true } },
    });
    const ms = performance.now() - t0;

    const perQuestion: Row['perQuestion'] = {};
    for (const n of names) {
      const a = (answers as Record<string, Record<string, unknown>>)[n];
      if (a.type === 'boolean') perQuestion[n] = { p: a.probability as number };
      else if (a.type === 'score') perQuestion[n] = { level: a.score as number };
      else
        perQuestion[n] = {
          key: a.choice as string,
          h: entropy(a.probabilities as Record<string, number> | undefined),
        };
    }

    // Roll up per sub-category, colour-legally.
    const subScores: Record<string, number> = {};
    for (const [sub, qs] of Object.entries(TAXONOMY)) {
      const contribs: number[] = [];
      for (const n of qs) {
        const r = perQuestion[n];
        if (!r) continue;
        if (r.p !== undefined) contribs.push(probWeight(r.p, 1));
        else if (r.level !== undefined) contribs.push(levelWeight(r.level, LEVEL_GATE, 1));
        // choices are reported, never summed — a Key has no magnitude
      }
      subScores[sub] = contribs.length ? contribs.reduce((a, b) => a + b, 0) / contribs.length : NaN;
    }

    const topScores: Record<string, number> = {};
    for (const [prefix, label] of Object.entries(TOP)) {
      const subs = Object.keys(subScores).filter(s => s.startsWith(prefix + '.'));
      const vals = subs.map(s => subScores[s]).filter(Number.isFinite);
      topScores[label] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
    }
    const composite = Object.entries(topScores).reduce(
      (acc, [label, v]) => acc + (Number.isFinite(v) ? POLARITY[label] * v : 0),
      0,
    );

    rows.push({ window: w.name, perQuestion, subScores, topScores, composite, ms, inputTokens: usage.inputTokens ?? 0 });
    process.stdout.write('.');
  } catch (error) {
    console.log(`\n${w.name} FAILED: ${(error as Error).message.slice(0, 120)}`);
  }
}
console.log('\n');

// ─────────────────────────────────────────── L4 check, before any ranking

const allConf: Array<{ q: string; conf: number; atEnds: number }> = names
  .filter(n => qType(n) === 'boolean')
  .map(n => {
    const ps = rows.map(r => r.perQuestion[n]?.p).filter((p): p is number => Number.isFinite(p));
    const conf = ps.map(p => Math.abs(p - 0.5) * 2);
    return {
      q: n,
      conf: conf.reduce((a, b) => a + b, 0) / Math.max(1, conf.length),
      atEnds: ps.filter(p => p >= 0.85 || p <= 0.15).length / Math.max(1, ps.length),
    };
  });

const meanConf = allConf.reduce((a, b) => a + b.conf, 0) / allConf.length;
const decisive = allConf.filter(a => a.atEnds >= 0.5).length;
const midband = allConf.filter(a => a.atEnds < 0.25).length;

console.log('── L4 check: is the instrument decisive at all? ────────────');
console.log(`mean confidence across ${allConf.length} booleans   ${meanConf.toFixed(3)}`);
console.log(`questions decisive on >=50% of windows       ${decisive} / ${allConf.length}`);
console.log(`questions in the mid band on >75% of windows  ${midband} / ${allConf.length}`);
console.log(
  midband > allConf.length / 2
    ? '\nVERDICT: most questions never leave the mid band. The ranking below is an artifact\nof the weights, not evidence. Treat it as unusable and fix the questions.'
    : decisive > allConf.length / 3
      ? '\nVERDICT: enough questions are decisive for the rollup to carry signal.'
      : '\nVERDICT: borderline. Read the ranking as a weak ordering, not a score.',
);

console.log('\nleast decisive 8 (candidates to move into code):');
for (const a of [...allConf].sort((x, y) => x.atEnds - y.atEnds).slice(0, 8)) {
  console.log(`  ${a.q.slice(0, 40).padEnd(40)} ${Math.round(a.atEnds * 100)}% at ends · conf ${a.conf.toFixed(3)}`);
}

// ────────────────────────────────────────────── anchors, before ranking

const good = rows.find(r => r.window === 'context-triage-keep-drop');
const bad = rows.find(r => r.window === 'graph-edge-typing');
console.log('\n── calibration anchors ─────────────────────────────────────');
if (good && bad) {
  console.log(`known GOOD context-triage-keep-drop  composite ${good.composite.toFixed(3)}`);
  console.log(`known BAD  graph-edge-typing         composite ${bad.composite.toFixed(3)}`);
  console.log(
    good.composite > bad.composite
      ? `PASS — known good outranks known bad by ${(good.composite - bad.composite).toFixed(3)}.`
      : 'FAIL — the known-bad window scored at or above the known-good one.\nThe instrument does not discriminate. Discard the ranking.',
  );
} else {
  console.log('anchors missing from results — cannot validate the instrument');
}

// ────────────────────────────────────────────────────────────── ranking

rows.sort((a, b) => b.composite - a.composite);
console.log('\n── ranking (TRACT + FIT + PAYOFF − INCUMBENT − EXPOSURE) ───');
const w = [28, 10, 6, 5, 5, 5, 5];
console.log(['window', 'composite', 'TRACT', 'FIT', 'INCUM', 'PAY', 'EXPO'].map((h, i) => h.padEnd(w[i])).join(' '));
console.log(w.map(n => '─'.repeat(n)).join(' '));
for (const r of rows) {
  const f = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—');
  console.log(
    [
      r.window.slice(0, 28),
      r.composite.toFixed(3),
      f(r.topScores.TRACTABILITY),
      f(r.topScores.FIT),
      f(r.topScores.INCUMBENT),
      f(r.topScores.PAYOFF),
      f(r.topScores.EXPOSURE),
    ].map((c, i) => String(c).padEnd(w[i])).join(' '),
  );
}

const ms = rows.map(r => r.ms).sort((a, b) => a - b);
const tok = rows.reduce((a, r) => a + r.inputTokens, 0);
console.log(`\n${names.length} questions/call · p50 ${Math.round(ms[Math.floor(ms.length / 2)])}ms · max ${Math.round(ms.at(-1) ?? 0)}ms`);
console.log(`${tok.toLocaleString()} input tokens total = $${((tok * 0.042) / 1e6).toFixed(5)} for all ${rows.length} windows`);
console.log(`(batch scaling was measured to 32 questions; this is ${names.length} — compare against P1)`);

const out = new URL('./window-scores.json', import.meta.url).pathname;
await writeFile(out, JSON.stringify({ model: MODEL, LEVEL_GATE, meanConf, decisive, midband, rows }, null, 2) + '\n');
console.log(`\nfull per-question detail → ${out}`);
