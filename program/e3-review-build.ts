/**
 * Builds program/e3-review.html — a single self-contained page for hand-reviewing E3.
 *
 * Generated only, never hand-edited (the same rule as dashboard/build.py): every number on the page is
 * read from results/e3-blind.json and results/e3-fit.json at build time and embedded as one JSON island.
 * Hook texts come from the fit corpus (read-only); the holdout is the fit set's approved subset, so the
 * holdout run's answers are joined onto the same 80 rows by id.
 *
 *   /opt/homebrew/bin/node program/e3-review-build.ts
 */
import { readFile, writeFile } from 'node:fs/promises';
import { CORPUS_PATH, FORMULA_KEYS, type Hook } from './formulas.ts';
import { e3KeywordClassify } from './e3-keyword-baseline.ts';
import { keywordClassify } from './keyword-baseline.ts';

const OUT_HTML = new URL('./e3-review.html', import.meta.url).pathname;
const readJson = async (p: string) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));

async function main() {
  const blind = await readJson('./results/e3-blind.json');
  const fit = await readJson('./results/e3-fit.json');
  const e1 = await readJson('./results/e1-consensus.json');
  const corpus: Hook[] = JSON.parse(await readFile(CORPUS_PATH, 'utf8'));

  const v = blind.frozen.variant as string;
  const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map(x => [x.id, x]));
  const fitPreds = byId(fit.variants[v].preds as Array<{ id: string; choice: string | null; probabilities?: Record<string, number> }>);
  const v1Preds = byId(fit.variants.v1.preds as Array<{ id: string; choice: string | null }>);
  const holdRows = byId(blind.holdout.rows as Array<{ id: string; choice: string | null; probabilities?: Record<string, number> }>);
  const e1Rows = byId(e1.hookResults as Array<{ id: string; plurality: string | null; bucket: string }>);

  const items = corpus.map(h => {
    const f = fitPreds.get(h.id);
    const ho = holdRows.get(h.id);
    return {
      id: h.id,
      text: h.text,
      status: h.status,
      truth: h.formula,
      jev: f?.choice ?? null,
      probs: f?.probabilities ?? null,
      holdJev: ho ? ho.choice : undefined,
      holdProbs: ho?.probabilities ?? null,
      kw: e3KeywordClassify(h.text),
      e1kw: keywordClassify(h.text),
      v1: v1Preds.get(h.id)?.choice ?? null,
      e1: e1Rows.get(h.id)?.plurality ?? null,
      e1Bucket: e1Rows.get(h.id)?.bucket ?? null,
    };
  });

  const data = {
    headline: blind.headline,
    headlineAsRun: blind.headlineAsRun,
    hypothesis: blind.hypothesis,
    falsifier: blind.falsifier,
    readings: blind.readings,
    approval: blind.approval,
    model: blind.model,
    custody: blind.holdoutCustody,
    frozen: { variant: v, codeCommit: blind.frozen.codeCommit, frozenAt: blind.frozen.frozenAt, tau: blind.frozen.hybridTau, ranking: blind.frozen.variantRanking, question: blind.frozen.question },
    n: blind.n,
    baseline: blind.baseline,
    result: blind.result,
    delta: blind.delta,
    falsified: blind.falsified,
    falsifiedBecause: blind.falsifiedBecause,
    validity: blind.validity,
    scores: {
      fit: { jev: blind.fit.primary, hybrid: blind.fit.hybrid, kw: blind.fit.baselines.e3Keyword, e1kw: blind.fit.baselines.e1Keyword, maj: blind.fit.baselines.majorityClass, v1: fit.variants.v1.score, v3: fit.variants.v3.score },
      holdout: { jev: blind.holdout.primary, hybrid: blind.holdout.hybrid, kw: blind.holdout.baselines.e3Keyword, e1kw: blind.holdout.baselines.e1Keyword, maj: blind.holdout.baselines.majorityClass },
    },
    confusion: { holdJev: blind.holdout.confusion, holdKw: blind.holdout.baselineConfusion, fitJev: blind.fit.confusion },
    classes: FORMULA_KEYS,
    items,
    builtAt: new Date().toISOString(),
  };

  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  await writeFile(OUT_HTML, TEMPLATE.replace('__DATA__', json));
  console.error(`wrote ${OUT_HTML} (${items.length} items)`);
}

const TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E3 Blind Review</title>
<meta name="description" content="E3 blind test — fit vs holdout vs keyword baseline, per-class recall, confusion, and a per-item hand-review table.">
<style>
:root{
  --bg:#f7f6f2;--surface:#ffffff;--surface-2:#efede7;--ink:#1c1b19;--ink-2:#55524b;--line:#dcd8cf;
  --accent:#2f5d8a;--good:#2e7d4f;--bad:#b3261e;--warn:#9a6700;--void:#6b4fa0;
  --bar-jev:#2f5d8a;--bar-kw:#b0772b;--bar-other:#8d8a82;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#141412;--surface:#1c1c1a;--surface-2:#262522;--ink:#ecebe6;--ink-2:#a9a59b;--line:#35332e;
    --accent:#7fb0e0;--good:#6cc58f;--bad:#f08a80;--warn:#e0b050;--void:#b79ce6;
    --bar-jev:#7fb0e0;--bar-kw:#e0a95c;--bar-other:#7c7970;
  }
}
:root[data-theme="dark"]{
  --bg:#141412;--surface:#1c1c1a;--surface-2:#262522;--ink:#ecebe6;--ink-2:#a9a59b;--line:#35332e;
  --accent:#7fb0e0;--good:#6cc58f;--bad:#f08a80;--warn:#e0b050;--void:#b79ce6;
  --bar-jev:#7fb0e0;--bar-kw:#e0a95c;--bar-other:#7c7970;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--sans)}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.6rem;margin:0 0 4px;letter-spacing:-.01em}
h2{font-size:1.1rem;margin:40px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.sub{color:var(--ink-2);font-size:.9rem}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}
.verdict{border-left:6px solid var(--void);margin-top:20px}
.verdict .tag{display:inline-block;font:600 .75rem var(--mono);letter-spacing:.06em;color:var(--void);text-transform:uppercase}
.verdict p{margin:.4em 0}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))}
.grid>*{min-width:0}
.mono,code,.verdict,.kpi .l{overflow-wrap:anywhere}
.kpi .v{font:600 1.8rem var(--mono)}
.kpi .l{color:var(--ink-2);font-size:.85rem}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--line);color:var(--ink-2);background:var(--surface-2);border-radius:0 6px 6px 0}
code,.mono{font-family:var(--mono);font-size:.85em}
.bars{display:grid;grid-template-columns:minmax(110px,190px) 1fr;gap:6px 12px;align-items:center}
.bar{position:relative;height:22px;background:var(--surface-2);border-radius:4px;overflow:hidden}
.bar span{position:absolute;inset:0 auto 0 0;border-radius:4px}
.bar b{position:absolute;right:6px;top:1px;font:600 .8rem var(--mono)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.85rem;color:var(--ink-2);margin:8px 0}
.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:middle}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-weight:600;color:var(--ink-2);background:var(--surface);position:sticky;top:0}
td.num,th.num{text-align:right;font-family:var(--mono)}
.thin{color:var(--warn);font-size:.75rem}
.cm td{text-align:center;font-family:var(--mono);min-width:34px}
.cm th.rot{writing-mode:vertical-rl;transform:rotate(180deg);font-size:.75rem;height:120px;vertical-align:bottom}
.cm td.diag{outline:2px solid var(--good);outline-offset:-2px}
.controls{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;align-items:center}
select,input[type=search],button{font:inherit;font-size:.88rem;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:5px 8px}
button{cursor:pointer}
button[aria-pressed=true]{background:var(--accent);color:var(--bg);border-color:var(--accent)}
.ok{color:var(--good)}.no{color:var(--bad)}
.pill{display:inline-block;font:500 .75rem var(--mono);padding:1px 6px;border-radius:10px;background:var(--surface-2);white-space:nowrap}
.probs{font:.72rem var(--mono);color:var(--ink-2);margin-top:3px}
.rv{display:flex;gap:4px}
.rv button{padding:2px 6px;font-size:.75rem}
td.text{min-width:220px;max-width:380px}
.count{color:var(--ink-2);font-size:.85rem}
footer{margin-top:48px;color:var(--ink-2);font-size:.8rem}
</style>
</head>
<body>
<main>
<h1>E3 — blind test review</h1>
<div class="sub" id="meta"></div>

