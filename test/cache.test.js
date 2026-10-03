// Exact response cache and singleflight coalescing for temperature=0 requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

// Sends one deterministic chat completion and returns the response plus body text.
async function complete(baseUrl, raw, { temperature = 0, stream, model = 'cached' } = {}) {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], temperature, ...(stream ? { stream } : {}) }),
  });
  return { response, text: await response.text() };
}

test('response cache serves identical temperature=0 requests without upstream spend', async (t) => {
  const upstream = await startStubUpstream((req, res) =>
    jsonCompletion(res, { usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'cached' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u', inputCostPerM: 1, outputCostPerM: 2 });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const first = await complete(app.baseUrl, raw);
  assert.equal(first.response.status, 200);
  assert.equal(first.response.headers.get('x-cache'), 'miss');
  assert.equal(first.response.headers.get('x-smolorchestrator-provider'), 'stub');
  assert.ok(Number(first.response.headers.get('x-request-cost')) > 0, 'cost header on captured response');

  const second = await complete(app.baseUrl, raw);
  assert.equal(second.response.status, 200);
  assert.equal(second.response.headers.get('x-cache'), 'hit');
  assert.equal(second.text, first.text, 'cached body is identical');
  assert.equal(upstream.state.requests.length, 1, 'upstream called once');

  await app.flush();
  const stats = app.db.prepare('SELECT * FROM cache_stats').get();
  assert.equal(stats.hits, 1);
  assert.equal(stats.misses, 1);
  assert.ok(stats.saved_cost > 0, 'savings recorded');
});

test('singleflight coalesces concurrent identical requests', async (t) => {
  const upstream = await startStubUpstream(async (req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    jsonCompletion(res, { content: 'slow' });
  });
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'cached' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const [a, b] = await Promise.all([complete(app.baseUrl, raw), complete(app.baseUrl, raw)]);
  assert.equal(a.response.status, 200);
  assert.equal(b.response.status, 200);
  assert.equal(upstream.state.requests.length, 1, 'one upstream call for two concurrent requests');
  const statuses = [a.response.headers.get('x-cache'), b.response.headers.get('x-cache')].sort();
  assert.deepEqual(statuses, ['coalesced', 'miss']);
});

test('non-deterministic and streaming requests bypass the cache', async (t) => {
  const upstream = await startStubUpstream((req, res) =>
    jsonCompletion(res, { usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'cached' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await complete(app.baseUrl, raw, { temperature: 0.7 });
  await complete(app.baseUrl, raw, { temperature: 0.7 });
  assert.equal(upstream.state.requests.length, 2, 'temperature>0 is never cached');

  const streamed = await complete(app.baseUrl, raw, { stream: true, temperature: 0 });
  assert.equal(streamed.response.status, 200);
  assert.equal(upstream.state.requests.length, 3, 'streaming bypasses the exact response cache');
});
