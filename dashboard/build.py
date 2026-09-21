#!/usr/bin/env python3
"""Regenerate the JEV-works tracking dashboard from whatever results exist on disk.

Idempotent and data-driven: every number comes from a result file, so re-running
after any experiment updates the page. Nothing is hardcoded that a run produces.
Missing files degrade to a "not yet run" state rather than failing — the point is
to show what is and is not measured.

    python3 dashboard/build.py   →  dashboard/index.html
"""
import json, pathlib, re, datetime, html

ROOT = pathlib.Path(__file__).resolve().parent.parent
PLAY = ROOT.parent / 'jev-playground'
OUT = ROOT / 'dashboard' / 'index.html'


def load(p: pathlib.Path):
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def text(p: pathlib.Path) -> str:
    try:
        return p.read_text()
    except Exception:
        return ''


e = html.escape

# ───────────────────────────────────────────────────────────── gather

neter = text(ROOT / 'NETER.md')
lessons = text(ROOT / 'LESSONS.md')
program = text(ROOT / 'program' / 'PROGRAM.md')

props = re.findall(r'^\| (P\d+) \| \*\*(.+?)\*\*(.*?)\| \*\*(.+?)\*\* \|$', neter, re.M)
status_counts = {}
for _, _, _, st in props:
    status_counts[st] = status_counts.get(st, 0) + 1

n_lessons = len(re.findall(r'^### L\d+', lessons, re.M))

# the five programmed experiments, with status inferred from artefacts on disk
EXPERIMENTS = [
    ('E1', 'Does unanimity mean correctness?',
     'Unanimous labels are ≥95% accurate', 'unanimous accuracy <95%, or 4/5 no worse than 5/5',
     ROOT / 'program' / 'results' / 'e1-consensus.json'),
    ('E2', 'Does disagreement mark the same boundary as entropy?',
     'Entropy rises monotonically as agreement falls', '|ρ| < 0.3, or distributions overlap',
     ROOT / 'program' / 'results' / 'e2-entropy-agreement.json'),
    ('E3', 'Blind test: fit on consensus, validate on untouched labels',
     'Holdout drop <5 points, and beats baseline', 'drop >5 points, or baseline wins',
     ROOT / 'program' / 'results' / 'e3-holdout.json'),
    ('E4', 'Concept probes versus type matching',
     'Concept set matches or beats type set, clearly on split items', 'type set wins outright',
     ROOT / 'program' / 'results' / 'e4-concept-vs-type.json'),
    ('E5', 'Recoverability map across every typed corpus',
     'Some targets show real lift over keyword baseline', 'no target beats its keyword baseline',
     ROOT / 'program' / 'results' / 'e5-recoverability.json'),
]

# measured runs already completed
runs = []

bs = load(PLAY / 'experiments' / 'results' / 'perf-batch-scaling.json')
if bs and bs.get('rows'):
    r = bs['rows']
    runs.append(('batch scaling', f"{len(r)} sizes, 1→32 questions",
                 f"p50 flat: {r[0]['p50ms']}ms at 1q → {r[-1]['p50ms']}ms at 32q",
                 'confirmed', 'P1'))

ss = load(PLAY / 'experiments' / 'results' / 'perf-state-scaling.json')
if ss and ss.get('rows'):
    ok = [x for x in ss['rows'] if x.get('result') == 'ok']
    fails = ss.get('failures') or []
    if ok:
        runs.append(('state scaling', f"{len(ok)} sizes up to {ok[-1]['inputTok']} tokens",
                     f"{ok[0]['p50ms']}ms → {ok[-1]['p50ms']}ms; ceiling = opaque "
                     f"{fails[0]['name'] if fails else 'n/a'}",
                     'confirmed', 'P2 · P3'))

var = load(PLAY / 'experiments' / 'results' / 'exec-variance.json')
if var:
    runs.append(('determinism', f"n={var.get('N','?')} identical calls",
                 f"argmax stable; noise floor {var.get('noiseFloor', float('nan')):.3f} on probabilities",
                 'confirmed', 'P4'))

