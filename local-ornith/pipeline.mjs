/**
 * Staged routing pipeline with the Jev call made visible.
 *
 * Shows, per item: the STATE sent in, every question asked, the probability
 * distribution that came back, which code gates fired, and the recombination
 * that produced the verdict. Per ../../.claude/output-styles/jev-explanatory.md,
 * a bare verdict is not reportable - the questions ARE the program.
 *
 *   node --env-file-if-exists=/Users/manu/jev-playground/.env.local pipeline.mjs
 *   node ... pipeline.mjs --stage 3 --corpus corpus/artifacts.json
 *   node ... pipeline.mjs --no-color
 */
import { readFileSync } from 'node:fs';
import { experimental_evaluate as evaluate } from 'ai';
import { STAGE1_TRIAGE, STAGE2_CAPABILITY, STAGE3_ARTIFACT } from './questions.mjs';
import { route, entropy, grade } from './route.mjs';

const NO_COLOR = process.argv.includes('--no-color') || process.env.NO_COLOR;
const C = NO_COLOR
  ? new Proxy({}, { get: () => (s) => s })
  : {
      in:   (s) => `\x1b[36m${s}\x1b[0m`,   // cyan   - what we sent
      q:    (s) => `\x1b[33m${s}\x1b[0m`,   // yellow - the questions
      end:  (s) => `\x1b[32m${s}\x1b[0m`,   // green  - decisive, at an end
      mid:  (s) => `\x1b[31m${s}\x1b[0m`,   // red    - mid band, weak signal
      gate: (s) => `\x1b[35m${s}\x1b[0m`,   // magenta- code gate, no model involved
      dim:  (s) => `\x1b[2m${s}\x1b[0m`,
      bold: (s) => `\x1b[1m${s}\x1b[0m`,
    };

// ../leads/pipeline.ts: gate on the END a probability sits at, never on which
// side of 0.5 it falls. NETER P4 puts the noise floor at +/-0.11; these are 0.70 apart.
export const END_HI = 0.85;
export const END_LO = 0.15;

const atEnd = (p) => p >= END_HI || p <= END_LO;
const bar = (p, width = 20) => {
  const n = Math.round(p * width);
  return '█'.repeat(n) + C.dim('·'.repeat(width - n));
};

function showState(state) {
  console.log(C.bold('\n  INPUT') + C.dim('  (state sent to Jev)'));
  for (const [k, v] of Object.entries(state)) {
    const s = String(v).replace(/\s+/g, ' ');
    const shown = s.length > 160 ? s.slice(0, 160) + C.dim(` …+${s.length - 160} chars`) : s;
    console.log(`    ${C.dim(k + ':')} ${C.in(shown)}`);
  }
}

function showAnswers(questions, answers) {
  console.log(C.bold('  OUTPUT') + C.dim('  (probabilities returned)'));
  for (const [name, def] of Object.entries(questions)) {
    const a = answers[name];
    if (def.type === 'choice') {
      const probs = a.probabilities ?? {};
      const h = entropy(probs);
      console.log(`    ${C.q(name)} ${C.dim('[choice]')} -> ${C.bold(a.choice)} ` +
        `${C.dim(`entropy ${h.toFixed(2)}`)}`);
      for (const [k, p] of Object.entries(probs).sort((x, y) => y[1] - x[1])) {
        if (p < 0.005) continue;
        console.log(`        ${C.dim(k.padEnd(16))} ${bar(p)} ${(p >= 0.85 ? C.end : C.mid)(p.toFixed(3))}`);
      }
    } else if (def.type === 'boolean') {
      const p = a.probability;
      const tag = atEnd(p) ? C.end('at end') : C.mid('MID BAND - weak');
      console.log(`    ${C.q(name)} ${C.dim('[bool]')}   ${bar(p)} ` +
        `${(atEnd(p) ? C.end : C.mid)(`P(true)=${p.toFixed(3)}`)} ${tag}`);
    } else {
      const s = a.score;
      console.log(`    ${C.q(name)} ${C.dim('[score]')}  ${bar(s / 3)} ` +
        `${C.end(s.toFixed(2))}${C.dim(` / 3  (${def.criteria.length} rubric levels)`)}`);
    }
  }
}

