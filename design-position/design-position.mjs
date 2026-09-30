// DESIGN_POSITION — a Jev question set over site copy (one headline and the text directly under it).
// House rules from JEV-works: literal, single-state, one judgement per question. Banned words,
// prices and figures are regex in code (the baseline), never questions; ranking happens in code.
import { readFile, writeFile } from 'node:fs/promises';
const KEY = process.env.TYPESAFE_API_KEY; if (!KEY) { console.error('TYPESAFE_API_KEY not set'); process.exit(1); }
const MODEL = process.env.JEV_MODEL ?? 'jev-1.13.0';
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

export const DESIGN_POSITION = {
  context: 'Positioning check on marketing copy: one headline and the text directly under it.',
  produces: 'per-block flags (honesty test, limit stated, register, staff implied) recombined per artboard in code',
  questions: {
    teamImplied: { type: 'noul', instructions: 'Read only the headline. Could a stranger take it to mean a firm arrives with a team and transforms the whole company?',
      criteria: { true: 'The headline alone reads as a company-wide transformation by a team or firm.', false: 'The headline alone reads as one person, one job, or a bounded piece of work.' } },
    limitStated: { type: 'noul', instructions: 'Does the text under the headline define or limit the claim: say what the work is, or what it is not?',
      criteria: { true: 'The next sentence narrows, defines, or says what is excluded.', false: 'It restates, amplifies, or adds no definition or limit.' } },
    readerFirst: { type: 'noul', instructions: 'Does the text start from the reader’s own situation before it describes the service?',
      criteria: { true: 'The first clause is about the reader, their company, or their tools.', false: 'The first clause is about the service, the provider, or a promise.' } },
    staffImplied: { type: 'noul', instructions: 'Does the wording imply a staff of more than one practitioner doing the work?',
      criteria: { true: '"We", "our team", "consultants" or similar implies several people deliver the work.', false: 'One named or implied person does the work, or no one is implied.' } },
    oneJob: { type: 'noul', instructions: 'Does the text say the unit of work is one job the company already does?' },
    toolsOwned: { type: 'noul', instructions: 'Does the text say the work runs in tools the company already pays for or owns?' },
    register: { type: 'choice', instructions: 'How does this text read?',
      criteria: { pitch: 'Sells: promises an outcome, asks to be admired, uses a slogan cadence.', explanation: 'Explains plainly what happens and what does not, in full sentences.', teaching: 'Instructs the reader how to do something themselves.', manifesto: 'Declares beliefs or principles rather than an offer.' } },
    hype: { type: 'score', instructions: 'How much does this text sell rather than explain?',
      criteria: ['Plain statement of what happens.', 'Mostly plain with one promotional phrase.', 'Promotional framing with some concrete content.', 'Slogan or promise with nothing concrete under it.'] },
  },
  notForJev: [
    { judgement: 'Does the copy use a banned word from 03-language.md?', instead: 'Regex over the list, in code. Deterministic; the baseline below.' },
    { judgement: 'Is a price or a figure shown?', instead: 'Regex for $ and digit-percent, in code.' },
    { judgement: 'Which artboard is best?', instead: 'Score each block separately, aggregate per artboard in code. No cross-item comparison.' },
    { judgement: 'Is v5 closer to the spec than v4?', instead: 'Diff each against the spec states, in code.' },
  ],
  recombine: 'Per artboard: mean p per boolean, register key counts, mean hype. Flag a headline when teamImplied >= 0.85 AND limitStated <= 0.15. Report per-question validity next to every aggregate.',
  status: 'drafted',
};

const BANNED = ['90-day','roadmap','scale ai across','ai-first','unlock','leverage','seamless','journey','ecosystem','stakeholder','roi','use case','adoption','change management','upskill','mindset','scalable','holistic','end-to-end','turnkey','future-proof','ai-powered','digital transformation','accelerate','revolutioni','supercharge','game-changer','uncharted','charting the course','playbook','framework','methodology','fractional','operating system','flywheel','north star','fortune 500','mckinsey','silver'];
const bannedHits = t => BANNED.filter(w => t.toLowerCase().includes(w));
const figure = t => /\$\s?\d|\d+\s?%|\b\d[\d,]{2,}\s?(people|clients|companies|teams|countries)/i.test(t);

