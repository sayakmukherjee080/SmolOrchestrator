// Exact response cache and singleflight coalescing for temperature=0 requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, adminLogin } from './helpers/app.js';
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

  const warm = await complete(app.baseUrl, raw, { temperature: 0.7 });
  assert.equal(warm.response.headers.get('x-cache'), 'bypass');
  await complete(app.baseUrl, raw, { temperature: 0.7 });
  assert.equal(upstream.state.requests.length, 2, 'temperature>0 is never cached');

  const streamed = await complete(app.baseUrl, raw, { stream: true, temperature: 0 });
  assert.equal(streamed.response.status, 200);
  assert.equal(streamed.response.headers.get('x-cache'), 'bypass');
  assert.equal(upstream.state.requests.length, 3, 'streaming bypasses the exact response cache');
});

test('cache hits count against token request budgets', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'metered-cache' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { token, raw } = app.app.registry.createToken({ label: 'limited', dailyRequestLimit: 3 });
  app.app.registry.setTokenModels(token.id, [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  assert.equal((await complete(app.baseUrl, raw, { model: 'metered-cache' })).response.status, 200);
  const hit = await complete(app.baseUrl, raw, { model: 'metered-cache' });
  assert.equal(hit.response.status, 200);
  assert.equal(hit.response.headers.get('x-cache'), 'hit');
  assert.equal((await complete(app.baseUrl, raw, { model: 'metered-cache' })).response.status, 200);
  const blocked = await complete(app.baseUrl, raw, { model: 'metered-cache' });
  assert.equal(blocked.response.status, 429, 'hits consume request budget');
  assert.equal(upstream.state.requests.length, 1, 'upstream was called once');
});

test('cache respects the total byte cap', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'x'.repeat(700) }));
  const app = await createTestApp({ env: { RESPONSE_CACHE_MAX_TOTAL_BYTES: '1024' } });
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'capped' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  // Varies the payload so each request is a distinct cache key.
  async function ask(content) {
    const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
      body: JSON.stringify({ model: 'capped', messages: [{ role: 'user', content }], temperature: 0 }),
    });
    await response.text();
    return response.headers.get('x-cache');
  }

  assert.equal(await ask('one'), 'miss');
  assert.equal(await ask('two'), 'miss');
  assert.equal(await ask('one'), 'miss', 'oldest entry evicted by byte cap');
  assert.equal(upstream.state.requests.length, 3);
  assert.ok(app.app.gateway.responseCache.size <= 1);
});

test('model edits invalidate cached responses and flush clears the cache', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'invalidated' });
  const route = app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  const session = await adminLogin(app.baseUrl);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await complete(app.baseUrl, raw, { model: 'invalidated' });
  assert.equal((await complete(app.baseUrl, raw, { model: 'invalidated' })).response.headers.get('x-cache'), 'hit');

  const patched = await fetch(`${app.baseUrl}/api/v1/routes/${route.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: session.cookie, 'x-csrf-token': session.csrf },
    body: JSON.stringify({ priority: 2 }),
  });
  assert.equal(patched.status, 200);
  assert.equal((await complete(app.baseUrl, raw, { model: 'invalidated' })).response.headers.get('x-cache'), 'miss', 'route edit invalidated the cache');

  assert.equal((await complete(app.baseUrl, raw, { model: 'invalidated' })).response.headers.get('x-cache'), 'hit');
  const flushed = await fetch(`${app.baseUrl}/api/v1/cache/flush`, {
    method: 'POST',
    headers: { cookie: session.cookie, 'x-csrf-token': session.csrf },
  });
  assert.equal(flushed.status, 200);
  assert.equal((await flushed.json()).data.cleared, 1);
  assert.equal((await complete(app.baseUrl, raw, { model: 'invalidated' })).response.headers.get('x-cache'), 'miss');
});

test('deeply nested payloads do not break cache keying', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'deep' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  let nested = { leaf: true };
  for (let i = 0; i < 200; i += 1) nested = { child: nested };
  const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'deep', messages: [{ role: 'user', content: nested }] }),
  });
  assert.equal(response.status, 200);
  await response.text();
});