<section class="card verdict" id="verdict"></section>

<h2>Pre-registered hypothesis</h2>
<div class="grid">
  <div class="card"><div class="l sub">Hypothesis (PROGRAM.md, unedited)</div><p id="hyp"></p><div class="l sub">Falsifier</div><p id="fals"></p></div>
  <div class="card"><div class="l sub">Human approval — verbatim</div><blockquote id="appr"></blockquote><div class="sub" id="apprBy"></div></div>
</div>

<h2>Reporting contract</h2>
<div class="grid" id="kpis"></div>

<h2>Fit vs holdout vs baselines</h2>
<div class="legend"><span><i class="sw" style="background:var(--bar-jev)"></i>Jev</span><span><i class="sw" style="background:var(--bar-kw)"></i>keyword (fitted on the 80)</span><span><i class="sw" style="background:var(--bar-other)"></i>other references</span></div>
<div class="grid">
  <div class="card"><div class="sub">Fit set · n=<span id="nFit"></span></div><div class="bars" id="barsFit"></div></div>
  <div class="card"><div class="sub">"Holdout" · n=<span id="nHold"></span> — the approved subset of the fit set</div><div class="bars" id="barsHold"></div></div>
</div>

<h2>Per-class recall</h2>
<p class="sub">Classes with fewer than 8 items are flagged <span class="thin">thin</span> — no per-class verdict below 8 (I3).</p>
<div class="card scroll"><table id="perClass"></table></div>

<h2>Confusion matrix</h2>
<div class="controls" id="cmCtl"></div>
<p class="sub">Rows = true label, columns = predicted. The diagonal is outlined.</p>
<div class="card scroll"><table class="cm" id="cm"></table></div>

<h2>Item review</h2>
<p class="sub">All 80 fit items; the 39 marked <span class="pill">approved</span> are the holdout. Your review marks stay in this browser; use Export to save them as JSON.</p>
<div class="controls">
  <select id="fView" aria-label="Filter">
    <option value="all">All items</option>
    <option value="jevWrong">Jev wrong</option>
    <option value="kwWrong">Keyword wrong</option>
    <option value="disagree">Jev ≠ keyword</option>
    <option value="bothWrong">Both wrong</option>
    <option value="unreviewed">Not yet reviewed</option>
  </select>
  <select id="fSet" aria-label="Set"><option value="all">Fit + holdout</option><option value="approved">Holdout (approved)</option><option value="killed">Fit only (killed)</option></select>
  <select id="fClass" aria-label="True class"><option value="">Any true class</option></select>
  <input type="search" id="fText" placeholder="Search text" aria-label="Search text">
  <button id="exp">Export review</button>
  <span class="count" id="count"></span>
</div>
<div class="card scroll"><table id="items"></table></div>

<h2>Frozen configuration &amp; custody</h2>
<div class="grid">
  <div class="card" id="frozen"></div>
  <div class="card" id="custody"></div>
</div>
<footer id="foot"></footer>
</main>
<script id="data" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct = x => x == null ? '—' : (x * 100).toFixed(1) + '%';
const sgn = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + ' pts';

$('meta').textContent = 'Model ' + D.model + ' · frozen variant ' + D.frozen.variant + ' @ ' + D.frozen.codeCommit.slice(0, 7) + ' · page built ' + D.builtAt.slice(0, 16).replace('T', ' ') + 'Z';