const states = JSON.parse(await readFile(new URL('./states.json', import.meta.url), 'utf8'));
const names = Object.keys(DESIGN_POSITION.questions);
async function ask(state) {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, state: { headline: state.headline, text_under_headline: state.text_under_headline }, questions: DESIGN_POSITION.questions }) });
  const text = await res.text();
  if (!res.ok) throw new Error(`TypeSafe ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
async function pool(xs, n, f) { const out = new Array(xs.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { for (let i = next++; i < xs.length; i = next++) out[i] = await f(xs[i], i); })); return out; }

const t0 = performance.now(); let answeredBy = null; const rows = [];
await pool(states, 4, async (st, i) => {
  try { const r = await ask(st); answeredBy = r.model; process.stdout.write('.');
    rows.push({ i, source: st.source, level: st.level, headline: st.headline, banned: bannedHits(st.headline + ' ' + st.text_under_headline), figure: figure(st.headline + ' ' + st.text_under_headline), answers: r.answers }); }
  catch (e) { process.stdout.write('x'); console.error('\n', st.source, e.message); }
});
rows.sort((a, b) => a.i - b.i);
console.log(`\n${rows.length}/${states.length} states · ${Math.round(performance.now() - t0)}ms · answered by ${answeredBy}`);
await writeFile(new URL('./run.jsonl', import.meta.url), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
if (!rows.length) process.exit(1);

const T = { noInformationSpread: 0.08, endBand: 0.15, safeAtEnds: 0.5, moveToCodeAtEnds: 0.25, minObservations: 8 };
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length; const sd = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };
const verdict = (atEnds, spread, n) => n < T.minObservations ? 'INSUFFICIENT-DATA' : spread < T.noInformationSpread ? 'NO-INFORMATION' : atEnds < T.moveToCodeAtEnds ? 'MOVE-TO-CODE' : atEnds < T.safeAtEnds ? 'MARGINAL' : 'JEV-SAFE';
console.log('\nquestion        kind     at ends  spread            verdict');
for (const n of names) {
  const q = DESIGN_POSITION.questions[n]; const as = rows.map(r => r.answers[n]);
  if (q.type === 'noul') { const ps = as.map(a => a.noul); const atEnds = ps.filter(p => p >= 1 - T.endBand || p <= T.endBand).length / ps.length; const spread = sd(ps);
    console.log(`${n.padEnd(15)} boolean  ${String(Math.round(atEnds * 100) + '%').padEnd(8)} ${spread.toFixed(3).padEnd(17)} ${verdict(atEnds, spread, ps.length)}`); }
  else if (q.type === 'score') { const vs = as.map(a => a.score); const atEnds = vs.filter(v => Math.abs(v - Math.round(v)) < 0.15).length / vs.length; const spread = sd(vs) / 3;
    console.log(`${n.padEnd(15)} score    ${String(Math.round(atEnds * 100) + '%').padEnd(8)} ${spread.toFixed(3).padEnd(17)} ${verdict(atEnds, spread, vs.length)}`); }
  else { const keys = as.map(a => a.choice); const hs = as.map(a => { const pr = a.probabilities ?? {}; const vs = Object.values(pr).filter(v => v > 0); return vs.length > 1 ? -vs.reduce((acc, v) => acc + v * Math.log2(v), 0) / Math.log2(Object.keys(pr).length) : 0; });
    const distinct = new Set(keys).size, opts = Object.keys(q.criteria).length; const atEnds = hs.filter(h => h < 0.15).length / hs.length;
    const v = keys.length < T.minObservations ? 'INSUFFICIENT-DATA' : distinct <= 1 ? 'NO-INFORMATION' : atEnds < T.moveToCodeAtEnds ? 'MOVE-TO-CODE' : atEnds < T.safeAtEnds ? 'MARGINAL' : 'JEV-SAFE';
    console.log(`${n.padEnd(15)} choice   ${String(Math.round(atEnds * 100) + '%').padEnd(8)} ${(distinct + '/' + opts + ' keys').padEnd(17)} ${v}  (max H ${Math.max(...hs).toFixed(2)})`); }
}
console.log('\nsource            n  teamImp limit  reader staff  oneJob tools  hype  register                    banned / figures');
const bySrc = {}; for (const r of rows) (bySrc[r.source] ??= []).push(r);
for (const [src, rs] of Object.entries(bySrc)) {
  const m = n => mean(rs.map(r => r.answers[n].noul)).toFixed(2);
  const reg = {}; for (const r of rs) reg[r.answers.register.choice] = (reg[r.answers.register.choice] ?? 0) + 1;
  const banned = [...new Set(rs.flatMap(r => r.banned))]; const figs = rs.filter(r => r.figure).length;
  console.log(`${src.padEnd(17)} ${String(rs.length).padStart(2)} ${m('teamImplied').padEnd(7)} ${m('limitStated').padEnd(6)} ${m('readerFirst').padEnd(6)} ${m('staffImplied').padEnd(6)} ${m('oneJob').padEnd(6)} ${m('toolsOwned').padEnd(6)} ${mean(rs.map(r => r.answers.hype.score)).toFixed(2)}  ${Object.entries(reg).map(([k, v]) => k + ':' + v).join(' ').padEnd(27)} ${banned.join(',') || '-'} / ${figs} blocks with figures`);
}
console.log('\nBlocks failing the honesty test (teamImplied >= .85 and limitStated <= .15):');
for (const r of rows.filter(r => r.answers.teamImplied.noul >= 0.85 && r.answers.limitStated.noul <= 0.15)) console.log(`  [${r.source}/${r.level}] ${r.headline}`);
console.log('\nEvery block: teamImplied / limitStated / hype / register:');
for (const r of rows) console.log(`  ${r.answers.teamImplied.noul.toFixed(2)} ${r.answers.limitStated.noul.toFixed(2)} h${r.answers.hype.score} ${r.answers.register.choice.padEnd(11)} [${r.source}/${r.level}] ${r.headline.slice(0, 80)}`);
console.log('\nReminder: this measures whether the questions are answerable and what the copy reads as; accuracy needs labels.');
