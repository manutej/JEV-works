/**
 * demo/build.ts — render the shareable pages from committed result files. No Jev calls, no network at build time.
 *
 *   /opt/homebrew/bin/node demo/build.ts     → demo/<domain>.html × 6, demo/index.html
 *
 * Every figure on a page comes from cookbooks/<domain>/results/*.json via cookbooks/_shared/load.ts; the prose lives in
 * cookbooks/_shared/stories.ts and computes its numbers from the same object. Pages are self-contained (inline CSS/JS,
 * Google Fonts with system fallbacks), light/dark, and readable at phone width.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOMAINS, load, type Loaded } from '../cookbooks/_shared/load.ts';
import { STORIES, type Story } from '../cookbooks/_shared/stories.ts';
import { bounded, calibrationNote, gateRows, suiteSummary } from '../cookbooks/_shared/present.ts';
import { execFileSync } from 'node:child_process';

const OUT = import.meta.dirname;
const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${(x * 100).toFixed(1)}%`);
const pf = (p: number) => (p < 0.001 ? p.toExponential(1) : String(+p.toPrecision(2)));
const commit = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: OUT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();
const REPO_PATH = 'cookbooks';

// ---------------------------------------------------------------- shared style

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">';

const CSS = `
:root{
  --ground:#F3F5F7; --surface:#FFFFFF; --ink:#15202B; --muted:#586473; --rule:#D8DEE5; --soft:#E9EDF1;
  --jev:#0B7A75; --jev-soft:#D6EEEC; --base:#A15C1F; --nb:#6A55A8; --maj:#8A95A1;
  --good:#1D7A4A; --bad:#B03A3A; --hold:#9A6B12;
  --display:"Bricolage Grotesque", "Avenir Next", "Segoe UI", system-ui, sans-serif;
  --body:"IBM Plex Sans", "Helvetica Neue", Arial, system-ui, sans-serif;
  --mono:"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --ground:#0E141A; --surface:#151D25; --ink:#E4EAF0; --muted:#95A3B1; --rule:#27323D; --soft:#1C2630;
    --jev:#3FBDB3; --jev-soft:#153A38; --base:#DA9150; --nb:#A999E3; --maj:#7C8894;
    --good:#4FC48B; --bad:#E77B7B; --hold:#D9A745; color-scheme: dark;
  }
}
:root[data-theme="dark"]{
  --ground:#0E141A; --surface:#151D25; --ink:#E4EAF0; --muted:#95A3B1; --rule:#27323D; --soft:#1C2630;
  --jev:#3FBDB3; --jev-soft:#153A38; --base:#DA9150; --nb:#A999E3; --maj:#7C8894;
  --good:#4FC48B; --bad:#E77B7B; --hold:#D9A745; color-scheme: dark;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.6 var(--body);padding-inline:16px;padding-block:28px 64px}
.wrap{max-width:920px;margin:0 auto;display:flex;flex-direction:column;gap:44px}
a{color:var(--jev)} a:focus-visible,button:focus-visible{outline:2px solid var(--jev);outline-offset:2px;border-radius:4px}
h1,h2,h3{font-family:var(--display);text-wrap:balance;margin:0;line-height:1.15}
h1{font-size:clamp(30px,5vw,46px);font-weight:700;letter-spacing:-.01em}
h2{font-size:22px;font-weight:700}
h3{font-size:16px;font-weight:600;font-family:var(--body)}
p{margin:0;max-width:68ch}
code,.mono{font-family:var(--mono);font-size:.88em}
code{background:var(--soft);padding:.05em .35em;border-radius:4px}
.eyebrow{font:500 12px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.muted{color:var(--muted)}
.mono,.meta span{overflow-wrap:anywhere}
section{display:flex;flex-direction:column;gap:14px}
.head{display:flex;flex-direction:column;gap:12px}
.lede{font-size:18px;color:var(--ink)}
.pill{display:inline-flex;align-items:center;gap:6px;font:600 13px/1 var(--body);padding:7px 11px;border-radius:999px;border:1px solid currentColor;width:max-content}
.pill.win{color:var(--good)} .pill.lose{color:var(--bad)} .pill.mixed{color:var(--hold)}
.pill::before{content:"";width:8px;height:8px;border-radius:50%;background:currentColor}
.verdict{display:flex;flex-direction:column;gap:10px;background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:18px 20px}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px 24px;font-size:13.5px}
.meta div{display:flex;flex-direction:column;gap:2px}
.qs{display:flex;flex-direction:column;border-top:1px solid var(--rule)}
.q{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;padding:14px 0;border-bottom:1px solid var(--rule)}
.q .id{font:500 14px/1.3 var(--mono);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tag{font:500 11px/1 var(--mono);padding:4px 6px;border-radius:4px;background:var(--soft);color:var(--muted);letter-spacing:.03em}
.tag.target{background:var(--jev-soft);color:var(--jev)}
.q .ins{grid-column:1/-1;font-size:14.5px}
.q .role{grid-column:1/-1;font-size:13.5px;color:var(--muted)}
.q .opts{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px}
.q .opts span{font:12px/1.2 var(--mono);border:1px solid var(--rule);padding:4px 6px;border-radius:4px}
.qual{font:12px/1.3 var(--mono);text-align:right;color:var(--muted);white-space:nowrap}
.qual b{font-weight:500;color:var(--good)} .qual b.warn{color:var(--hold)} .qual b.bad{color:var(--bad)}
.nfj{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);border-top:1px solid var(--rule);font-size:14px}
.nfj>div{padding:10px 12px 10px 0;border-bottom:1px solid var(--rule)}
.nfj>div:nth-child(odd){font-weight:500}
.changes{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:14px}
.bars{display:flex;flex-direction:column;gap:10px}
.bar{display:grid;grid-template-columns:minmax(120px,210px) minmax(0,1fr) 56px;gap:12px;align-items:center;font-size:13.5px}
.bar .track{height:14px;background:var(--soft);border-radius:3px;position:relative;overflow:hidden}
.bar .fill{position:absolute;inset:0 auto 0 0;border-radius:3px}
.bar .v{font:500 13px var(--mono);text-align:right;font-variant-numeric:tabular-nums}
.bar small{display:block;color:var(--muted);font-size:12px;line-height:1.3}
.tablewrap{overflow-x:auto;border:1px solid var(--rule);border-radius:8px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:13.5px;font-variant-numeric:tabular-nums}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--rule);white-space:nowrap}
th{font:500 11.5px/1.2 var(--mono);text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:var(--soft)}
tr:last-child td{border-bottom:0}
td.num{text-align:right;font-family:var(--mono);font-size:12.5px}
.sig-jev{color:var(--good);font-weight:600} .sig-base{color:var(--bad);font-weight:600} .sig-none{color:var(--muted)}
.strip{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:14px 14px 6px}
.strip svg{width:100%;height:auto;display:block}
.strip svg text{fill:var(--muted);font:11px var(--mono)}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--muted);padding:6px 2px 8px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
.tabs{display:flex;gap:6px;flex-wrap:wrap}
.tabs button{font:500 13px var(--body);color:var(--ink);background:var(--surface);border:1px solid var(--rule);border-radius:999px;padding:6px 12px;cursor:pointer}
.tabs button[aria-pressed="true"]{background:var(--ink);color:var(--ground);border-color:var(--ink)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:14px}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}
.card .top{display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap}
.state{font:12.5px/1.5 var(--mono);background:var(--soft);border-radius:6px;padding:10px 12px;overflow-wrap:anywhere;max-height:180px;overflow:auto}
.state b{font-weight:500;color:var(--muted)}
.ans{display:flex;flex-direction:column;gap:6px}
.a{display:grid;grid-template-columns:minmax(0,1fr) 92px 40px;gap:8px;align-items:center;font:12px/1.3 var(--mono)}
.a .t{height:8px;background:var(--soft);border-radius:2px;position:relative;overflow:hidden}
.a .t span{position:absolute;inset:0 auto 0 0;background:var(--jev);border-radius:2px}
.a .p{text-align:right;font-variant-numeric:tabular-nums}
.a.target{font-weight:600}
.outcome{display:flex;flex-wrap:wrap;gap:6px;font-size:12.5px}
.chip{font:500 12px/1 var(--mono);padding:5px 7px;border-radius:4px;border:1px solid var(--rule)}
.chip.ok{color:var(--good);border-color:currentColor} .chip.no{color:var(--bad);border-color:currentColor} .chip.hold{color:var(--hold);border-color:currentColor}
.fails{display:flex;flex-direction:column;gap:12px;margin:0;padding-left:20px}
.fails li{max-width:72ch}
.foot{font-size:12.5px;color:var(--muted);border-top:1px solid var(--rule);padding-top:16px;display:flex;flex-direction:column;gap:6px}
nav.crumbs{font-size:13px}
p,li{overflow-wrap:break-word}
.wrap>*,.card,.meta>div,.q>*{min-width:0}
.licence{display:flex;flex-direction:column;gap:6px;border:1px solid var(--rule);border-left-width:4px;border-radius:8px;padding:12px 16px;background:var(--surface);font-size:14px}
.licence.open{border-left-color:var(--good)} .licence.caution{border-left-color:var(--hold)} .licence.restricted{border-left-color:var(--bad)}
.lic{font:500 11.5px/1.2 var(--mono);padding:4px 7px;border-radius:4px;border:1px solid var(--rule);width:max-content;max-width:100%}
.lic.caution{color:var(--hold);border-color:currentColor} .lic.restricted{color:var(--bad);border-color:currentColor}
.suite{display:flex;flex-direction:column;gap:8px}
.suite-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:14px}
table.gates td.why{white-space:normal;min-width:260px}
@media (max-width:560px){
  .bar{grid-template-columns:minmax(0,1fr) 52px}.bar .track{grid-column:1/-1;grid-row:2}
  .nfj{grid-template-columns:1fr}.nfj>div:nth-child(odd){border-bottom:0;padding-bottom:0}
  .q{grid-template-columns:1fr}.qual{text-align:left}
}
@media (prefers-reduced-motion:no-preference){.fill{transition:width .5s ease}}
`;

const page = (title: string, description: string, body: string, script = '') => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
${FONTS}<style>${CSS}</style></head><body><div class="wrap">${body}</div>${script ? `<script>${script}</script>` : ''}</body></html>
`;

// ---------------------------------------------------------------- pieces

const verdictClass = (v: string) => (v === 'Jev better' ? 'win' : v === 'Baseline wins' ? 'lose' : 'mixed');
const sigCell = (p: { p: number; b: number; c: number }, a: string, b: string) =>
  p.p < 0.05 ? (p.b > p.c ? `<span class="sig-jev">${a} better</span>` : `<span class="sig-base">${b} better</span>`) : '<span class="sig-none">no difference shown</span>';

function questionList(L: Loaded, S: Story): string {
  const q = (rows: typeof L.quality.test, id: string) => rows.find(r => r.question === id);
  return `<div class="qs">${Object.entries(L.questions).map(([id, Q]) => {
    const t = q(L.quality.test, id), pl = q(L.quality.pilot, id), f = q(L.quality.fit, id);
    const cls = (v?: string) => (v === 'JEV-SAFE' ? '' : v === 'MARGINAL' ? 'warn' : 'bad');
    const opts = Q.type === 'choice' ? `<div class="opts">${Object.keys(Q.criteria).map(k => `<span>${esc(k)}</span>`).join('')}</div>` : '';
    const ins = typeof Q.instructions === 'string' ? Q.instructions : JSON.stringify(Q.instructions);
    return `<div class="q"><div class="id">${esc(id)} <span class="tag">${Q.type}${Q.type === 'choice' ? `·${Object.keys(Q.criteria).length}` : ''}</span>${id === L.target ? '<span class="tag target">decision</span>' : ''}</div>
      <div class="qual" title="share of answers at the ends (p ≤ 0.1 or ≥ 0.9 / confident), pilot → fit → test">${t ? `<b class="${cls(t.verdict)}">${esc(t.verdict)}</b><br>ends ${pl ? Math.round(pl.atEnds * 100) : '–'} → ${f ? Math.round(f.atEnds * 100) : '–'} → ${Math.round(t.atEnds * 100)}%` : ''}</div>
      <p class="ins">${esc(ins)}</p>${opts}<p class="role">${md(S.roles[id] ?? '')}</p></div>`;
  }).join('')}</div>`;
}

function scoreboard(L: Loaded): string {
  const d = L.decision, f = d.forced;
  const rows: [string, string, number, string][] = [
    ['Jev, frozen rule', `${L.kind === 'binary' ? 'narrow questions → regression → cut' : 'choice, as answered'}`, f.jevAccuracy, 'var(--jev)'],
    ...(L.direct && L.kind === 'binary' ? [['Jev, one broad question', `${L.direct.question} at p ≥ 0.5 (kit scorecard)`, L.direct.accuracy, 'color-mix(in srgb, var(--jev) 55%, var(--soft))'] as [string, string, number, string]] : []),
    ['Keyword lists (declared)', 'top 8 words per class, fitted on the 100 fit items', f.baselineAccuracy, 'var(--base)'],
    ['Naive Bayes (post-hoc)', `trained on ${L.strong.trainN} labelled rows outside fit and test`, L.strong.forced.accuracyB, 'var(--nb)'],
    ['Majority class', `always "${String(d.majority)}"`, f.majorityAccuracy, 'var(--maj)'],
  ];
  const bars = rows.map(([n, s, v, c]) => `<div class="bar"><div>${esc(n)}<small>${esc(s)}</small></div><div class="track" role="img" aria-label="${esc(n)} ${pct(v)}"><div class="fill" style="width:${(v * 100).toFixed(1)}%;background:${c}"></div></div><div class="v">${pct(v)}</div></div>`).join('');
  const tr = (name: string, p: typeof f.vsBaseline, a: string, b: string, note = '') => `<tr><td>${name}${note ? ` <span class="muted">${note}</span>` : ''}</td><td class="num">${p.n}</td><td class="num">${pct(p.accuracyA)}</td><td class="num">${pct(p.accuracyB)}</td><td class="num">${p.b}</td><td class="num">${p.c}</td><td class="num">${pf(p.p)}</td><td>${sigCell(p, a, b)}</td></tr>`;
  const g = d.gated;
  const table = `<div class="tablewrap"><table><thead><tr><th>Jev rule vs</th><th>n</th><th>Jev</th><th>other</th><th>only Jev right</th><th>only other right</th><th>McNemar p</th><th>reading</th></tr></thead><tbody>
    ${tr('keyword lists', f.vsBaseline, 'Jev', 'keywords', '(declared test)')}
    ${tr('naive Bayes', L.strong.forced, 'Jev', 'naive Bayes', '(post-hoc)')}
    ${tr('majority class', f.vsMajority, 'Jev', 'majority')}
    ${g.vsBaselineOnSameItems && g.autoN < d.n ? tr('keyword lists, on Jev\'s auto-decided items', g.vsBaselineOnSameItems, 'Jev', 'keywords') : ''}
  </tbody></table></div>`;
  const tiles = `<div class="meta">
    <div><span class="eyebrow">test items</span><span class="mono">${d.n} · coverage ${pct(1 - (L.items.filter(i => i.pred === null).length / d.n))} answered</span></div>
    <div><span class="eyebrow">auto-decided by the gate</span><span class="mono">${pct(g.coverage)} (${g.autoN}/${d.n})</span></div>
    <div><span class="eyebrow">accuracy when it acts</span><span class="mono">${pct(g.autoAccuracy)}</span></div>
    <div><span class="eyebrow">held for a human</span><span class="mono">${g.escalated}</span></div></div>`;
  return `<div class="bars">${bars}</div>${tiles}${table}`;
}

function strataTable(L: Loaded): string {
  const kw = new Map(L.decision.strata.map(s => [JSON.stringify(s.label), s]));
  return `<div class="tablewrap"><table><thead><tr><th>true label</th><th>n</th><th>Jev</th><th>keywords</th><th>p</th><th>naive Bayes</th><th>p</th></tr></thead><tbody>${L.strong.strata.map(s => {
    const k = kw.get(JSON.stringify(s.label))!;
    const mark = (p: number, b: number, c: number) => (p < 0.05 ? (b > c ? ' class="num sig-jev"' : ' class="num sig-base"') : ' class="num"');
    return `<tr><td class="mono">${esc(String(s.label))}</td><td class="num">${s.n}</td><td class="num">${pct(s.jev)}</td><td class="num">${pct(k.baseline)}</td><td${mark(k.p, k.b, k.c)}>${pf(k.p)}</td><td class="num">${pct(s.strong)}</td><td${mark(s.p, s.b, s.c)}>${pf(s.p)}</td></tr>`;
  }).join('')}</tbody></table></div><p class="muted" style="font-size:13px">Green p: Jev significantly better on that stratum; red: significantly worse (exact McNemar). A pooled result does not ship if a stratum goes the other way (L41).</p>`;
}

function strip(L: Loaded): string {
  const W = 820, H = 150, x0 = 30, x1 = W - 20;
  const X = (v: number) => x0 + (x1 - x0) * v;
  const binary = L.kind === 'binary';
  const rows = binary ? [{ y: 50, label: 'true label: yes', test: (i: any) => i.label === true }, { y: 100, label: 'true label: no', test: (i: any) => i.label !== true }]
    : [{ y: 50, label: 'Jev right', test: (i: any) => i.pred === i.label }, { y: 100, label: 'Jev wrong', test: (i: any) => i.pred !== i.label }];
  const jit = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return ((h % 1000) / 1000 - 0.5) * 30; };
  const v = (i: any) => (binary ? i.score : i.confidence) as number;
  const lab = (x: number, text: string) => x > 0.8 ? `<text x="${X(x) - 4}" y="14" text-anchor="end">${text}</text>` : `<text x="${X(x) + 4}" y="14">${text}</text>`;
  const fz = L.frozen;
  const shade = binary
    ? (fz.band.hi > fz.band.lo ? `<rect x="${X(Math.max(0, fz.band.lo))}" y="18" width="${X(Math.min(1, fz.band.hi)) - X(Math.max(0, fz.band.lo))}" height="${H - 42}" fill="var(--hold)" opacity=".14"></rect>` : '')
      + `<line x1="${X(fz.threshold.t)}" x2="${X(fz.threshold.t)}" y1="14" y2="${H - 22}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3"></line>${lab(fz.threshold.t, `cut ${fz.threshold.t}`)}`
    : (fz.gate.confidenceAtLeast !== null ? `<rect x="${X(0)}" y="18" width="${X(fz.gate.confidenceAtLeast) - X(0)}" height="${H - 42}" fill="var(--hold)" opacity=".14"></rect><line x1="${X(fz.gate.confidenceAtLeast)}" x2="${X(fz.gate.confidenceAtLeast)}" y1="14" y2="${H - 22}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3"></line>${lab(fz.gate.confidenceAtLeast, `gate ${fz.gate.confidenceAtLeast}`)}` : '');
  const dots = L.items.filter(i => i.pred !== null).map(i => {
    const r = rows.find(r => r.test(i))!;
    const ok = i.pred === i.label;
    const fill = binary ? (ok ? 'var(--jev)' : 'var(--bad)') : (ok ? 'var(--jev)' : 'var(--bad)');
    return `<circle cx="${X(v(i)).toFixed(1)}" cy="${(r.y + jit(i.id)).toFixed(1)}" r="4" fill="${fill}" fill-opacity="${i.auto ? 0.8 : 0.35}" stroke="${fill}" stroke-width="1"><title>${esc(i.id)}: ${binary ? 'score' : 'confidence'} ${v(i)} · label ${esc(String(i.label))} · Jev ${esc(String(i.pred))}${i.auto ? '' : ' · held'}</title></circle>`;
  }).join('');
  const axis = [0, 0.25, 0.5, 0.75, 1].map(t => `<line x1="${X(t)}" x2="${X(t)}" y1="${H - 24}" y2="${H - 19}" stroke="var(--muted)"></line><text x="${X(t)}" y="${H - 6}" text-anchor="middle">${t}</text>`).join('');
  const labels = rows.map(r => `<text x="${x0}" y="${r.y - 18}">${r.label}</text>`).join('');
  return `<div class="strip"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Test items placed by ${binary ? 'rule score' : 'choice confidence'}, with the frozen ${binary ? 'cut and escalate band' : 'confidence gate'}">
    ${shade}<line x1="${x0}" x2="${x1}" y1="${H - 24}" y2="${H - 24}" stroke="var(--rule)"></line>${axis}${labels}${dots}</svg>
    <div class="legend"><span><i style="background:var(--jev)"></i>Jev's decision right</span><span><i style="background:var(--bad)"></i>wrong</span><span><i style="background:var(--hold);opacity:.35;border-radius:2px"></i>${binary ? 'escalate band (held for a human)' : 'below the gate (held for a human)'}</span><span>faded dot = held</span></div></div>
    <p class="muted" style="font-size:13px">x = ${binary ? 'the frozen regression\'s score for "yes"' : 'TypeSafe confidence on the decision question'}. Every mark is one of the ${L.decision.n} test items.</p>`;
}

function examples(L: Loaded): { html: string } {
  const wrong = L.items.filter(i => i.pred !== null && i.pred !== i.label);
  const held = L.items.filter(i => !i.auto && i.pred === i.label);
  const seen = new Set<string>();
  const right = L.items.filter(i => i.auto && i.pred === i.label).filter(i => { const k = String(i.label); if (seen.has(k)) return false; seen.add(k); return true; });
  const pick = [...right.slice(0, 4), ...held.slice(0, 2), ...wrong.slice(0, 3)];
  const S = STORIES[L.id], cap = S.quoteChars ?? 420;
  const state = (s: unknown, id: string) => S.paraphrase?.[id] ? `<b>paraphrased (the data may not be redistributed):</b> ${esc(S.paraphrase[id])}`
    : typeof s === 'string' ? esc(s) : Object.entries(s as Record<string, unknown>).map(([k, v]) => { const t = String(v); return `<b>${esc(k)}:</b> ${esc(t.length > cap ? t.slice(0, cap) + '…' : t)}`; }).join('<br>');
  const answer = (id: string, a: any) => {
    if (a.type === 'noul') return `<div class="a${id === L.target ? ' target' : ''}"><span>${esc(id)}</span><div class="t"><span style="width:${(a.p * 100).toFixed(0)}%"></span></div><span class="p">${a.p.toFixed(2)}</span></div>`;
    if (a.type === 'choice') {
      const top = Object.entries(a.probabilities as Record<string, number>).sort((x, y) => y[1] - x[1]);
      return `<div class="a${id === L.target ? ' target' : ''}"><span>${esc(id)} → ${esc(a.choice)}</span><div class="t"><span style="width:${(top[0][1] * 100).toFixed(0)}%"></span></div><span class="p">${top[0][1].toFixed(2)}</span></div>${top[1] && top[1][1] >= 0.05 ? `<div class="a muted"><span>&nbsp;&nbsp;next: ${esc(top[1][0])}</span><div class="t"><span style="width:${(top[1][1] * 100).toFixed(0)}%;opacity:.5"></span></div><span class="p">${top[1][1].toFixed(2)}</span></div>` : ''}`;
    }
    return '';
  };
  const html = pick.map(i => {
    const kind = i.pred !== i.label ? 'wrong' : !i.auto ? 'held' : 'right';
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    return `<article class="card" data-kind="${kind}"><div class="top"><span class="mono">${esc(i.id)}</span><span class="outcome">
      <span class="chip">label ${esc(String(i.label))}</span>
      <span class="chip ${kind === 'wrong' ? 'no' : kind === 'held' ? 'hold' : 'ok'}">Jev ${esc(String(i.pred))}${i.auto ? '' : ' · held'}</span></span></div>
      <div class="state">${state(i.state, i.id)}</div>
      <div class="ans">${Object.entries(i.answers).map(([id, a]) => answer(id, a)).join('')}</div>
      <div class="outcome muted"><span class="chip ${same(i.baseline, i.label) ? 'ok' : 'no'}">keywords ${esc(String(i.baseline))}</span><span class="chip ${same(i.strong, i.label) ? 'ok' : 'no'}">naive Bayes ${esc(String(i.strong))}</span>${L.kind === 'binary' ? `<span class="chip">score ${i.score}</span>` : `<span class="chip">confidence ${i.confidence}</span>`}</div></article>`;
  }).join('');
  return { html };
}

const TABS_JS = `document.querySelectorAll('[data-tabs]').forEach(function(bar){var cards=document.querySelectorAll('#examples .card');bar.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;bar.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});var k=b.getAttribute('data-k');cards.forEach(function(c){c.hidden=!(k==='all'||c.getAttribute('data-kind')===k)})})});`;

function licenceBox(S: Story): string {
  const x = S.licence;
  return `<aside class="licence ${x.tone}" aria-label="Data licence"><span class="eyebrow">Data licence</span><p><b>${esc(x.terms)}.</b> ${esc(x.use)}</p><p class="muted">Verified: ${esc(x.verified)}</p></aside>`;
}

function suiteBanner(L: Loaded): string {
  const u = suiteSummary(L);
  const cls = (v: string) => (v === 'ACCEPT' ? 'win' : 'lose');
  return `<div class="suite"><span class="eyebrow">Standard gate suite</span><div class="suite-row"><span class="pill ${cls(u.verdict)}">${esc(u.verdict)}</span><span>declared headline (vs keyword lists)${u.refusing.length ? `: refused by ${esc(u.refusing.join(', '))}` : ''}${u.codes.length ? ` · <span class="mono">${esc(u.codes.join(', '))}</span>` : ''}</span></div>
    <div class="suite-row"><span class="pill ${cls(u.posthocVerdict)}">${esc(u.posthocVerdict)}</span><span>post-hoc headline (vs naive Bayes)${u.posthocCodes.length ? ` · <span class="mono">${esc(u.posthocCodes.join(', '))}</span>` : ''}</span></div></div>`;
}

function gatesSection(L: Loaded): string {
  const mark: Record<string, string> = { PASS: 'ok', REFUSE: 'no', WARN: 'hold', SKIP: '' };
  const rows = gateRows(L).map(r => `<tr><td class="mono">${esc(r.id)}</td><td><span class="chip ${mark[r.verdict]}">${esc(r.verdict)}</span>${r.code ? ` <span class="mono muted">${esc(r.code)}</span>` : ''}</td><td class="why">${esc(r.why)}</td></tr>`).join('');
  const u = suiteSummary(L), bg = bounded(L);
  return `<section><h2>Gates</h2><p class="muted">kit/standard-gate.ts on the saved readings (no new calls). G5–G7 test the declared headline, the frozen rule against the keyword lists, with the true labels as strata.</p>
    <div class="tablewrap"><table class="gates"><thead><tr><th>gate</th><th>verdict</th><th>why</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p><b>Post-hoc headline</b> (frozen rule vs naive Bayes): ${esc(u.posthocVerdict)}${u.posthocWhy ? `. ${esc(u.posthocWhy)}` : '.'}</p>
    <h3>Bounded gate (post-hoc, kit/threshold.ts)</h3>
    <div class="meta"><div><span class="eyebrow">frozen gate (record)</span><span>${esc(bg.record)}; no error bound was promised</span></div>
      <div><span class="eyebrow">bounded gate, fitted on fit</span><span class="mono">${esc(bg.cuts)} · budget ${(bg.maxError * 100).toFixed(0)}%</span></div>
      <div><span class="eyebrow">on test</span><span class="mono">acts on ${(bg.testCoverage * 100).toFixed(1)}% · ${bg.held === null ? 'nothing auto-decided' : `error ${(bg.testError * 100).toFixed(1)}% · bound ${bg.held ? 'held' : 'broke'}`}${bg.unstable ? ' · cut unstable' : ''}</span></div></div>
    <p>${esc(bg.text)}</p><p class="muted" style="font-size:13.5px">Calibration: ${esc(calibrationNote(L))}</p></section>`;
}

// ---------------------------------------------------------------- domain page

function domainPage(L: Loaded): string {
  const S = STORIES[L.id], V = S.verdict(L);
  const ex = examples(L);
  const counts = { right: ex.html.split('data-kind="right"').length - 1, held: ex.html.split('data-kind="held"').length - 1, wrong: ex.html.split('data-kind="wrong"').length - 1 };
  const body = `
  <nav class="crumbs"><a href="index.html">← All six domains</a></nav>
  <header class="head"><span class="eyebrow">${esc(S.area)} · Jev cookbook</span><h1>${esc(S.title)}</h1><p class="lede">${esc(S.oneLine)}</p></header>
  ${licenceBox(S)}
  ${suiteBanner(L)}
  <div class="verdict"><span class="pill ${verdictClass(V.label)}">${esc(V.label)}</span><p>${md(V.text)}</p></div>
  <section><h2>The job</h2><p>${esc(S.problem)}</p>
    <div class="meta"><div><span class="eyebrow">data</span><span><a href="${esc(S.dataset.url)}">${esc(S.dataset.name)}</a></span></div>
    <div><span class="eyebrow">licence</span><span>${esc(S.dataset.licence)}${S.dataset.licenceNote ? `<br><span class="muted">${esc(S.dataset.licenceNote)}</span>` : ''}</span></div>
    <div><span class="eyebrow">what Jev reads</span><span>${md(S.stateNote)}</span></div></div></section>
  <section><h2>The question set</h2><p class="muted">One call per item, all questions batched. The right-hand column is the kit's label-free quality check: the share of answers that reached a confident end, on the pilot, fit and test runs.</p>${questionList(L, S)}
    <h3>What the quality pass changed</h3><ul class="changes">${S.changes.map(c => `<li>${md(c)}</li>`).join('')}</ul></section>
  <section><h2>Not for Jev</h2><p class="muted">Judgements this set deliberately does not ask, and what does them instead.</p><div class="nfj">${S.notForJev.map(([a, b]) => `<div>${md(a)}</div><div>${md(b)}</div>`).join('')}</div></section>
  <section><h2>Scoreboard</h2><p class="muted">${L.decision.n} held-out test items, asked once. Accuracy counts every item (an unanswered item would count as wrong). Paired exact McNemar on the same items.</p>${scoreboard(L)}</section>
  <section><h2>The operating point</h2><p>${md(S.thresholdWhy(L))}</p><p class="muted" style="font-size:13.5px">Why this budget: ${md(L.kind === 'binary' ? `${L.frozen.threshold.why} ${L.frozen.band.why}` : L.frozen.gate.why)}</p>${strip(L)}</section>
  ${gatesSection(L)}
  <section id="examples"><h2>Real items, real answers</h2><p class="muted">Test items with every typed answer Jev returned. Picked by rule: the first correct item per label, then held and wrong ones, in id order.</p>
    <div class="tabs" data-tabs><button type="button" aria-pressed="true" data-k="all">All</button><button type="button" aria-pressed="false" data-k="right">Right (${counts.right})</button><button type="button" aria-pressed="false" data-k="held">Held (${counts.held})</button><button type="button" aria-pressed="false" data-k="wrong">Wrong (${counts.wrong})</button></div>
    <div class="cards">${ex.html}</div></section>
  <section><h2>Where it fails</h2><ul class="fails">${S.fails(L).map(f => `<li>${md(f)}</li>`).join('')}</ul><h3>By true label</h3>${strataTable(L)}
    <h3>Honest limits</h3><ul class="changes">${S.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul></section>
  <footer class="foot"><span>Model <span class="mono">${esc(L.model)}</span>, answered by <span class="mono">${esc(L.answeredBy.join(', '))}</span>. Calls: pilot ${L.calls.pilot}, fit ${L.calls.fit}, test ${L.calls.test}. Built from commit <span class="mono">${esc(commit)}</span>.</span>
    <span>Every figure comes from <span class="mono">${REPO_PATH}/${L.id}/results/</span> (kit result files and decide.ts output). Reproduce: <span class="mono">node ${REPO_PATH}/${L.id}/prepare.ts</span>, then the kit. Citation: ${esc(S.dataset.citation)}</span></footer>`;
  return page(S.title, `${S.area}: ${S.oneLine}`, body, TABS_JS);
}

// ---------------------------------------------------------------- index

function indexPage(all: Loaded[]): string {
  const calls = all.reduce((s, L) => s + L.calls.pilot + L.calls.fit + L.calls.test, 0);
  const rows = all.map(L => {
    const S = STORIES[L.id], V = S.verdict(L), f = L.decision.forced;
    return `<a class="card dom" href="${L.id}.html"><div class="top"><span class="eyebrow">${esc(S.area)}</span><span class="pill ${verdictClass(V.label)}">${esc(V.label)}</span></div>
      <h2>${esc(S.title)}</h2><p class="muted">${esc(S.oneLine)}</p>
      <div class="mini"><div class="bar"><div>Jev</div><div class="track"><div class="fill" style="width:${(f.jevAccuracy * 100).toFixed(1)}%;background:var(--jev)"></div></div><div class="v">${pct(f.jevAccuracy)}</div></div>
      <div class="bar"><div>Keywords</div><div class="track"><div class="fill" style="width:${(f.baselineAccuracy * 100).toFixed(1)}%;background:var(--base)"></div></div><div class="v">${pct(f.baselineAccuracy)}</div></div>
      <div class="bar"><div>Naive Bayes</div><div class="track"><div class="fill" style="width:${(L.strong.forced.accuracyB * 100).toFixed(1)}%;background:var(--nb)"></div></div><div class="v">${pct(L.strong.forced.accuracyB)}</div></div></div>
      <span class="mono muted" style="font-size:12px">n=${L.decision.n} · gates ${esc(suiteSummary(L).verdict)}${suiteSummary(L).codes.length ? ` (${esc(suiteSummary(L).codes.join(', '))})` : ''} · vs naive Bayes ${esc(suiteSummary(L).posthocVerdict)} · bounded gate acts on ${pct(bounded(L).testCoverage)}</span>
      <span class="lic ${S.licence.tone}">${esc(S.licence.terms)}</span></a>`;
  }).join('');
  const body = `
  <header class="head"><span class="eyebrow">Jev cookbooks · public data · ${all.length} domains</span><h1>Typed Decisions, Tested</h1>
    <p class="lede">Six everyday decisions, each asked of Jev as a small set of literal, typed questions, on real public datasets with labels nobody here wrote. Each is scored once on 150 held-out items against cheap baselines.</p></header>
  <section><div class="cards idx">${rows}</div></section>
  <section><h2>How every domain was run</h2><ol class="changes">
    <li>Fetch a public labelled dataset; mask emails and phone numbers; draw 100 fit and 150 test items with a fixed seed, disjoint by id and text.</li>
    <li>Write the questions: literal, one record, typed, with an escape option on every choice. Run a 30-item label-free quality pass; move or reword anything MOVE-TO-CODE.</li>
    <li>Ask Jev the 100 fit items; fit the rule's weights and every threshold there (a cost ratio, a precision target, an error budget); freeze and commit it.</li>
    <li>Ask Jev the 150 test items once, apply the frozen rule once, compare with paired exact McNemar against the declared keyword baseline and, post-hoc, a naive Bayes trained on 10–20× more labels.</li></ol>
    <p class="muted">Order matters, and git records it: splits and questions were committed before any call, rules frozen before any test call. ${calls} Jev calls in total, all answered by <span class="mono">${esc([...new Set(all.flatMap(L => L.answeredBy))].join(', '))}</span>.</p></section>
  <section><h2>What the six say together</h2><ul class="changes">
    <li>Where the answer is written in the text (a routing request, a clause's function, a complaint), literal questions beat both baselines, and the escape option is what made "none of these" work.</li>
    <li>Where the answer is a pattern across the corpus rather than in the record (fraudulent job ads), a model trained on the labels wins, and it wins clearly.</li>
    <li>Where the labels encode a team's habit rather than the text (maintainers tagging bug-shaped reports as questions), a trained model learns the habit and Jev does not. Check the strata before trusting a pooled win.</li>
    <li>A gate fitted honestly can hold nothing back: on intent routing and comment spam the fit split met the error budget everywhere, so every test item went through, the wrong ones included. Jev rarely says "not sure" (NETER P5); the escape option and the fit-split budget do that work.</li></ul></section>
  <footer class="foot"><span>Built from commit <span class="mono">${esc(commit)}</span> by <span class="mono">demo/build.ts</span>. Every number comes from <span class="mono">cookbooks/*/results/</span>.</span></footer>`;
  return page('Typed Decisions, Tested', 'Six Jev cookbooks on public data, each scored once against cheap baselines.', body).replace('</style>', `.idx{grid-template-columns:repeat(auto-fill,minmax(min(100%,400px),1fr))}.dom{text-decoration:none;color:inherit;transition:border-color .15s}.dom:hover{border-color:var(--jev)}.dom h2{font-size:24px}.mini{display:flex;flex-direction:column;gap:6px}.mini .bar{grid-template-columns:92px minmax(0,1fr) 52px;font-size:12.5px}.mini .bar .track{grid-column:auto;grid-row:auto;height:10px}</style>`);
}

const all = DOMAINS.map(load);
for (const L of all) writeFileSync(join(OUT, `${L.id}.html`), domainPage(L));
writeFileSync(join(OUT, 'index.html'), indexPage(all));
console.log(`wrote ${all.length} domain pages + index.html → ${OUT}`);
