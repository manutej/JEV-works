/**
 * Run the golden set through Jev + the deterministic router.
 * Reports accuracy, per-question SPREAD (LESSONS L5) and confidence (L4),
 * and the achieved local share. Thresholds are hand-set and never fitted here.
 */
import { readFileSync } from 'node:fs';
import { experimental_evaluate as evaluate } from 'ai';
import { FLEET_ROUTING } from './bank.mjs';
import { route, entropy as entropyOf, LOCAL_AT, MAX_ENTROPY, HARD_AT } from './route.mjs';
import { JEV } from '../lib/jev.ts';

const LOCAL_CTX = 131072;
const { cases } = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url)));
const t0 = Date.now();

const results = [];
for (const c of cases) {
  const { answers } = await evaluate({
    model: JEV,
    state: { request: c.text },
    questions: FLEET_ROUTING.questions,
    providerOptions: { gateway: { zeroDataRetention: true } },
  });
  const r = route(answers, { ...c.facts, localCtx: LOCAL_CTX, slotsFree: 3 });
  results.push({ ...c, got: r.model, ok: r.model === c.expect, r, answers });
}
const wall = (Date.now() - t0) / 1000;

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('id',8)}${pad('expect',15)}${pad('got',15)}${pad('score',7)}${pad('H',6)}ok`);
console.log('-'.repeat(60));
for (const x of results) {
  console.log(`${pad(x.id,8)}${pad(x.expect,15)}${pad(x.got,15)}` +
    `${pad(x.r.score,7)}${pad(x.r.entropy,6)}${x.ok ? '' : '  <-- MISS'}`);
}

const acc = results.filter(r => r.ok).length / results.length;
const localShare = results.filter(r => r.got.startsWith('ornith')).length / results.length;

// L5: discrimination per question. Choice questions are judged on whether the
// SELECTED KEY varies, not on the top probability - the top probability is ~1.0
// on every item (Jev returns a one-hot here), which says nothing about spread.
console.log(`\n${pad('question',24)}${pad('type',8)}${pad('range / keys',34)}verdict`);
console.log('-'.repeat(78));
for (const [q, def] of Object.entries(FLEET_ROUTING.questions)) {
  if (def.type === 'choice') {
    const keys = results.map(r => r.answers[q].choice);
    const uniq = [...new Set(keys)];
    const hs = results.map(r => entropyOf(r.answers[q].probabilities));
    const maxH = Math.max(...hs);
    console.log(`${pad(q,24)}${pad('choice',8)}${pad(uniq.length + ' of ' + Object.keys(def.criteria).length + ' keys used',34)}` +
      `${uniq.length > 1 ? 'discriminates' : 'NO-INFORMATION'}; max entropy ${maxH.toFixed(2)}` +
      `${maxH < 0.05 ? ' -> entropy gate INERT' : ''}`);
  } else {
    const vals = results.map(r => {
      const a = r.answers[q];
      return a.probability ?? a.score / 3;
    });
    const min = Math.min(...vals), max = Math.max(...vals), spread = max - min;
    console.log(`${pad(q,24)}${pad(def.type,8)}${pad(min.toFixed(2) + ' - ' + max.toFixed(2),34)}` +
      `${spread < 0.08 ? 'NO-INFORMATION - cut or rewrite' : 'discriminates (spread ' + spread.toFixed(2) + ')'}`);
  }
}

console.log(`\naccuracy      ${(acc*100).toFixed(0)}%  (${results.filter(r=>r.ok).length}/${results.length})`);
console.log(`local share   ${(localShare*100).toFixed(0)}%  (measured on this set, NOT fitted)`);
console.log(`thresholds    LOCAL_AT=${LOCAL_AT} MAX_ENTROPY=${MAX_ENTROPY} HARD_AT=${HARD_AT}  [all hand-set]`);
console.log(`cost          ${cases.length} items x ${Object.keys(FLEET_ROUTING.questions).length} questions, ${wall.toFixed(1)}s wall, ${(wall/cases.length*1000).toFixed(0)}ms/item`);
console.log(`transport     Vercel AI Gateway (LESSONS L9: not comparable to direct-API figures)`);