const V = D.validity;
$('verdict').innerHTML = V && !V.valid
  ? '<span class="tag">Verdict · void</span><p><strong>' + esc(D.headline) + '</strong></p>' +
    '<p>' + esc(V.because.explanation) + '</p>' +
    '<p>Overlap: ids ' + esc(V.because.holdoutIdsInFitSet) + ', text ' + esc(V.because.identicalText) + ', labels ' + esc(V.because.identicalLabel) + '.</p>' +
    '<p>As-run outcome, kept for the record: <span class="mono">' + esc(D.headlineAsRun) + '</span>. ' + esc(V.mechanicalOutcome.reading) + '</p>' +
    '<p class="sub">Needed to actually test E3: ' + esc(V.neededToTestE3) + '</p>'
  : '<span class="tag">Verdict</span><p><strong>' + esc(D.headline) + '</strong></p>';

$('hyp').textContent = D.hypothesis;
$('fals').textContent = D.falsifier;
$('appr').textContent = '“' + D.approval.answer + '”';
$('apprBy').textContent = D.approval.by + ', ' + D.approval.date + ' — asked: “' + D.approval.question + '”';

const kpi = (v, l) => '<div class="card kpi"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';
$('kpis').innerHTML =
  kpi(D.n.fit + ' / ' + D.n.holdout, 'n — fit / holdout (holdout ⊂ fit)') +
  kpi(pct(D.baseline.holdoutAccuracy), 'baseline — ' + esc(D.baseline.name) + ' on the 39') +
  kpi(pct(D.result.holdoutAccuracy), 'result — ' + esc(D.result.system) + ' on the 39 (fit ' + pct(D.result.fitAccuracy) + ')') +
  kpi(sgn(D.delta.holdoutVsBaseline), 'Δ vs baseline · 95% CI ' + D.delta.holdoutVsBaselineCI95.map(x => (x * 100).toFixed(0)).join(' to ') + ' pts') +
  kpi(sgn(-D.delta.fitToHoldoutDrop), 'fit → holdout change · CI of drop ' + D.delta.fitToHoldoutDropCI95.map(x => (x * 100).toFixed(0)).join(' to ') + ' pts') +
  kpi(D.falsified ? 'fired' : 'did not fire', 'falsifier as run — drop>5pts: ' + D.falsifiedBecause.dropExceeds5Points + ', baseline wins: ' + D.falsifiedBecause.baselineWins + (V && !V.valid ? ' · test VOID' : ''));

function bars(el, rows) {
  $(el).innerHTML = rows.map(([label, s, color]) =>
    '<div>' + esc(label) + '</div><div class="bar" role="img" aria-label="' + esc(label) + ' ' + pct(s.accuracy) + '"><span style="width:' + (s.accuracy * 100) + '%;background:' + color + '"></span><b>' + pct(s.accuracy) + '</b></div>').join('');
}
const F = D.scores.fit, H = D.scores.holdout;
$('nFit').textContent = D.n.fit; $('nHold').textContent = D.n.holdout;
bars('barsFit', [
  ['Jev ' + D.frozen.variant + ' (frozen)', F.jev, 'var(--bar-jev)'],
  ['Jev v1 (E1 wording)', F.v1, 'var(--bar-other)'],
  ['Jev v3 (v2 + rules)', F.v3, 'var(--bar-other)'],
  ['Hybrid τ=' + D.frozen.tau, F.hybrid, 'var(--bar-other)'],
  ['Keyword, fitted', F.kw, 'var(--bar-kw)'],
  ['Keyword, E1 (unfitted)', F.e1kw, 'var(--bar-other)'],
  ['Majority class', F.maj, 'var(--bar-other)'],
]);
bars('barsHold', [
  ['Jev ' + D.frozen.variant + ' (frozen)', H.jev, 'var(--bar-jev)'],
  ['Hybrid τ=' + D.frozen.tau, H.hybrid, 'var(--bar-other)'],
  ['Keyword, fitted', H.kw, 'var(--bar-kw)'],
  ['Keyword, E1 (unfitted)', H.e1kw, 'var(--bar-other)'],
  ['Majority class', H.maj, 'var(--bar-other)'],
]);

