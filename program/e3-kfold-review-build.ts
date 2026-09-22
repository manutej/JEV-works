/**
 * Builds program/e3-kfold-review.html — a single self-contained page for hand-reviewing E3-K (the 5-fold study).
 *
 * Generated only, never hand-edited (same rule as e3-review-build.ts): every number on the page is read from
 * results/e3-kfold.json at build time and embedded as one JSON island. Hook texts come from the corpus
 * (read-only). The page says "in-sample for Jev" wherever a Jev number appears.
 *
 *   /opt/homebrew/bin/node program/e3-kfold-review-build.ts
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { CORPUS_PATH, FORMULA_KEYS, type Hook } from './formulas.ts';

const OUT_HTML = new URL('./e3-kfold-review.html', import.meta.url).pathname;

async function main() {
  const r = JSON.parse(await readFile(new URL('./results/e3-kfold.json', import.meta.url), 'utf8'));
  const corpus: Hook[] = JSON.parse(await readFile(CORPUS_PATH, 'utf8'));
  const textOf = new Map(corpus.map(h => [h.id, h.text]));
  const commit = execFileSync('git', ['-C', new URL('..', import.meta.url).pathname, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

  const data = {
    experiment: r.experiment,
    validity: r.validity,
    validityDetail: r.validityDetail,
    approval: r.approval,
    hypothesis: r.hypothesis,
    falsifier: r.falsifier,
    headline: r.headline,
    n: r.n,
    baseline: r.baseline,
    result: r.result,
    delta: r.delta,
    falsified: r.falsified,
    corr: r.postHocCorrections?.[0] ?? null,
    model: r.model,
    answeredBy: r.answeredBy,
    callsUsed: r.callsUsed,
    callBudget: r.callBudget,
    folds: r.folds,
    pooled: r.pooled,
    perFold: r.perFold,
    foldSpread: r.foldSpread,
    hybrid: r.hybrid,
    coverageSweep: r.coverageSweep,
    confusion: r.confusion,
    repeatability: r.repeatability,
    classes: FORMULA_KEYS,
    items: (r.rows as any[]).map(x => ({ ...x, text: textOf.get(x.id) ?? '' })),
    commit,
    builtAt: new Date().toISOString(),
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  await writeFile(OUT_HTML, TEMPLATE.replace('__DATA__', json));
  console.error(`wrote ${OUT_HTML} (${data.items.length} items)`);
}

const TEMPLATE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E3 K-fold Review</title>
<meta name="description" content="E3-K: 5-fold study on the 80 CETI hooks — Jev in-sample vs a fold-held-out keyword baseline, per-fold and per-class results, and a per-item hand-review table.">
<style>
:root{
  --bg:#f7f6f2;--surface:#ffffff;--surface-2:#efede7;--ink:#1c1b19;--ink-2:#55524b;--line:#dcd8cf;
  --accent:#2f5d8a;--good:#2e7d4f;--bad:#b3261e;--warn:#9a6700;--insample:#9a6700;
  --bar-jev:#2f5d8a;--bar-kw:#b0772b;--bar-other:#8d8a82;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#141412;--surface:#1c1c1a;--surface-2:#262522;--ink:#ecebe6;--ink-2:#a9a59b;--line:#35332e;
    --accent:#7fb0e0;--good:#6cc58f;--bad:#f08a80;--warn:#e0b050;--insample:#e0b050;
    --bar-jev:#7fb0e0;--bar-kw:#e0a95c;--bar-other:#7c7970;
  }
}
:root[data-theme="dark"]{
  --bg:#141412;--surface:#1c1c1a;--surface-2:#262522;--ink:#ecebe6;--ink-2:#a9a59b;--line:#35332e;
  --accent:#7fb0e0;--good:#6cc58f;--bad:#f08a80;--warn:#e0b050;--insample:#e0b050;
  --bar-jev:#7fb0e0;--bar-kw:#e0a95c;--bar-other:#7c7970;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--sans)}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.6rem;margin:0 0 4px;letter-spacing:-.01em}
h2{font-size:1.1rem;margin:40px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.sub{color:var(--ink-2);font-size:.9rem}
.card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:16px}
.verdict{border-left:6px solid var(--insample);margin-top:20px}
.verdict .tag{display:inline-block;font:600 .75rem var(--mono);letter-spacing:.06em;color:var(--insample);text-transform:uppercase}
.verdict p{margin:.4em 0}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))}
.grid>*{min-width:0}
.mono,code,.verdict,.kpi .l{overflow-wrap:anywhere}
.kpi .v{font:600 1.8rem var(--mono)}
.kpi .l{color:var(--ink-2);font-size:.85rem}
blockquote{margin:8px 0;padding:8px 12px;border-left:3px solid var(--line);color:var(--ink-2);background:var(--surface-2);border-radius:0 6px 6px 0}
code,.mono{font-family:var(--mono);font-size:.85em}
.bars{display:grid;grid-template-columns:minmax(120px,230px) 1fr;gap:6px 12px;align-items:center}
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
.tagIS{font:600 .68rem var(--mono);color:var(--insample);letter-spacing:.04em;text-transform:uppercase}
.tagHO{font:600 .68rem var(--mono);color:var(--good);letter-spacing:.04em;text-transform:uppercase}
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
.rv{display:flex;gap:4px;flex-wrap:wrap}
.rv button{padding:2px 6px;font-size:.75rem}
td.text{min-width:220px;max-width:380px}
.count{color:var(--ink-2);font-size:.85rem}
footer{margin-top:48px;color:var(--ink-2);font-size:.8rem}
</style>
</head>
<body>
<main>
<h1>E3-K — 5-fold review on the 80 hooks</h1>
<div class="sub" id="meta"></div>

<section class="card verdict" id="verdict"></section>

<h2>Pre-registered hypothesis</h2>
<div class="grid">
  <div class="card"><div class="sub">Hypothesis (E3-KFOLD-PREREG.md)</div><p id="hyp"></p><div class="sub">Falsifier</div><p id="fals"></p></div>
  <div class="card"><div class="sub">Decision of record</div><blockquote id="appr"></blockquote><div class="sub" id="apprBy"></div></div>
</div>

<h2>Reporting contract</h2>
<div class="grid" id="kpis"></div>

<h2>Pooled accuracy, n = 80</h2>
<div class="legend"><span><i class="sw" style="background:var(--bar-jev)"></i>Jev</span><span><i class="sw" style="background:var(--bar-kw)"></i>keyword baseline, fold-held-out</span><span><i class="sw" style="background:var(--bar-other)"></i>references</span><span><span class="tagIS">in-sample</span> = saw all 80 while being built</span></div>
<div class="card"><div class="bars" id="bars"></div><p class="sub" id="cov"></p></div>

<h2>Per fold</h2>
<p class="sub">Jev answered every item once; folds only decide which items the keyword baseline, majority class and hybrid τ were fitted on. Per-fold Jev numbers are in-sample numbers, partitioned.</p>
<div class="card scroll"><table id="perFold"></table></div>

<h2>Per-class recall (pooled)</h2>
<p class="sub">Classes with fewer than 8 items are flagged <span class="thin">thin</span> — no per-class verdict below 8 (I3).</p>
<div class="card scroll"><table id="perClass"></table></div>

<h2>Coverage beside accuracy — Jev top-p sweep</h2>
<p class="sub">Descriptive only; no threshold here was fitted. Top-p values within 0.15 of each other are not distinguishable (P4 addendum).</p>
<div class="card scroll"><table id="sweep"></table></div>

<h2>Confusion matrix</h2>
<div class="controls" id="cmCtl"></div>
<p class="sub">Rows = true label, columns = predicted. The diagonal is outlined.</p>
<div class="card scroll"><table class="cm" id="cm"></table></div>

<h2>Item review</h2>
<p class="sub">All 80 items. Jev is in-sample; the keyword guess comes from a model that never saw the item's fold. Your marks stay in this browser; Export saves them as JSON.</p>
<div class="controls">
  <select id="fView" aria-label="Filter">
    <option value="all">All items</option>
    <option value="jevWrong">Jev wrong</option>
    <option value="nbWrong">Keyword wrong</option>
    <option value="disagree">Jev ≠ keyword</option>
    <option value="agree">Jev = keyword</option>
    <option value="bothWrong">Both wrong</option>
    <option value="lowP">Jev top-p &lt; 0.5</option>
    <option value="unreviewed">Not yet reviewed</option>
  </select>
  <select id="fFold" aria-label="Fold"><option value="">Any fold</option></select>
  <select id="fClass" aria-label="True class"><option value="">Any true class</option></select>
  <input type="search" id="fText" placeholder="Search text" aria-label="Search text">
  <button id="exp">Export review</button>
  <span class="count" id="count"></span>
</div>
<div class="card scroll"><table id="items"></table></div>

<h2>Folds &amp; custody</h2>
<div class="grid">
  <div class="card" id="foldsCard"></div>
  <div class="card" id="runCard"></div>
</div>
<footer id="foot"></footer>
</main>
<script id="data" type="application/json">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct = x => x == null ? '—' : (x * 100).toFixed(1) + '%';
const pts = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + ' pts';
const ci = c => (c[0] * 100).toFixed(1) + '–' + (c[1] * 100).toFixed(1) + '%';
const P = D.pooled;

$('meta').textContent = 'Model ' + D.model + ' · answered by ' + D.answeredBy.join(', ') + ' · ' + D.callsUsed + ' calls · built at ' + D.commit + ' · ' + D.builtAt.slice(0, 16).replace('T', ' ') + 'Z';

$('verdict').innerHTML = '<span class="tag">Validity · ' + esc(D.validity) + '</span>' +
  '<p><strong>' + esc(D.headline) + '</strong></p>' +
  '<p>' + esc(D.validityDetail) + '</p>' +
  (D.corr ? '<p>Test of record (post-hoc correction ' + esc(D.corr.id) + '): exact McNemar b = ' + D.corr.testOfRecord.b + ', c = ' + D.corr.testOfRecord.c + ', p = ' + D.corr.testOfRecord.p + ' → <strong>' + (D.corr.testOfRecord.different ? 'different' : 'not different') + '</strong>. ' + esc(D.corr.what) + '</p>' : '') +
  '<p>As-run verdict at the pre-registered 0.11 band: <strong>' + esc(D.delta.verdict) + '</strong> (same at 0.15: ' + esc(D.delta.sensitivityAt015) + '). Hypothesis ' + (D.falsified ? '<strong>falsified</strong>' : '<strong>not falsified</strong>') + ' — read as an upper bound for Jev, not as generalisation.</p>';

$('hyp').textContent = D.hypothesis;
$('fals').textContent = D.falsifier;
$('appr').textContent = '“' + D.approval.decision + '”';
$('apprBy').textContent = D.approval.by + ', ' + D.approval.date;

const kpi = (v, l) => '<div class="card kpi"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>';
$('kpis').innerHTML =
  kpi(D.n.items, 'n — ' + D.n.folds + ' folds of ' + D.n.foldSizes.join('/')) +
  kpi(pct(D.baseline.accuracy), 'baseline — NB keyword, fold-held-out · CI95 ' + ci(D.baseline.ci95) + ' · macro ' + pct(D.baseline.macroRecall)) +
  kpi(pct(D.result.accuracy), 'result — Jev v2, <span class="tagIS">in-sample</span> · CI95 ' + ci(D.result.ci95) + ' · macro ' + pct(D.result.macroRecall) + ' · coverage ' + pct(D.result.coverage)) +
  kpi(pts(D.delta.jevMinusBaseline), 'Δ Jev − baseline · paired CI95 ' + ci(D.delta.pairedCi95) + ' · McNemar ' + D.delta.mcnemar.onlyJevRight + ' vs ' + D.delta.mcnemar.onlyBaselineRight + ', p ' + D.delta.mcnemar.pTwoSided) +
  kpi(D.falsified ? 'falsified' : 'not falsified', 'hypothesis · verdict ' + esc(D.delta.verdict) + ' (0.11), ' + esc(D.delta.sensitivityAt015) + ' (0.15)') +
  (D.corr ? kpi('p = ' + D.corr.testOfRecord.p, 'exact McNemar, test of record (' + esc(D.corr.id) + ', post-hoc) · b = ' + D.corr.testOfRecord.b + ', c = ' + D.corr.testOfRecord.c + ' · per class n≥8: ' + Object.entries(D.corr.perClassNAtLeast8).map(([k, m]) => esc(k) + ' ' + m.b + '/' + m.c + ' p ' + m.p).join('; ')) : '');

const SYS = [
  ['jev', 'Jev v2', 'var(--bar-jev)', 'in-sample'],
  ['hybrid', 'Hybrid (Jev ≥ τ else NB)', 'var(--bar-other)', 'τ held-out, Jev in-sample'],
  ['nbKeyword', 'NB keyword', 'var(--bar-kw)', 'held-out'],
  ['majority', 'Majority class', 'var(--bar-other)', 'held-out'],
  ['e3RegexInSample', 'E3 hand-written regex', 'var(--bar-other)', 'in-sample'],
  ['e1KeywordUnfitted', 'E1 keyword', 'var(--bar-other)', 'unfitted'],
];
const tag = t => t === 'held-out' ? '<span class="tagHO">held-out</span>' : '<span class="tagIS">' + esc(t) + '</span>';
$('bars').innerHTML = SYS.map(([k, label, color, t]) =>
  '<div>' + esc(label) + '<br>' + tag(t) + '</div><div class="bar" role="img" aria-label="' + esc(label) + ' ' + pct(P[k].accuracy) + '"><span style="width:' + (P[k].accuracy * 100) + '%;background:' + color + '"></span><b>' + pct(P[k].accuracy) + '</b></div>').join('');
$('cov').textContent = 'Coverage (answered / n): ' + SYS.map(([k, l]) => l + ' ' + pct(P[k].coverage)).join(' · ') + '.';

$('perFold').innerHTML = '<thead><tr><th>fold</th><th class="num">n</th>' + SYS.map(([, l]) => '<th class="num">' + esc(l) + '</th>').join('') + '<th class="num">τ</th></tr></thead><tbody>' +
  D.perFold.map(f => '<tr><td>' + f.fold + '</td><td class="num">' + f.n + '</td>' + SYS.map(([k]) => '<td class="num">' + pct(f[k].accuracy) + '</td>').join('') + '<td class="num">' + f.tau + '</td></tr>').join('') +
  '<tr><td><strong>mean ± sd</strong></td><td></td>' + SYS.map(([k]) => '<td class="num">' + pct(D.foldSpread[k].mean) + ' ± ' + (D.foldSpread[k].sd * 100).toFixed(1) + '</td>').join('') + '<td></td></tr></tbody>';

const cell = c => c ? '<td class="num">' + c.correct + '/' + c.n + ' <span class="sub">' + pct(c.recall) + '</span>' + (c.insufficientData ? ' <span class="thin">thin</span>' : '') + '</td>' : '<td class="num">—</td>';
$('perClass').innerHTML = '<thead><tr><th>class</th><th class="num">Jev v2 <span class="tagIS">in-sample</span></th><th class="num">NB keyword <span class="tagHO">held-out</span></th><th class="num">E3 regex <span class="tagIS">in-sample</span></th><th class="num">hybrid</th></tr></thead><tbody>' +
  D.classes.map(k => '<tr><td><span class="pill">' + esc(k) + '</span></td>' + cell(P.jev.perClass[k]) + cell(P.nbKeyword.perClass[k]) + cell(P.e3RegexInSample.perClass[k]) + cell(P.hybrid.perClass[k]) + '</tr>').join('') +
  '<tr><td><strong>macro recall</strong></td><td class="num">' + pct(P.jev.macroRecall) + '</td><td class="num">' + pct(P.nbKeyword.macroRecall) + '</td><td class="num">' + pct(P.e3RegexInSample.macroRecall) + '</td><td class="num">' + pct(P.hybrid.macroRecall) + '</td></tr></tbody>';

$('sweep').innerHTML = '<thead><tr><th class="num">top-p ≥</th><th class="num">coverage</th><th class="num">items</th><th class="num">accuracy on covered</th></tr></thead><tbody>' +
  D.coverageSweep.map(s => '<tr><td class="num">' + s.threshold + '</td><td class="num">' + pct(s.coverage) + '</td><td class="num">' + s.n + '</td><td class="num">' + pct(s.accuracyOnCovered) + '</td></tr>').join('') + '</tbody>';

const CMS = { jev: 'Jev v2 (in-sample)', nbKeyword: 'NB keyword (held-out)' };
let cmKey = 'jev';
function drawCM() {
  $('cmCtl').innerHTML = Object.entries(CMS).map(([k, l]) => '<button data-cm="' + k + '" aria-pressed="' + (k === cmKey) + '">' + esc(l) + '</button>').join('');
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
const KEY = 'e3-kfold-review-marks';
let marks = {};
try { marks = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { marks = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch (e) {} };

D.classes.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; $('fClass').appendChild(o); });
D.perFold.forEach(f => { const o = document.createElement('option'); o.value = String(f.fold); o.textContent = 'Fold ' + f.fold; $('fFold').appendChild(o); });
const topP = it => it.probabilities && it.jev ? it.probabilities[it.jev] : null;
const topProbs = p => p ? Object.entries(p).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' · ') : '';
const mark = (ok, v) => v == null ? '<span class="sub">failed</span>' : '<span class="' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ ' : '✗ ') + esc(v) + '</span>';
const MARKS = ['label ok', 'label wrong', 'Jev right', 'unsure'];

function drawItems() {
  const view = $('fView').value, fold = $('fFold').value, cls = $('fClass').value, q = $('fText').value.toLowerCase();
  const rows = D.items.filter(it => {
    const jw = it.jev !== it.truth, nw = it.nbKeyword !== it.truth;
    if (view === 'jevWrong' && !jw) return false;
    if (view === 'nbWrong' && !nw) return false;
    if (view === 'disagree' && it.jev === it.nbKeyword) return false;
    if (view === 'agree' && it.jev !== it.nbKeyword) return false;
    if (view === 'bothWrong' && !(jw && nw)) return false;
    if (view === 'lowP' && !((topP(it) ?? 0) < 0.5)) return false;
    if (view === 'unreviewed' && marks[it.id]) return false;
    if (fold !== '' && String(it.fold) !== fold) return false;
    if (cls && it.truth !== cls) return false;
    if (q && !it.text.toLowerCase().includes(q)) return false;
    return true;
  });
  $('count').textContent = rows.length + ' of ' + D.items.length + ' · ' + Object.keys(marks).length + ' reviewed';
  $('items').innerHTML = '<thead><tr><th>id · fold</th><th>hook text</th><th>true label</th><th>Jev v2 <span class="tagIS">in-sample</span></th><th>NB keyword <span class="tagHO">held-out</span></th><th>E3 regex</th><th>agree?</th><th>your review</th></tr></thead><tbody>' +
    rows.map(it => '<tr>' +
      '<td class="mono">' + esc(it.id) + '<br><span class="pill">fold ' + it.fold + '</span></td>' +
      '<td class="text">' + esc(it.text) + '</td>' +
      '<td><span class="pill">' + esc(it.truth) + '</span></td>' +
      '<td>' + mark(it.jev === it.truth, it.jev) + '<div class="probs">' + esc(topProbs(it.probabilities)) + '</div></td>' +
      '<td>' + mark(it.nbKeyword === it.truth, it.nbKeyword) + '</td>' +
      '<td>' + mark(it.e3Regex === it.truth, it.e3Regex) + '</td>' +
      '<td>' + (it.jev === it.nbKeyword ? 'agree' : '<strong>disagree</strong>') + '</td>' +
      '<td><div class="rv" data-id="' + esc(it.id) + '">' +
        MARKS.map(m => '<button data-m="' + m + '" aria-pressed="' + (marks[it.id] === m) + '">' + m + '</button>').join('') +
      '</div></td></tr>').join('') + '</tbody>';
}
['fView', 'fFold', 'fClass', 'fText'].forEach(id => $(id).addEventListener('input', drawItems));
$('items').addEventListener('click', e => {
  const b = e.target.closest('button[data-m]'); if (!b) return;
  const id = b.parentElement.dataset.id;
  if (marks[id] === b.dataset.m) delete marks[id]; else marks[id] = b.dataset.m;
  save(); drawItems();
});
$('exp').addEventListener('click', () => {
  const rows = Object.entries(marks).map(([id, m]) => { const it = D.items.find(x => x.id === id) || {}; return { id, mark: m, fold: it.fold, truth: it.truth, jev: it.jev, nbKeyword: it.nbKeyword }; });
  const blob = new Blob([JSON.stringify({ experiment: D.experiment, validity: D.validity, exportedAt: new Date().toISOString(), marks: rows }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'e3-kfold-review-marks.json'; a.click();
});
drawItems();

const dj = D.folds.disjointness;
$('foldsCard').innerHTML = '<div class="sub">Folds (pre-registered)</div>' +
  '<p>k = ' + D.n.folds + ', stratified by formula, seed ' + D.folds.seed + '. File sha256 <span class="mono">' + esc(D.folds.sha256) + '</span>.</p>' +
  '<p>Disjointness (L31): id overlap <strong>' + dj.pairwiseIdOverlap + '</strong>, normalised-text overlap <strong>' + dj.pairwiseNormalisedTextOverlap + '</strong>, corpus duplicates ' + dj.duplicateNormalisedTextsInCorpus + ', covers corpus ' + dj.coversCorpus + '.</p>' +
  '<p class="sub">Hybrid τ per fold (chosen on training folds): ' + D.hybrid.tauPerFold.join(', ') + '.</p>';
const R = D.repeatability;
$('runCard').innerHTML = '<div class="sub">Run</div>' +
  '<p>' + D.callsUsed + ' of ' + D.callBudget + ' budgeted calls · model ' + esc(D.model) + ' · answered by ' + esc(D.answeredBy.join(', ')) + '.</p>' +
  (R ? '<p class="sub">Repeatability vs ' + esc(R.against) + ': ' + R.sameChoice + '/' + R.comparable + ' same choice.</p>' : '');
$('foot').textContent = 'Generated by program/e3-kfold-review-build.ts from results/e3-kfold.json — do not hand-edit.';
</script>
</body>
</html>
`;

main().catch(e => {
  console.error(e?.message ?? e);
  process.exit(1);
});
