/**
 * A deterministic stand-in for POST https://api.typesafe.ai/v1/systemone, installed as globalThis.fetch.
 * Load it before the code under test:  node --import ./kit/test/fake-typesafe.ts kit/run.ts spec.json
 * No network, no key, no cost. Answers are a crude, deterministic word-overlap model, so tests can
 * predict them. It is NOT a model of Jev's quality.
 *
 *   choice → the option whose key/description shares the most ≥4-letter words with the state; ties → the LAST option
 *   noul   → p 0.91 if the state contains any of the instruction's ≥5-letter words, else 0.08
 *   score  → level 1 (probabilities concentrated there)
 * Env controls:
 *   FAKE_TYPESAFE_FAIL=<substring>  → HTTP 500 for any request whose state contains it
 *   FAKE_TYPESAFE_TIE=1             → choice answers report the chosen option LOSING a 2dp-rounding tie
 *   FAKE_TYPESAFE_LOG=<path>        → append one JSON line per request: {auth, bodyHasKey, model, questionIds}
 */
import { appendFileSync } from 'node:fs';

const words = (s: string, min: number) => new Set((s.toLowerCase().match(/[a-z]+/g) ?? []).filter(w => w.length >= min));
const text = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''));

type Q = { type: 'noul' | 'choice' | 'score'; instructions: unknown; criteria?: unknown };

export function fakeAnswer(q: Q, state: unknown): Record<string, unknown> {
  const sw = words(text(state), 4);
  if (q.type === 'noul') {
    const hit = [...words(text(q.instructions), 5)].some(w => sw.has(w));
    return { type: 'noul', noul: hit ? 0.91 : 0.08 };
  }
  if (q.type === 'choice') {
    const opts = Object.entries(q.criteria as Record<string, unknown>);
    let best = opts[opts.length - 1][0], bestScore = 0;
    for (const [k, d] of opts) {
      const s = [...words(`${k} ${text(d)}`, 4)].filter(w => sw.has(w)).length;
      if (s > bestScore) { best = k; bestScore = s; }
    }
    const probabilities = Object.fromEntries(opts.map(([k]) => [k, k === best ? 0.94 : +(0.06 / (opts.length - 1)).toFixed(2)]));
    if (process.env.FAKE_TYPESAFE_TIE && opts.length >= 2) {
      const other = opts.find(([k]) => k !== best)![0];
      for (const k of Object.keys(probabilities)) probabilities[k] = 0;
      probabilities[best] = 0.49; probabilities[other] = 0.51;   // the API's choice loses after rounding
    }
    return { type: 'choice', choice: best, confidence: 0.9, probabilities };
  }
  const n = (q.criteria as unknown[]).length;
  const probabilities = Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), i === 1 ? 1 : 0]));
  return { type: 'score', score: 1, confidence: 1, legend: {}, probabilities };
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://api.typesafe.ai/')) return realFetch(input, init);
  const body = JSON.parse(String(init?.body ?? '{}')) as { model: string; state: unknown; questions: Record<string, Q> };
  const headers = new Headers(init?.headers);
  if (process.env.FAKE_TYPESAFE_LOG) {
    appendFileSync(process.env.FAKE_TYPESAFE_LOG, JSON.stringify({
      auth: headers.get('authorization')?.startsWith('Bearer ') ?? false,
      bodyHasKey: !!process.env.TYPESAFE_API_KEY && String(init?.body).includes(process.env.TYPESAFE_API_KEY),
      model: body.model, questionIds: Object.keys(body.questions),
      types: Object.fromEntries(Object.entries(body.questions).map(([k, q]) => [k, q.type])),
    }) + '\n');
  }
  if (!headers.get('authorization')) return new Response('{"error":"unauthorized"}', { status: 401 });
  const fail = process.env.FAKE_TYPESAFE_FAIL;
  if (fail && text(body.state).includes(fail)) return new Response('{"error":"injected failure"}', { status: 500 });
  const answers = Object.fromEntries(Object.entries(body.questions).map(([id, q]) => [id, fakeAnswer(q, body.state)]));
  return new Response(JSON.stringify({ model: body.model === 'jev-latest' ? 'jev-1.13.0' : body.model, answers, usage: { input_tokens: 100, output_tokens: 10 } }),
    { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;