const cell = c => c ? '<td class="num">' + c.correct + '/' + c.n + ' <span class="sub">' + pct(c.recall) + '</span>' + (c.insufficientData ? ' <span class="thin">thin</span>' : '') + '</td>' : '<td class="num">—</td>';
$('perClass').innerHTML = '<thead><tr><th>class</th><th class="num">holdout · Jev</th><th class="num">holdout · keyword</th><th class="num">fit · Jev</th><th class="num">fit · keyword</th><th class="num">fit · Jev v1</th></tr></thead><tbody>' +
  D.classes.map(k => '<tr><td><span class="pill">' + esc(k) + '</span></td>' + cell(H.jev.perClass[k]) + cell(H.kw.perClass[k]) + cell(F.jev.perClass[k]) + cell(F.kw.perClass[k]) + cell(F.v1.perClass[k]) + '</tr>').join('') +
  '<tr><td><strong>macro recall</strong></td><td class="num">' + pct(H.jev.macroRecall) + '</td><td class="num">' + pct(H.kw.macroRecall) + '</td><td class="num">' + pct(F.jev.macroRecall) + '</td><td class="num">' + pct(F.kw.macroRecall) + '</td><td class="num">' + pct(F.v1.macroRecall) + '</td></tr></tbody>';

const CMS = { holdJev: 'Holdout · Jev', holdKw: 'Holdout · keyword', fitJev: 'Fit · Jev' };
let cmKey = 'holdJev';
function drawCM() {
  $('cmCtl').innerHTML = Object.entries(CMS).map(([k, l]) => '<button data-cm="' + k + '" aria-pressed="' + (k === cmKey) + '">' + l + '</button>').join('');
  const m = D.confusion[cmKey];
  const cols = [...D.classes, ...(Object.values(m).some(r => r['(failed)']) ? ['(failed)'] : [])];
  const max = Math.max(1, ...Object.values(m).flatMap(r => Object.values(r)));
  $('cm').innerHTML = '<thead><tr><th>true ↓ / pred →</th>' + cols.map(c => '<th class="rot">' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
    D.classes.filter(r => m[r]).map(r => '<tr><th>' + esc(r) + '</th>' + cols.map(c => {
      const v = m[r][c] || 0;
      const a = v ? 0.15 + 0.65 * v / max : 0;
      const col = c === r ? 'var(--good)' : 'var(--bad)';
      return '<td class="' + (c === r ? 'diag' : '') + '" style="background:' + (v ? 'color-mix(in srgb,' + col + ' ' + Math.round(a * 100) + '%, transparent)' : 'transparent') + '">' + (v || '') + '</td>';
    }).join('') + '</tr>').join('') + '</tbody>';
}
$('cmCtl').addEventListener('click', e => { const k = e.target.dataset && e.target.dataset.cm; if (k) { cmKey = k; drawCM(); } });
drawCM();

// Per-viewer review marks: a convenience, so localStorage is fine; wrapped because it can throw.
const KEY = 'e3-review-marks';
let marks = {};
try { marks = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { marks = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch (e) {} };

const fClass = $('fClass');
D.classes.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; fClass.appendChild(o); });
const topProbs = p => p ? Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' · ') : '';
const mark = (ok, v) => v == null ? '<span class="sub">failed</span>' : '<span class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ ' : '✗ ') + esc(v) + '</span>';

