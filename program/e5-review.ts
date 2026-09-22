/**
 * E5 — builds program/e5-review.html: one self-contained page (no network, light/dark, phone width).
 * Per target a verdict card (accuracy, coverage, McNemar b/c/p, CI) and every scored test item
 * (state summary, true label, Jev choice + probabilities, NB guess, agree/disagree), with filters,
 * per-item review marks kept in this browser, and a JSON export of those marks.
 */
import { writeFile } from 'node:fs/promises';
import type { Built } from './e5-data.ts';
import type { Readings } from './e5-run.ts';
import type { E5Result } from './e5-analyze.ts';

const OUT_PATH = new URL('./e5-review.html', import.meta.url).pathname;

export async function writeReview(_built: Built, readings: Readings, result: E5Result) {
  const data = {
    JEV_ID: result.JEV_ID,
    answeredBy: result.answeredBy,
    callsUsed: readings.callsUsed,
    finishedAt: readings.finishedAt,
    targets: result.targets,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  await writeFile(OUT_PATH, PAGE.replace('__DATA__', () => json));
  console.log(`review page → ${OUT_PATH}`);
}

const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E5 Masked Targets</title>
<style>
:root {
  --bg: #f7f6f2; --surface: #ffffff; --ink: #1c1c1a; --muted: #5f5e58; --line: #dedcd3;
  --good: #1f7a4a; --good-bg: #e3f2e9; --bad: #a3312b; --bad-bg: #f8e4e2; --accent: #2b5aa6; --chip: #efeee8;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #161614; --surface: #20201d; --ink: #ecebe6; --muted: #a8a69d; --line: #3a3934;
    --good: #6fcf97; --good-bg: #1d3327; --bad: #f08a80; --bad-bg: #3d2220; --accent: #8fb3ef; --chip: #2b2b27;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #161614; --surface: #20201d; --ink: #ecebe6; --muted: #a8a69d; --line: #3a3934;
  --good: #6fcf97; --good-bg: #1d3327; --bad: #f08a80; --bad-bg: #3d2220; --accent: #8fb3ef; --chip: #2b2b27;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 1.1rem; margin: 0; }
.meta { color: var(--muted); font-size: .85rem; overflow-wrap: anywhere; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin: 20px 0; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; }
.card h2 { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.verdict { font-size: .75rem; font-weight: 600; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
.verdict.held { background: var(--good-bg); color: var(--good); }
.verdict.falsified { background: var(--bad-bg); color: var(--bad); }
.bars { margin: 10px 0 6px; display: grid; gap: 4px; }
.bar { display: grid; grid-template-columns: 70px 1fr 52px; gap: 8px; align-items: center; font-size: .85rem; }
.track { height: 8px; background: var(--chip); border-radius: 4px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); }
.fill.nb { background: var(--muted); } .fill.maj { background: var(--line); }
.num { font-variant-numeric: tabular-nums; text-align: right; }
.stats { font-size: .82rem; color: var(--muted); margin: 6px 0 0; }
.stats b { color: var(--ink); font-weight: 600; }
.because { font-size: .8rem; color: var(--muted); margin-top: 6px; }
.toolbar { position: sticky; top: 0; z-index: 2; background: var(--bg); padding: 10px 0; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
select, button, input[type=search] { font: inherit; font-size: .85rem; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; min-height: 32px; }
button { cursor: pointer; } button:hover { border-color: var(--accent); }
input[type=search] { flex: 1 1 160px; min-width: 0; }
.count { color: var(--muted); font-size: .85rem; margin-left: auto; }
.rows { display: grid; gap: 8px; margin-top: 12px; }
.row { background: var(--surface); border: 1px solid var(--line); border-left: 4px solid var(--line); border-radius: 8px; padding: 10px 12px; display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; }
.row.disagree { border-left-color: var(--accent); }
.state { font-size: .9rem; overflow-wrap: anywhere; grid-column: 1 / -1; }
.id { font-size: .75rem; color: var(--muted); }
.labels { display: flex; flex-wrap: wrap; gap: 6px; font-size: .8rem; grid-column: 1 / -1; align-items: center; }
.chip { background: var(--chip); border-radius: 99px; padding: 1px 8px; }
.chip.ok { background: var(--good-bg); color: var(--good); } .chip.no { background: var(--bad-bg); color: var(--bad); }
.probs { font-size: .75rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.mark { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
.mark input { flex: 1 1 180px; font: inherit; font-size: .8rem; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--ink); min-width: 0; }
.halted { color: var(--bad); }
</style>
</head>
<body>
<main>
  <h1>E5: masked targets, Jev vs naive Bayes</h1>
  <div class="meta" id="meta"></div>
  <div class="cards" id="cards"></div>
  <div class="toolbar" role="region" aria-label="Filters">
    <select id="f-target" aria-label="Target"></select>
    <select id="f-agree" aria-label="Agreement">
      <option value="all">all items</option><option value="disagree">Jev ≠ NB</option><option value="agree">Jev = NB</option>
    </select>
    <select id="f-right" aria-label="Correctness">
      <option value="all">any correctness</option><option value="jevOnly">Jev right, NB wrong</option>
      <option value="nbOnly">NB right, Jev wrong</option><option value="bothWrong">both wrong</option><option value="jevNone">Jev non-answer</option>
    </select>
    <select id="f-mark" aria-label="Review mark"><option value="all">any mark</option><option value="unmarked">unmarked</option><option value="marked">marked</option></select>
    <input type="search" id="f-q" placeholder="search state" aria-label="Search">
    <button id="export">Export marks (JSON)</button>
    <button id="theme" aria-label="Toggle theme">◐</button>
    <span class="count" id="count"></span>
  </div>
  <div class="rows" id="rows"></div>
</main>
<script type="application/json" id="data">__DATA__</script>
<script>
const D = JSON.parse(document.getElementById('data').textContent);
const KEY = 'e5-review-marks';
let marks = {};
try { marks = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { marks = {}; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch (e) {} };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = x => (x == null || Number.isNaN(x) ? '—' : (100 * x).toFixed(1) + '%');
const live = D.targets.filter(t => !t.halted);

document.getElementById('meta').textContent =
  'Jev ' + D.JEV_ID + ' · answered by ' + (D.answeredBy.join(', ') || '—') + ' · ' + D.callsUsed + ' calls · ' + (D.finishedAt || '') +
  ' · test of record: exact McNemar (p < 0.05), paired bootstrap CI; non-answer = wrong';

document.getElementById('cards').innerHTML = D.targets.map(t => {
  if (t.halted) return '<div class="card"><h2>' + esc(t.target) + '</h2><p class="halted">Halted: ' + esc(t.halted) + '</p></div>';
  const m = t.mcnemar.jevVsNB, j = t.result.jev;
  const bar = (name, v, cls) => '<div class="bar"><span>' + name + '</span><div class="track"><div class="fill ' + cls + '" style="width:' + (100 * v) + '%"></div></div><span class="num">' + pct(v) + '</span></div>';
  return '<div class="card"><h2>' + esc(t.target) + '.' + esc(t.field) +
    '<span class="verdict ' + (t.falsified ? 'falsified' : 'held') + '">' + (t.falsified ? 'prediction falsified' : 'prediction held') + '</span></h2>' +
    '<div class="bars">' + bar('Jev', j.accuracy, '') + bar('NB', t.baseline.naiveBayes.accuracy, 'nb') + bar('majority', t.baseline.majority.accuracy, 'maj') + '</div>' +
    '<p class="stats">n <b>' + t.n.test + '</b> test · coverage <b>' + pct(j.coverage) + '</b> · Δ Jev−NB <b>' + (100 * t.delta.jevMinusNB).toFixed(1) +
    ' pt</b> CI [' + t.delta.jevMinusNB_CI95.map(x => (100 * x).toFixed(1)).join(', ') + ']<br>McNemar b=<b>' + m.b + '</b> c=<b>' + m.c + '</b> p=<b>' + m.p + '</b> → ' + esc(m.winner) + '</p>' +
    '<p class="because">' + esc(t.hypothesis) + '<br>' + esc(t.because) + '</p></div>';
}).join('');

const fT = document.getElementById('f-target');
fT.innerHTML = live.map(t => '<option value="' + t.target + '">' + t.target + ' (' + t.items.length + ')</option>').join('');

function summary(t, s) {
  if (t.target === 'hotpot') return s.question;
  return Object.entries(s).filter(([, v]) => v !== 'none').map(([k, v]) => k + ': ' + v).join(' · ');
}

function render() {
  const t = live.find(x => x.target === fT.value);
  if (!t) return;
  const ag = document.getElementById('f-agree').value, rt = document.getElementById('f-right').value;
  const mk = document.getElementById('f-mark').value, q = document.getElementById('f-q').value.toLowerCase();
  const rows = t.items.filter(r => {
    if (ag === 'agree' && r.jev !== r.nb) return false;
    if (ag === 'disagree' && r.jev === r.nb) return false;
    if (rt === 'jevOnly' && !(r.jevRight && !r.nbRight)) return false;
    if (rt === 'nbOnly' && !(!r.jevRight && r.nbRight)) return false;
    if (rt === 'bothWrong' && (r.jevRight || r.nbRight)) return false;
    if (rt === 'jevNone' && r.jev !== null) return false;
    const has = marks[r.id] && (marks[r.id].mark || marks[r.id].note);
    if (mk === 'marked' && !has) return false;
    if (mk === 'unmarked' && has) return false;
    if (q && !summary(t, r.state).toLowerCase().includes(q)) return false;
    return true;
  });
  document.getElementById('count').textContent = rows.length + ' / ' + t.items.length + ' items';
  document.getElementById('rows').innerHTML = rows.map(r => {
    const m = marks[r.id] || {};
    const probs = r.probabilities ? Object.entries(r.probabilities).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' · ') : (r.error ? 'error: ' + r.error : '—');
    const opt = (v, l) => '<option value="' + v + '"' + (m.mark === v ? ' selected' : '') + '>' + l + '</option>';
    return '<div class="row' + (r.jev !== r.nb ? ' disagree' : '') + '">' +
      '<div class="state">' + esc(summary(t, r.state)) + '</div>' +
      '<div class="labels"><span class="chip">true: <b>' + esc(r.label) + '</b></span>' +
      '<span class="chip ' + (r.jevRight ? 'ok' : 'no') + '">Jev: ' + esc(r.jev ?? 'no answer') + '</span>' +
      '<span class="chip ' + (r.nbRight ? 'ok' : 'no') + '">NB: ' + esc(r.nb) + '</span>' +
      '<span class="chip">' + (r.jev === r.nb ? 'agree' : 'disagree') + '</span>' +
      '<span class="probs">' + esc(probs) + '</span><span class="id">' + esc(r.id) + '</span></div>' +
      '<div class="mark"><select data-id="' + esc(r.id) + '" data-k="mark" aria-label="Review mark">' +
      opt('', 'mark…') + opt('label-wrong', 'true label looks wrong') + opt('jev-defensible', 'Jev answer defensible') +
      opt('nb-defensible', 'NB answer defensible') + opt('unanswerable', 'not answerable from state') + opt('ok', 'checked, fine') + '</select>' +
      '<input data-id="' + esc(r.id) + '" data-k="note" placeholder="note" value="' + esc(m.note || '') + '"></div></div>';
  }).join('');
}

document.getElementById('rows').addEventListener('change', e => {
  const el = e.target, id = el.dataset.id, k = el.dataset.k;
  if (!id) return;
  marks[id] = Object.assign(marks[id] || {}, { [k]: el.value, at: new Date().toISOString() });
  save();
});
for (const id of ['f-target', 'f-agree', 'f-right', 'f-mark']) document.getElementById(id).addEventListener('change', render);
document.getElementById('f-q').addEventListener('input', render);
document.getElementById('export').addEventListener('click', () => {
  const rows = D.targets.flatMap(t => (t.items || []).filter(r => marks[r.id]).map(r => ({
    target: t.target, id: r.id, label: r.label, jev: r.jev, nb: r.nb, ...marks[r.id] })));
  const blob = new Blob([JSON.stringify({ experiment: 'E5', exportedAt: new Date().toISOString(), marks: rows }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'e5-review-marks.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
document.getElementById('theme').addEventListener('click', () => {
  const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
});
render();
</script>
</body>
</html>
`;