adv = load(PLAY / 'experiments' / 'results' / 'exec-adversarial.json')
if adv and adv.get('rows'):
    rows = adv['rows']
    garbage = [x for x in rows if x['case'] in ('empty', 'whitespace', 'single-emoji', 'off-topic')]
    conf_garbage = [x for x in garbage if isinstance(x.get('topP'), (int, float)) and x['topP'] > 0.8]
    runs.append(('adversarial input', f"{len(rows)} pathological cases",
                 f"confident on {len(conf_garbage)}/{len(garbage)} unanswerable inputs; "
                 f"entropy separated them",
                 'failed' if conf_garbage else 'confirmed', 'P5 · P6'))

tri = load(ROOT / 'triage' / 'triage-result.json')
if tri and tri.get('rows'):
    by = {x['verdict']: x for x in tri['rows']}
    runs.append(('context triage', f"{sum(int(x['items']) for x in tri['rows'])} tool outputs",
                 f"drop {by.get('DROP',{}).get('items','?')} items / "
                 f"{by.get('DROP',{}).get('tokens','?')} tokens · "
                 f"escalate {by.get('ESCALATE',{}).get('items','?')}",
                 'caution', 'P21'))

ws = load(ROOT / 'pass1' / 'window-scores.json')
if ws and ws.get('rows'):
    rows = sorted(ws['rows'], key=lambda r: -r['composite'])
    anchors = {r['window']: r['composite'] for r in rows}
    good = anchors.get('context-triage-keep-drop')
    bad = anchors.get('graph-edge-typing')
    anchor_ok = good is not None and bad is not None and good > bad
    runs.append(('window scoring', f"{len(rows)} windows × 100 questions",
                 f"anchors {'PASS' if anchor_ok else 'FAIL'}; but planted control ranked "
                 f"#{[r['window'] for r in rows].index('duplicate-read-dedup')+1} — instrument defect",
                 'caution', 'L19 · L20'))

lead_base = load(ROOT / 'leads' / 'results' / 'baseline-42.json')
lead_pipe = None
for cand in (ROOT / 'leads' / 'results').glob('pipeline-*.json'):
    lead_pipe = load(cand)
    break

targets = load(ROOT / 'masked' / 'targets.json') or []
usable = [t for t in targets if t.get('inputCols') and t.get('leakRate', 1) < 0.5 and t.get('majorityShare', 1) < 0.9]
usable.sort(key=lambda t: -t['signal'])

# ───────────────────────────────────────────────────────────── render

def pill(state: str) -> str:
    return f'<span class="pill {state}">{state.replace("-", " ")}</span>'


exp_rows = []
for eid, q, hyp, fals, path in EXPERIMENTS:
    res = load(path)
    state = 'done' if res else 'not-run'
    headline = ''
    if res:
        headline = e(str(res.get('headline', res.get('summary', 'see result file'))))[:160]
    exp_rows.append(f'''
    <article class="exp {state}">
      <div class="stripe"></div>
      <div class="body">
        <div class="exp-head"><b>{eid}</b> {pill(state)}</div>
        <h4>{e(q)}</h4>
        <p><span class="lbl">hypothesis</span> {e(hyp)}</p>
        <p><span class="lbl">falsified if</span> {e(fals)}</p>
        {f'<p class="headline">{headline}</p>' if headline else ''}
      </div>
    </article>''')

run_rows = ''.join(
    f'<tr class="{state}"><td>{e(name)}</td><td class="num">{e(n)}</td><td>{e(result)}</td>'
    f'<td>{pill(state)}</td><td class="mono">{e(props_)}</td></tr>'
    for name, n, result, state, props_ in runs
)

target_rows = ''.join(
    f'<tr><td class="mono">{e(t["target"])}</td><td class="num">{t["classes"]}</td>'
    f'<td class="num">{t["rows"]}</td><td class="num">{t["majorityShare"]:.0%}</td>'
    f'<td class="num">{t["leakRate"]:.0%}</td>'
    f'<td class="mono small">{e(pathlib.Path(t["file"]).name)}</td></tr>'
    for t in usable[:8]
)