function drawItems() {
  const view = $('fView').value, set = $('fSet').value, cls = fClass.value, q = $('fText').value.toLowerCase();
  const rows = D.items.filter(it => {
    const jw = it.jev !== it.truth, kw = it.kw !== it.truth;
    if (view === 'jevWrong' && !jw) return false;
    if (view === 'kwWrong' && !kw) return false;
    if (view === 'disagree' && it.jev === it.kw) return false;
    if (view === 'bothWrong' && !(jw && kw)) return false;
    if (view === 'unreviewed' && marks[it.id]) return false;
    if (set !== 'all' && it.status !== set) return false;
    if (cls && it.truth !== cls) return false;
    if (q && !it.text.toLowerCase().includes(q)) return false;
    return true;
  });
  $('count').textContent = rows.length + ' of ' + D.items.length + ' · ' + Object.keys(marks).length + ' reviewed';
  $('items').innerHTML = '<thead><tr><th>id</th><th>hook text</th><th>true label</th><th>Jev ' + esc(D.frozen.variant) + ' (fit run)</th><th>Jev (holdout run)</th><th>keyword</th><th>E1 consensus</th><th>agree?</th><th>your review</th></tr></thead><tbody>' +
    rows.map(it => '<tr>' +
      '<td class="mono">' + esc(it.id) + '<br><span class="pill">' + esc(it.status) + '</span></td>' +
      '<td class="text">' + esc(it.text) + '</td>' +
      '<td><span class="pill">' + esc(it.truth) + '</span></td>' +
      '<td>' + mark(it.jev === it.truth, it.jev) + '<div class="probs">' + esc(topProbs(it.probs)) + '</div></td>' +
      '<td>' + (it.holdJev === undefined ? '<span class="sub">not in holdout</span>' : mark(it.holdJev === it.truth, it.holdJev) + '<div class="probs">' + esc(topProbs(it.holdProbs)) + '</div>') + '</td>' +
      '<td>' + mark(it.kw === it.truth, it.kw) + '</td>' +
      '<td>' + (it.e1 ? mark(it.e1 === it.truth, it.e1) + '<div class="probs">' + esc(it.e1Bucket) + '</div>' : '—') + '</td>' +
      '<td>' + (it.jev === it.kw ? 'agree' : '<strong>disagree</strong>') + '</td>' +
      '<td><div class="rv" data-id="' + esc(it.id) + '">' +
        ['label ok', 'label wrong', 'unsure'].map(m => '<button data-m="' + m + '" aria-pressed="' + (marks[it.id] === m) + '">' + m + '</button>').join('') +
      '</div></td></tr>').join('') + '</tbody>';
}
['fView', 'fSet', 'fClass', 'fText'].forEach(id => $(id).addEventListener('input', drawItems));
$('items').addEventListener('click', e => {
  const b = e.target.closest('button[data-m]'); if (!b) return;
  const id = b.parentElement.dataset.id;
  marks[id] = marks[id] === b.dataset.m ? undefined : b.dataset.m;
  if (!marks[id]) delete marks[id];
  save(); drawItems();
});
$('exp').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), marks }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'e3-review-marks.json'; a.click();
});
drawItems();

$('frozen').innerHTML = '<div class="sub">Frozen before the holdout run</div>' +
  '<p>Variant <strong>' + esc(D.frozen.variant) + '</strong>, code <span class="mono">' + esc(D.frozen.codeCommit) + '</span>, frozen ' + esc(D.frozen.frozenAt) + '. Hybrid τ = ' + D.frozen.tau + ' (secondary; never decides the verdict).</p>' +
  '<p class="sub">Selection ranking on the 80: ' + D.frozen.ranking.map(r => esc(r.variant) + ' ' + pct(r.accuracy)).join(' · ') + '</p>' +
  '<details><summary>Frozen option descriptions</summary><p class="sub">' + esc(D.frozen.question.instructions) + '</p><table>' +
  Object.entries(D.frozen.question.criteria).map(([k, d]) => '<tr><td><span class="pill">' + esc(k) + '</span></td><td>' + esc(d) + '</td></tr>').join('') + '</table></details>';
$('custody').innerHTML = '<div class="sub">Holdout custody (I2)</div>' +
  '<p class="mono" style="word-break:break-all">' + esc(D.custody.sha256) + '</p>' +
  '<p>' + D.custody.items + ' items, hash + count recorded ' + esc(D.custody.recordedAt) + ', inspected before run: ' + D.custody.inspectedBeforeRun + '.</p>' +
  (V ? '<p class="sub">Jev repeatability: ' + esc(V.byProducts.jevRepeatability) + '.</p>' : '');
$('foot').textContent = 'Generated by program/e3-review-build.ts from results/e3-blind.json and results/e3-fit.json — do not hand-edit.';
</script>
</body>
</html>
`;

main().catch(e => {
  console.error(e?.message ?? e);
  process.exit(1);
});
