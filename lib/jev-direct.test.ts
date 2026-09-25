// lib/jev-direct.ts: the TypeSafe wire adapter. No network: fetch is stubbed per test. Run: node --test lib/jev-direct.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jevDirect } from './jev-direct.ts';

type Sent = { url: string; headers: Headers; body: Record<string, unknown> };
function stub(response: unknown, status = 200): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response(typeof response === 'string' ? response : JSON.stringify(response), { status });
  }) as typeof fetch;
  return sent;
}
const choiceQ = { q: { type: 'choice' as const, instructions: 'i', criteria: { a: null, b: null } } };

test('request: POST /v1/systemone, Bearer auth, pinned model, SDK boolean sent as noul, key not in body', async () => {
  const sent = stub({ model: 'jev-1.13.0', answers: { u: { type: 'noul', noul: 0.8 } } });
  await jevDirect('jev-1.13.0', 'secret-key-123').doEvaluate({ state: { m: 'x' }, questions: { u: { type: 'boolean', instructions: 'i' } } });
  assert.equal(sent[0].url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(sent[0].headers.get('authorization'), 'Bearer secret-key-123');
  assert.equal(sent[0].body.model, 'jev-1.13.0');
  assert.equal((sent[0].body.questions as Record<string, { type: string }>).u.type, 'noul');
  assert.ok(!JSON.stringify(sent[0].body).includes('secret-key-123'));
});

test('default model is the contract pin; another id only when passed explicitly (drift measurement)', async () => {
  const sent = stub({ model: 'jev-1.13.0', answers: { u: { type: 'noul', noul: 0.8 } } });
  assert.equal(jevDirect(undefined, 'k').modelId, 'jev-1.13.0');
  await jevDirect(undefined, 'k').doEvaluate({ state: 's', questions: { u: { type: 'boolean', instructions: 'i' } } });
  assert.equal(sent[0].body.model, 'jev-1.13.0');
  assert.equal(jevDirect('jev-latest', 'k').modelId, 'jev-latest');
});

test('response: noul → probability; score passes through; confidence kept in providerMetadata; usage mapped', async () => {
  stub({
    model: 'jev-1.13.0',
    answers: {
      u: { type: 'noul', noul: 0.36 },
      s: { type: 'score', score: 1.02, confidence: 0.82, legend: {}, probabilities: { 0: 0.05, 1: 0.88, 2: 0.07 } },
      c: { type: 'choice', choice: 'a', confidence: 0.93, probabilities: { a: 0.97, b: 0.03 } },
    },
    usage: { input_tokens: 385, output_tokens: 61 },
  });
  const r = await jevDirect('jev-1.13.0', 'k').doEvaluate({
    state: 's',
    questions: { u: { type: 'boolean', instructions: 'i' }, s: { type: 'score', instructions: 'i', criteria: ['x', 'y', 'z'] }, ...choiceQ, c: choiceQ.q },
  });
  assert.deepEqual(r.answers.u, { type: 'boolean', probability: 0.36 });
  assert.equal((r.answers.s as { score: number }).score, 1.02);
  assert.deepEqual((r.providerMetadata as { typesafe: { confidence: Record<string, number> } }).typesafe.confidence, { s: 0.82, c: 0.93 });
  assert.deepEqual(r.usage, { inputTokens: 385, outputTokens: 61 });
  assert.equal(r.response?.modelId, 'jev-1.13.0');
  assert.deepEqual(r.rounding, { probabilityDecimals: 2, scoreDecimals: 2 });
});

test('choice rounding: tie keeps the API choice; a lost tie takes the argmax AND warns; normal is silent', async () => {
  for (const [probs, want, warns] of [[{ a: 0.5, b: 0.5 }, 'a', 0], [{ a: 0.49, b: 0.51 }, 'b', 1], [{ a: 0.9, b: 0.1 }, 'a', 0]] as const) {
    stub({ model: 'jev-1.13.0', answers: { q: { type: 'choice', choice: 'a', probabilities: probs } } });
    const r = await jevDirect('jev-1.13.0', 'k').doEvaluate({ state: 's', questions: choiceQ });
    assert.equal((r.answers.q as { choice: string }).choice, want, JSON.stringify(probs));
    assert.equal(r.warnings.length, warns);
  }
});

test('HTTP error surfaces status and body, never the key', async () => {
  stub('{"error":"bad request: unknown question type boolean"}', 400);
  await assert.rejects(
    async () => { await jevDirect('jev-1.13.0', 'secret-key-123').doEvaluate({ state: 's', questions: choiceQ }); },
    (e: Error) => /TypeSafe 400/.test(e.message) && /unknown question type/.test(e.message) && !e.message.includes('secret-key-123'),
  );
});

test('missing key fails fast with a pointer, before any request', async () => {
  const sent = stub({});
  await assert.rejects(async () => { await jevDirect('jev-1.13.0', '').doEvaluate({ state: 's', questions: choiceQ }); }, /TYPESAFE_API_KEY is not set/);
  assert.equal(sent.length, 0);
});

test('abort signal is passed through to fetch', async () => {
  let seen: AbortSignal | undefined;
  globalThis.fetch = (async (_u: string, init: RequestInit) => { seen = init.signal ?? undefined; return new Response('{"model":"m","answers":{}}'); }) as typeof fetch;
  const ac = new AbortController();
  await jevDirect('jev-1.13.0', 'k').doEvaluate({ state: 's', questions: {}, abortSignal: ac.signal });
  assert.equal(seen, ac.signal);
});
