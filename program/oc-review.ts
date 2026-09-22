/**
 * OC gate — builds program/oc-review.html: one self-contained page (no network, light/dark, phone width).
 * Per tree: verdict card, an edge heatmap (edge group × disagreement / load-bearing / near-0.5 share, plus an
 * item × edge strip), and every item as a row (state, four root answers, raw p per collapse, disagreeing edges)
 * with filters. Zero calls; reads program/results/oc-<slug>.json and oc-summary.json.
 *
 *   /opt/homebrew/bin/node program/oc-review.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SLUGS, loadTree, nodeText } from './oc-tree.ts';
import { resultPath, type TreeResult } from './oc-run.ts';
import { SUMMARY_PATH } from './oc-analyze.ts';

const OUT_PATH = new URL('./oc-review.html', import.meta.url).pathname;

const summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
const trees = SLUGS.map(slug => {
  const t = loadTree(slug);
  const res: TreeResult = JSON.parse(readFileSync(resultPath(slug), 'utf8'));
  const s = summary.trees[slug];
  const views = new Map<string, any>(s.views.map((v: any) => [v.id, v]));
  return {
    slug,
    sha: t.sha256.slice(0, 12),
    compose: { R: t.root.compose, ...Object.fromEntries(t.root.children.map(m => [m.id, m.compose])) },
    text: nodeText(t),
    highRiskEdge: t.highRiskEdge,
    jev: res.JEV_ID,
    answeredBy: s.answeredBy,
    calls: s.calls,
    ocRate: s.ocRate, ocCI95: s.ocCI95, oc_signal: s.oc_signal, verdict: s.verdict, reasons: s.verdictReasons,
    pairwise: s.pairwise, edges: s.edges, replication: s.replication, correctness: s.correctness,
    items: res.items.map(it => {
      const v = views.get(it.id);
      return {
        id: it.id, label: it.label, state: it.state,
        p: Object.fromEntries(Object.entries(it.calls).map(([c, r]) => [c, r.p])),
        ctx: Object.fromEntries(Object.entries(it.calls).map(([c, r]) => [c, r.context_id])),
        R: v?.R ?? null, M: Object.fromEntries(Object.entries(it.answers).map(([c, a]) => [c, a?.M ?? null])),
        consistent: v?.consistent ?? null, edges: v?.edges ?? {}, failing: v?.failingEdges ?? [], near: v?.nearThreshold ?? {},
      };
    }),
  };
});

const json = JSON.stringify({ generatedAt: summary.generatedAt, ocMin: summary.ocMin, edgeMax: summary.edgeMax, trees }).replace(/</g, '\\u003c');
writeFileSync(OUT_PATH, PAGE().replace('__DATA__', () => json));
console.log(`review page → ${OUT_PATH}`);

function PAGE() {
  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OC Gate Review</title>
<style>
:root {
  --bg: #f7f6f2; --surface: #ffffff; --ink: #1c1c1a; --muted: #5f5e58; --line: #dedcd3;
  --good: #1f7a4a; --good-bg: #e3f2e9; --bad: #a3312b; --bad-bg: #f8e4e2; --accent: #2b5aa6; --chip: #efeee8;
  --heat: 163, 49, 43;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #161614; --surface: #20201d; --ink: #ecebe6; --muted: #a8a69d; --line: #3a3934;
    --good: #6fcf97; --good-bg: #1d3327; --bad: #f08a80; --bad-bg: #3d2220; --accent: #8fb3ef; --chip: #2b2b27;
    --heat: 240, 138, 128;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #161614; --surface: #20201d; --ink: #ecebe6; --muted: #a8a69d; --line: #3a3934;
  --good: #6fcf97; --good-bg: #1d3327; --bad: #f08a80; --bad-bg: #3d2220; --accent: #8fb3ef; --chip: #2b2b27;
  --heat: 240, 138, 128;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 1.5rem; margin: 0 0 4px; letter-spacing: -0.01em; }
h2 { font-size: 1.1rem; margin: 0; }
h3 { font-size: .95rem; margin: 16px 0 6px; }
.meta { color: var(--muted); font-size: .85rem; overflow-wrap: anywhere; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 18px 0 12px; }
.tabs button, .toolbar select, .toolbar input, .theme { font: inherit; font-size: .85rem; padding: 6px 12px; border: 1px solid var(--line); border-radius: 99px; background: var(--surface); color: var(--ink); cursor: pointer; min-width: 0; }
.tabs button[aria-selected="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
.card h2 { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.verdict { font-size: .75rem; font-weight: 600; padding: 2px 8px; border-radius: 99px; white-space: nowrap; }
.v-ACCEPT { background: var(--good-bg); color: var(--good); } .v-REFUSE { background: var(--bad-bg); color: var(--bad); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 10px; }
.stat b { display: block; font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.stat span { color: var(--muted); font-size: .8rem; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: .85rem; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 500; }
td.heat { text-align: right; min-width: 64px; }
.strip { display: grid; gap: 1px; margin-top: 8px; }
.strip .row { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 6px; font-size: .75rem; color: var(--muted); }
.strip .cells { display: grid; gap: 1px; }
.strip .c { height: 12px; background: var(--chip); border-radius: 1px; }
.strip .c.on { background: rgb(var(--heat)); }
.toolbar { position: sticky; top: 0; z-index: 2; background: var(--bg); padding: 10px 0; border-bottom: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.toolbar input { flex: 1 1 160px; border-radius: 6px; cursor: text; }
.toolbar .count { color: var(--muted); font-size: .8rem; }
.item { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; margin-top: 8px; }
.item.bad { border-left: 4px solid var(--bad); }
.item .head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chip { font-size: .72rem; padding: 1px 7px; border-radius: 99px; background: var(--chip); white-space: nowrap; font-variant-numeric: tabular-nums; }
.chip.t { background: var(--good-bg); color: var(--good); } .chip.f { background: var(--bad-bg); color: var(--bad); }
.chip.e { border: 1px solid var(--bad); color: var(--bad); background: transparent; }
.state { margin: 6px 0 0; font-size: .85rem; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 9em; overflow: auto; }
details summary { cursor: pointer; color: var(--accent); font-size: .8rem; margin-top: 4px; }
.id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; color: var(--muted); overflow-wrap: anywhere; }
.nodes { font-size: .8rem; color: var(--muted); }
.nodes dt { font-weight: 600; color: var(--ink); } .nodes dd { margin: 0 0 4px 0; }
.top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
</style>
</head>
<body>
<main>
<div class="top">
  <div>
    <h1>Operadic consistency gate</h1>
    <div class="meta" id="meta"></div>
  </div>
  <button class="theme" id="theme" aria-label="Toggle light or dark theme">Theme</button>
</div>
<div class="tabs" role="tablist" id="tabs"></div>
<section id="tree"></section>
</main>
<script>
const D = __DATA__;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = x => x == null ? '—' : (100 * x).toFixed(1) + '%';
const C = ['direct', 'mid', 'decomposed', 'highrisk'];
let cur = 0;
try { const s = localStorage.getItem('oc-tab'); if (s) cur = Math.min(+s, D.trees.length - 1); } catch {}
document.getElementById('meta').textContent = 'Jev ' + D.trees[0].jev + ' · answered by ' + D.trees[0].answeredBy.join(', ') + ' · ' + D.trees.reduce((s, t) => s + t.calls, 0) + ' calls · tree verdict rule: OC ≥ ' + D.ocMin + ' and every edge group ≤ ' + D.edgeMax + ' (declared before the run) · consistency is not correctness';

function tabs() {
  document.getElementById('tabs').innerHTML = D.trees.map((t, i) =>
    '<button role="tab" aria-selected="' + (i === cur) + '" data-i="' + i + '">' + esc(t.slug) + ' · ' + t.verdict + '</button>').join('');
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { cur = +b.dataset.i; try { localStorage.setItem('oc-tab', cur); } catch {} tabs(); render(); });
}

function heat(x) { return 'background: rgba(var(--heat), ' + Math.min(0.85, (x || 0) * 1.6).toFixed(2) + ')'; }

function render() {
  const t = D.trees[cur];
  const c = t.correctness;
  const pw = Object.entries(t.pairwise).map(([k, v]) => '<tr><td>' + esc(k.replace('~', ' ~ ')) + '</td><td class="heat" style="' + heat(1 - v.rate) + '">' + pct(v.rate) + '</td><td>' + v.agree + '/' + v.n + '</td></tr>').join('');
  const edges = t.edges.map(e => '<tr><td><b>' + esc(e.edge) + '</b>' + (e.highRisk ? ' <span class="chip">declared high-risk</span>' : '') +
    '<div class="meta">' + esc(e.node === 'R' ? 'R direct vs R from mids' : e.node + ' direct vs ' + e.node + ' = ' + t.compose[e.node]) + '</div></td>' +
    '<td class="heat" style="' + heat(e.rate) + '">' + pct(e.rate) + '<div class="meta">' + e.disagree + '/' + e.n + '</div></td>' +
    '<td class="heat" style="' + heat(e.disagree ? e.loadBearing / e.n : 0) + '">' + e.loadBearing + '</td>' +
    '<td class="heat">' + e.nearThreshold + '</td>' +
    '<td>' + esc(Object.entries(e.pivots).map(([k, v]) => k + ' ' + v).join(', ') || '—') + '</td></tr>').join('');
  const groups = t.edges.map(e => e.edge);
  const cols = 'grid-template-columns: repeat(' + t.items.length + ', 1fr)';
  const strip = groups.map(g => '<div class="row"><span>' + esc(g) + '</span><div class="cells" style="' + cols + '">' +
    t.items.map(it => '<div class="c' + (it.edges[g] ? ' on' : '') + '" title="' + esc(it.id) + '"></div>').join('') + '</div></div>').join('') +
    '<div class="row"><span>OC fail</span><div class="cells" style="' + cols + '">' + t.items.map(it => '<div class="c' + (it.consistent === false ? ' on' : '') + '" title="' + esc(it.id) + '"></div>').join('') + '</div></div>';
  const corr = c ? '<h3>Correctness (labels used for logging only)</h3><div class="stats">' +
    C.map(k => '<div class="stat"><b>' + pct(c.accuracy[k]) + '</b><span>' + k + ' accuracy</span></div>').join('') +
    '<div class="stat"><b>' + pct(c.majorityBaseline) + '</b><span>majority baseline</span></div>' +
    '<div class="stat"><b>' + c.directOnConsistent.right + '/' + c.directOnConsistent.n + ' vs ' + c.directOnInconsistent.right + '/' + c.directOnInconsistent.n + '</b><span>direct right: OC-consistent vs inconsistent · Fisher p ' + c.fisher.p + '</span></div>' +
    '<div class="stat"><b>' + c.mcnemarDirectVsDecomposed.direct_only_right + ' vs ' + c.mcnemarDirectVsDecomposed.decomposed_only_right + '</b><span>direct vs decomposed, exact McNemar p ' + c.mcnemarDirectVsDecomposed.p + '</span></div></div>' : '<p class="meta">Label-free tree: no correctness numbers.</p>';
  const nodes = Object.entries(t.text).map(([k, v]) => '<dt>' + k + (t.compose[k] ? ' = ' + esc(t.compose[k]) : '') + '</dt><dd>' + esc(v) + '</dd>').join('');
  document.getElementById('tree').innerHTML =
    '<div class="card"><h2>' + esc(t.slug) + ' <span class="verdict v-' + t.verdict + '">' + t.verdict + '</span></h2>' +
    '<div class="meta">toq sha256 ' + t.sha + '… · high-risk edge ' + esc(t.highRiskEdge) + ' · ' + t.calls + ' calls' + (t.reasons.length ? ' · ' + esc(t.reasons.join('; ')) : '') + '</div>' +
    '<div class="stats"><div class="stat"><b>' + pct(t.ocRate) + '</b><span>all four collapses agree (95% CI ' + t.ocCI95.map(pct).join('–') + ')</span></div>' +
    '<div class="stat"><b>' + pct(t.oc_signal) + '</b><span>oc_signal (worst pair)</span></div>' +
    '<div class="stat"><b>' + t.replication.p95AbsDp + '</b><span>p95 |Δp| of ' + t.replication.node + ' asked in two batches (P4 band 0.07), ' + t.replication.flips + ' flips</span></div></div>' +
    '<details><summary>Question text and compose rules</summary><dl class="nodes">' + nodes + '</dl></details></div>' +
    '<div class="card"><h3 style="margin-top:0">Edge heatmap</h3><div class="scroll"><table><thead><tr><th>edge group</th><th>disagree</th><th>load-bearing</th><th>near 0.5</th><th>pivotal nodes (heuristic)</th></tr></thead><tbody>' + edges + '</tbody></table></div>' +
    '<div class="strip" aria-label="Per-item disagreement strip">' + strip + '</div>' +
    '<h3>Pairwise agreement</h3><div class="scroll"><table><tbody>' + pw + '</tbody></table></div>' + corr + '</div>' +
    '<div class="toolbar"><select id="f" aria-label="Filter items"><option value="all">all items</option><option value="bad">OC-inconsistent</option><option value="good">OC-consistent</option>' +
    groups.map(g => '<option value="e:' + esc(g) + '">' + esc(g) + ' disagrees</option>').join('') +
    (c ? '<option value="wrong">direct wrong</option>' : '') + '</select><input id="q" type="search" placeholder="search state or id" aria-label="Search"><span class="count" id="count"></span></div><div id="items"></div>';
  document.getElementById('f').onchange = list; document.getElementById('q').oninput = list;
  list();
}

function list() {
  const t = D.trees[cur];
  const f = document.getElementById('f').value, q = document.getElementById('q').value.toLowerCase();
  const rows = t.items.filter(it => {
    if (f === 'bad' && it.consistent !== false) return false;
    if (f === 'good' && it.consistent !== true) return false;
    if (f.startsWith('e:') && !it.edges[f.slice(2)]) return false;
    if (f === 'wrong' && !(it.R && it.label !== null && it.R.direct !== it.label)) return false;
    return !q || (it.id + ' ' + JSON.stringify(it.state)).toLowerCase().includes(q);
  });
  document.getElementById('count').textContent = rows.length + ' / ' + t.items.length;
  document.getElementById('items').innerHTML = rows.map(it => {
    const st = Object.entries(it.state).map(([k, v]) => (Object.keys(it.state).length > 1 ? k + ': ' : '') + v).join('\\n');
    const r = it.R ? C.map(k => '<span class="chip ' + (it.R[k] ? 't' : 'f') + '">' + k + ' ' + (it.R[k] ? 'yes' : 'no') + '</span>').join('') : '<span class="chip e">call failed</span>';
    const e = Object.entries(it.edges).filter(([, d]) => d).map(([g]) => '<span class="chip e">' + esc(g) + (it.near[g] ? ' · near 0.5' : '') + '</span>').join('');
    const lab = it.label === null ? '' : '<span class="chip">gold ' + (it.label ? 'yes' : 'no') + '</span>';
    const p = C.map(k => '<tr><td>' + k + '</td><td>' + esc(Object.entries(it.p[k] || {}).map(([n, v]) => n + ' ' + v.toFixed(2)).join(' · ')) +
      (it.M[k] && Object.keys(it.M[k]).length ? '<div class="meta">→ ' + esc(Object.entries(it.M[k]).map(([n, v]) => n + ' ' + (v ? 'yes' : 'no')).join(' · ')) + '</div>' : '') +
      '</td><td class="id">' + esc(it.ctx[k] || '') + '</td></tr>').join('');
    return '<div class="item' + (it.consistent === false ? ' bad' : '') + '"><div class="head"><span class="id">' + esc(it.id) + '</span>' + lab + r + e + '</div>' +
      '<div class="state">' + esc(st) + '</div><details><summary>raw p, composed nodes, context ids</summary><div class="scroll"><table><tbody>' + p + '</tbody></table></div></details></div>';
  }).join('');
}

document.getElementById('theme').onclick = () => {
  const r = document.documentElement, dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  r.dataset.theme = dark ? 'light' : 'dark';
};
tabs(); render();
</script>
</body>
</html>
`;
}
