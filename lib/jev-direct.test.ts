// Adversarial cases for the 2dp-rounding choice tie (reported by the leads session, 2026-09-21). Run: node lib/jev-direct.test.ts
import { jevDirect } from './jev-direct.ts';
const cases: [string, Record<string, number>, string][] = [
  ['a', { a: 0.5, b: 0.5 }, 'a'],          // tie: keep API choice
  ['a', { a: 0.49, b: 0.51 }, 'b'],        // lost after rounding: take argmax
  ['a', { a: 0.9, b: 0.1 }, 'a'],          // normal
];
let ok = 0;
for (const [choice, probabilities, want] of cases) {
  globalThis.fetch = (async () => new Response(JSON.stringify({ model: 'jev-1.13.0', answers: { q: { type: 'choice', choice, probabilities } } }))) as typeof fetch;
  const r = await jevDirect('jev-1.13.0', 'test-key').doEvaluate({ state: 's', questions: { q: { type: 'choice', instructions: 'i', criteria: { a: null, b: null } } } });
  const got = (r.answers.q as { choice: string }).choice;
  const pass = got === want && (got === choice ? r.warnings.length === 0 : r.warnings.length === 1);
  console.log(pass ? 'PASS' : 'FAIL', choice, JSON.stringify(probabilities), '->', got, `warnings=${r.warnings.length}`); ok += +pass;
}
process.exit(ok === cases.length ? 0 : 1);
