// lib/jev.ts: backend selection. Each case imports the module in a fresh process with a controlled environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function select(env: Record<string, string | undefined>) {
  const clean = { ...process.env };
  delete clean.TYPESAFE_API_KEY; delete clean.JEV_BACKEND; delete clean.JEV_MODEL;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) clean[k] = v;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    "const m = await import('./lib/jev.ts'); console.log(JSON.stringify({ b: m.JEV_BACKEND, id: m.JEV_ID, price: m.JEV_PRICE_ID, direct: typeof m.JEV !== 'string', modelId: typeof m.JEV === 'string' ? m.JEV : m.JEV.modelId }))"],
    { cwd: new URL('..', import.meta.url).pathname, env: clean, encoding: 'utf8' });
  if (r.status !== 0) return { error: r.stderr };
  return JSON.parse(r.stdout.trim());
}

test('key present → direct, pinned jev-1.13.0 by default', () => {
  const s = select({ TYPESAFE_API_KEY: 'k' });
  assert.equal(s.b, 'direct'); assert.equal(s.direct, true); assert.equal(s.modelId, 'jev-1.13.0');
  assert.equal(s.id, 'jev-1.13.0 (direct)');
});

test('no key → gateway, typesafe-ai/jev', () => {
  const s = select({});
  assert.equal(s.b, 'gateway'); assert.equal(s.direct, false); assert.equal(s.modelId, 'typesafe-ai/jev');
});

test('JEV_BACKEND forces the backend even when a key is present', () => {
  assert.equal(select({ TYPESAFE_API_KEY: 'k', JEV_BACKEND: 'gateway' }).b, 'gateway');
});

test('JEV_MODEL overrides the id (e.g. jev-latest to measure drift); pricing key never changes', () => {
  const s = select({ TYPESAFE_API_KEY: 'k', JEV_MODEL: 'jev-latest' });
  assert.equal(s.modelId, 'jev-latest'); assert.equal(s.id, 'jev-latest (direct)'); assert.equal(s.price, 'typesafe-ai/jev');
});

test('an unknown JEV_BACKEND is refused at import, not silently defaulted', () => {
  const s = select({ JEV_BACKEND: 'openai' });
  assert.match(s.error, /JEV_BACKEND must be direct\|gateway/);
});