const STAGES = { 1: STAGE1_TRIAGE, 2: STAGE2_CAPABILITY, 3: STAGE3_ARTIFACT };

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const stageNo = Number(arg('--stage', '1'));
const stage = STAGES[stageNo];
const corpusPath = arg('--corpus', 'corpus/routing-basic.json');
const { cases } = JSON.parse(readFileSync(new URL(corpusPath, import.meta.url)));
const LOCAL_CTX = Number(arg('--local-ctx', '65536'));

console.log(C.bold(`\n═══ STAGE ${stageNo}: ${stage.context}`));
console.log(C.dim(`    model typesafe-ai/jev · ${Object.keys(stage.questions).length} questions ` +
  `· ${cases.length} items · retries off · zeroDataRetention on`));
console.log(C.dim(`    ends: TRUE >= ${END_HI}, FALSE <= ${END_LO} (hand-set; noise floor ±0.11 per NETER P4)`));

let nLocal = 0, nCorrect = 0, tIn = 0;
const t0 = Date.now();

for (const c of cases) {
  const state = c.state ?? { request: c.text };
  console.log(C.dim('\n' + '─'.repeat(78)));
  console.log(C.bold(`  ${c.id}`) + (c.expect ? C.dim(`   expect: ${c.expect}`) : ''));
  showState(state);

  const { answers } = await evaluate({
    model: 'typesafe-ai/jev',
    state,
    questions: stage.questions,
    providerOptions: { gateway: { zeroDataRetention: true } },
  });
  showAnswers(stage.questions, answers);

  if (stageNo === 1) {
    const facts = { ...c.facts, localCtx: LOCAL_CTX, slotsFree: 3 };
    // Code gates are facts, not judgements - show them as a separate layer.
    const fired = [];
    if (facts.needsVision) fired.push('needsVision -> 9B (only local model with an mmproj)');
    if (facts.estTokens > facts.localCtx) fired.push(`estTokens ${facts.estTokens} > localCtx ${facts.localCtx}`);
    if (facts.needsWeb) fired.push('needsWeb -> local fleet has no search tool');
    console.log(C.bold('  CODE GATES') + C.dim('  (facts, computed - no model involved)'));
    console.log(fired.length
      ? fired.map((f) => `    ${C.gate('▸ ' + f)}`).join('\n')
      : `    ${C.dim('none fired')}`);

    const r = route(answers, facts);
    const ok = c.expect ? r.model === c.expect : null;
    if (ok) nCorrect++;
    if (r.model.startsWith('ornith')) nLocal++;
    console.log(C.bold('  RECOMBINE') + C.dim('  (hand-set thresholds, never fitted)'));
    for (const [k, v] of Object.entries(r.terms)) {
      console.log(`    ${C.dim(k.padEnd(16))} ${bar(v)} ${v.toFixed(3)}`);
    }
    console.log(`    ${C.dim('localFitness'.padEnd(16))} ${C.bold(String(r.score))}` +
      C.dim(`  threshold ${0.62}`));
    console.log(`  ${C.bold('VERDICT')}  ${C.bold(r.model)}  ${C.dim(r.reason)}` +
      (ok === false ? C.mid('   <-- MISS') : ''));
  } else if (stageNo === 3) {
    const g = grade(answers);
    const ok = c.expect ? g.verdict === c.expect : null;
    if (ok) nCorrect++;
    console.log(`  ${C.bold('VERDICT')}  ${C.bold(g.verdict)}  ${C.dim(g.reasons.join('; '))}` +
      (ok === false ? C.mid(`   <-- MISS (expected ${c.expect})`) : ''));
  } else {
    console.log(`  ${C.bold('VERDICT')}  ${C.dim(stage.recombine.split('.')[0])}`);
  }
}

const wall = (Date.now() - t0) / 1000;
console.log(C.dim('\n' + '═'.repeat(78)));
if (stageNo === 1 || stageNo === 3) {
  console.log(`  accuracy     ${C.bold(((nCorrect / cases.length) * 100).toFixed(0) + '%')} (${nCorrect}/${cases.length})`);
  if (stageNo === 1) console.log(`  local share  ${C.bold(((nLocal / cases.length) * 100).toFixed(0) + '%')} ${C.dim('measured on this corpus, NOT fitted')}`);
}
console.log(`  cost         ${cases.length} items × ${Object.keys(stage.questions).length} questions, ` +
  `${wall.toFixed(1)}s wall, ${((wall / cases.length) * 1000).toFixed(0)}ms/item`);
console.log(`  transport    ${C.dim('Vercel AI Gateway (LESSONS L9 — not comparable to direct-API figures)')}\n`);