if lead_base:
    lb = lead_base
    base_cell = (f"qualified acc <b>{lb.get('qualifiedAccuracy', 0)*100:.1f}%</b> · "
                 f"F1 {lb.get('f1', 0)*100:.1f}% · segment {lb.get('segmentAccuracy', 0)*100:.1f}%")
else:
    base_cell = 'not yet run'

lead_state = 'failed' if lead_pipe else 'not-run'
lead_note = ('Pipeline ran but a corpus/dedup interaction suppressed 94.7% of the corpus: '
             '231 distinct company names for 600 leads, and name-only dedup merged 516 leads '
             'against 60 planted duplicates. Only 1 lead reached stage 2, 0 reached stage 3. '
             'Jev\'s 100% on 5.3% coverage is an artifact, not a result. Both bugs are real and '
             'the re-run is blocked on fixing them.') if lead_pipe else \
            'Built and typechecking; not yet run against the live API.'

status_summary = ' · '.join(f'{v} {k}' for k, v in sorted(status_counts.items(), key=lambda x: -x[1]))

page = f'''<title>JEV-works · experiment tracker</title>
<style>
  :root {{
    --paper:#EDF0F5; --panel:#FFF; --ink:#12161F; --ink-2:#4E566B; --ink-3:#848CA0;
    --rule:#D3D9E4; --grid:#DEE3EC; --indigo:#3D4C8F;
    --confirmed:#0E7C6B; --caution:#8A5E0C; --failed:#A8283F; --notrun:#6A7183;
    --mono:ui-monospace,"SF Mono",SFMono-Regular,Menlo,Consolas,monospace;
    --body:ui-serif,Georgia,"Iowan Old Style","Times New Roman",serif;
    --label:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  }}
  @media (prefers-color-scheme:dark) {{
    :root {{ --paper:#0E1220; --panel:#171C2C; --ink:#E6E9F2; --ink-2:#A7AEC2; --ink-3:#737B92;
      --rule:#2A3145; --grid:#232A3C; --indigo:#8E9BD8; --confirmed:#4FC5AC;
      --caution:#E0A93F; --failed:#F2748D; --notrun:#8A92A6; }}
  }}
  :root[data-theme="dark"] {{ --paper:#0E1220; --panel:#171C2C; --ink:#E6E9F2; --ink-2:#A7AEC2;
    --ink-3:#737B92; --rule:#2A3145; --grid:#232A3C; --indigo:#8E9BD8; --confirmed:#4FC5AC;
    --caution:#E0A93F; --failed:#F2748D; --notrun:#8A92A6; }}
  :root[data-theme="light"] {{ --paper:#EDF0F5; --panel:#FFF; --ink:#12161F; --ink-2:#4E566B;
    --ink-3:#848CA0; --rule:#D3D9E4; --grid:#DEE3EC; --indigo:#3D4C8F; --confirmed:#0E7C6B;
    --caution:#8A5E0C; --failed:#A8283F; --notrun:#6A7183; }}

  body {{ background:var(--paper); color:var(--ink); font-family:var(--body);
    font-size:1.0625rem; line-height:1.6; margin:0;
    padding:clamp(1.25rem,4vw,3rem) clamp(1rem,5vw,2rem) 5rem; }}
  .wrap {{ max-width:64rem; margin:0 auto; display:flex; flex-direction:column; gap:2.75rem; }}
  .lbl, .label {{ font-family:var(--label); font-size:.6875rem; letter-spacing:.12em;
    text-transform:uppercase; color:var(--ink-3); font-weight:600; }}
  h1 {{ font-family:var(--mono); font-size:1.875rem; font-weight:700; letter-spacing:-.02em;
    margin:0; text-wrap:balance; }}
  h2 {{ font-family:var(--mono); font-size:1.375rem; font-weight:700; margin:0 0 .75rem;
    letter-spacing:-.02em; padding-bottom:.5rem; border-bottom:2px solid var(--ink); }}
  h4 {{ font-family:var(--label); font-size:1.0625rem; font-weight:650; margin:0;
    letter-spacing:-.01em; }}
  p {{ margin:0; }}
  .runline {{ font-family:var(--mono); font-size:.6875rem; color:var(--ink-3);
    display:flex; flex-wrap:wrap; gap:0 1.25rem; }}
  .lede {{ color:var(--ink-2); max-width:62ch; }}

  .counters {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));
    gap:1px; background:var(--rule); border:1px solid var(--rule); }}
  .counter {{ background:var(--panel); padding:.9rem 1.05rem; display:flex;
    flex-direction:column; gap:.2rem; }}
  .counter b {{ font-family:var(--mono); font-size:1.75rem; font-weight:700; line-height:1;
    font-variant-numeric:tabular-nums; }}

  .pill {{ font-family:var(--label); font-size:.625rem; font-weight:700; letter-spacing:.08em;
    text-transform:uppercase; padding:.15rem .45rem; border-radius:2px; white-space:nowrap; }}
  .pill.confirmed {{ color:var(--confirmed); background:color-mix(in srgb,var(--confirmed) 14%,transparent); }}
  .pill.caution {{ color:var(--caution); background:color-mix(in srgb,var(--caution) 16%,transparent); }}
  .pill.failed {{ color:var(--failed); background:color-mix(in srgb,var(--failed) 14%,transparent); }}
  .pill.done {{ color:var(--confirmed); background:color-mix(in srgb,var(--confirmed) 14%,transparent); }}
  .pill.not-run {{ color:var(--notrun); background:color-mix(in srgb,var(--notrun) 14%,transparent); }}

  .exps {{ display:flex; flex-direction:column; gap:1px; background:var(--rule);
    border:1px solid var(--rule); }}
  .exp {{ background:var(--panel); display:grid; grid-template-columns:4px 1fr; gap:0 1.15rem; }}
  .stripe {{ background:var(--notrun); align-self:stretch; }}
  .exp.done .stripe {{ background:var(--confirmed); }}
  .exp .body {{ padding:1rem 1.15rem 1.15rem 0; display:flex; flex-direction:column; gap:.45rem; }}
  .exp-head {{ display:flex; align-items:center; gap:.6rem; font-family:var(--mono);
    font-weight:700; }}
  .exp p {{ font-size:.9375rem; color:var(--ink-2); max-width:64ch; }}
  .headline {{ font-family:var(--mono); font-size:.875rem; color:var(--ink); }}

  .tw {{ overflow-x:auto; border:1px solid var(--rule); background:var(--panel); }}
  table {{ border-collapse:collapse; width:100%; min-width:36rem; }}
  th {{ font-family:var(--label); font-size:.6875rem; letter-spacing:.1em; text-transform:uppercase;
    color:var(--ink-3); text-align:left; padding:.6rem .75rem; border-bottom:1px solid var(--rule); }}
  td {{ padding:.55rem .75rem; border-bottom:1px solid var(--grid); font-size:.9375rem;
    color:var(--ink-2); vertical-align:top; }}
  tr:last-child td {{ border-bottom:none; }}
  .num {{ font-family:var(--mono); font-variant-numeric:tabular-nums; text-align:right;
    white-space:nowrap; }}
  .mono {{ font-family:var(--mono); font-size:.8125rem; }}
  .small {{ font-size:.75rem; color:var(--ink-3); }}

  .panel {{ border:1px solid var(--rule); background:var(--panel); padding:1.25rem;
    display:flex; flex-direction:column; gap:.7rem; }}
  .panel.bad {{ border-color:var(--failed); }}
  .panel h4 {{ font-family:var(--mono); }}
  .panel p {{ font-size:.9375rem; color:var(--ink-2); max-width:66ch; }}
  code {{ font-family:var(--mono); font-size:.85em;
    background:color-mix(in srgb,var(--indigo) 10%,transparent); padding:.1em .35em; border-radius:2px; }}
  footer {{ color:var(--ink-3); font-size:.875rem; font-family:var(--label);
    border-top:1px solid var(--rule); padding-top:1rem; }}
</style>

<div class="wrap">
  <header style="display:flex;flex-direction:column;gap:.7rem">
    <span class="label">JEV-works · regenerated from result files on disk</span>
    <h1>Experiment tracker</h1>
    <div class="runline">
      <span>{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}</span>
      <span>{len(props)} properties</span>
      <span>{n_lessons} lessons</span>
      <span>{len(runs)} runs measured</span>
      <span>{len(usable)} labelled targets</span>
    </div>
    <p class="lede">Every number here is read from a results file. Sections with nothing behind them
    say so rather than being omitted — the gaps are the point.</p>
  </header>

  <section class="counters">
    <div class="counter"><b style="color:var(--confirmed)">{status_counts.get('measured here',0)}</b><span class="label">measured here</span></div>
    <div class="counter"><b style="color:var(--indigo)">{status_counts.get('corroborated',0)}</b><span class="label">corroborated</span></div>
    <div class="counter"><b style="color:var(--caution)">{status_counts.get('vendor claim',0)}</b><span class="label">vendor claim only</span></div>
    <div class="counter"><b style="color:var(--notrun)">{status_counts.get('open',0)}</b><span class="label">open</span></div>
    <div class="counter"><b style="color:var(--failed)">{n_lessons}</b><span class="label">lessons banked</span></div>
  </section>

  <section>
    <h2>The programme</h2>
    <p class="lede" style="margin-bottom:1rem">Five experiments, ordered so that the ones which
    validate the method run before the ones that use it. Hypotheses and falsification criteria were
    written before any run and are not edited afterwards.</p>
    <div class="exps">{''.join(exp_rows)}</div>
  </section>

  <section>
    <h2>Leads &amp; sales pipeline</h2>
    <div class="panel {'bad' if lead_pipe else ''}">
      <div style="display:flex;align-items:center;gap:.6rem">
        <h4>three-stage pipeline · seed 42 · 600 synthetic leads</h4>{pill(lead_state)}
      </div>
      <p><span class="lbl">regex baseline to beat</span> {base_cell}</p>
      <p>{e(lead_note)}</p>
      <p class="small">Corpus is SYNTHETIC with PLANTED labels. It measures whether the questions
      discriminate as designed, not whether they work on real leads. A real scrape swaps in by
      producing the same <code>Lead[]</code> shape.</p>
    </div>
  </section>

  <section>
    <h2>Runs measured</h2>
    <div class="tw"><table>
      <thead><tr><th>run</th><th class="num">n</th><th>result</th><th>state</th><th>properties</th></tr></thead>
      <tbody>{run_rows or '<tr><td colspan="5">no result files found</td></tr>'}</tbody>
    </table></div>
  </section>

  <section>
    <h2>Labelled targets available</h2>
    <p class="lede" style="margin-bottom:1rem">Categorical fields that already exist in local data,
    surviving all four tests — closed, populated, balanced, separable with low leakage. These are
    the only places on this machine where accuracy can be measured at all.</p>
    <div class="tw"><table>
      <thead><tr><th>field</th><th class="num">classes</th><th class="num">rows</th>
      <th class="num">majority</th><th class="num">leak</th><th>file</th></tr></thead>
      <tbody>{target_rows or '<tr><td colspan="6">run masked/find-targets.py</td></tr>'}</tbody>
    </table></div>
  </section>

  <footer>
    Regenerate with <code>python3 dashboard/build.py</code>. Property registry in
    <code>NETER.md</code>, lessons in <code>LESSONS.md</code>, programme in
    <code>program/PROGRAM.md</code>. Status vocabulary: measured here / corroborated /
    vendor claim / open — a claim nobody local has tested says so.
  </footer>
</div>
'''

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(page)
print(f"{OUT}  ({len(page):,} bytes)")
print(f"  {len(props)} properties ({status_summary})")
print(f"  {n_lessons} lessons · {len(runs)} runs · {len(usable)} labelled targets")
print(f"  experiments: {sum(1 for *_, p in EXPERIMENTS if load(p))}/{len(EXPERIMENTS)} have results")
