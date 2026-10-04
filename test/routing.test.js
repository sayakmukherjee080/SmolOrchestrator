// Routing behavior: round-robin balancing, least-used, and failover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, waitFor } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

// Sends one chat completion through the gateway.
async function chat(baseUrl, raw, model = 'multi') {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }] }),
  });
  const text = await response.text();
  return { status: response.status, text };
}

test('round robin alternates across same-tier routes', async (t) => {
  const upstreamA = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'A' }));
  const upstreamB = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'B' }));
  const app = await createTestApp();
  const providerA = app.addProvider('a', upstreamA.baseUrl);
  const providerB = app.addProvider('b', upstreamB.baseUrl);
  const model = app.app.registry.createModel({ name: 'multi' });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerA.id, upstreamModel: 'ua' });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerB.id, upstreamModel: 'ub' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstreamA.close();
    await upstreamB.close();
  });

  for (let i = 0; i < 4; i += 1) await chat(app.baseUrl, raw);
  const countA = upstreamA.state.requests.length;
  const countB = upstreamB.state.requests.length;
  assert.equal(countA, 2, 'provider A handled two requests');
  assert.equal(countB, 2, 'provider B handled two requests');
});

test('least used picks the route with fewer requests', async (t) => {
  const upstreamA = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'A' }));
  const upstreamB = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'B' }));
  const app = await createTestApp();
  const providerA = app.addProvider('a', upstreamA.baseUrl);
  const providerB = app.addProvider('b', upstreamB.baseUrl);
  const model = app.app.registry.createModel({ name: 'multi', balanceStrategy: 'least_used' });
  const routeA = app.app.registry.createRoute({ modelId: model.id, providerId: providerA.id, upstreamModel: 'ua' });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerB.id, upstreamModel: 'ub' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstreamA.close();
    await upstreamB.close();
  });

  app.app.registry.routeCounters.set(routeA.id, { window: Math.floor(Date.now() / 86400000) * 86400000, count: 5 });
  await chat(app.baseUrl, raw);
  assert.equal(upstreamA.state.requests.length, 0, 'used route avoided');
  assert.equal(upstreamB.state.requests.length, 1, 'least-used route selected');
});

test('failing route is cooled down and skipped on later requests', async (t) => {
  const failing = await startStubUpstream((req, res) => jsonCompletion(res, { status: 500 }));
  const healthy = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'ok' }));
  const app = await createTestApp();
  const providerA = app.addProvider('flaky', failing.baseUrl);
  const providerB = app.addProvider('stable', healthy.baseUrl);
  const model = app.app.registry.createModel({ name: 'multi' });
  const routeA = app.app.registry.createRoute({ modelId: model.id, providerId: providerA.id, upstreamModel: 'ua' });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerB.id, upstreamModel: 'ub' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await failing.close();
    await healthy.close();
  });

  const first = await chat(app.baseUrl, raw);
  assert.equal(first.status, 200, 'failover produced a success');
  await waitFor(() => routeA.consecutiveFailures === 1);
  assert.ok(routeA.cooldownUntil > Date.now(), 'route A cooling down');

  const before = failing.state.requests.length;
  const second = await chat(app.baseUrl, raw);
  assert.equal(second.status, 200);
  assert.equal(failing.state.requests.length, before, 'cooling route was skipped');
});

test('key failures per route are capped before moving on', async (t) => {
  const seenAuth = [];
  const failing = await startStubUpstream((req, res) => {
    seenAuth.push(req.headers.authorization);
    jsonCompletion(res, { status: 401 });
  });
  const healthy = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'ok' }));
  const app = await createTestApp();
  const providerA = app.app.registry.createProvider({ name: 'dead', baseUrl: failing.baseUrl });
  for (const key of ['k1', 'k2', 'k3', 'k4']) {
    app.app.registry.addProviderKey(providerA.id, { label: key, key });
  }
  const providerB = app.addProvider('stable', healthy.baseUrl);
  const model = app.app.registry.createModel({ name: 'capped-keys', balanceStrategy: 'cache_aware' });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerA.id, upstreamModel: 'ua' });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerB.id, upstreamModel: 'ub' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await failing.close();
    await healthy.close();
  });

  const result = await chat(app.baseUrl, raw, 'capped-keys');
  assert.equal(result.status, 200, 'request survived a dead key pool');
  assert.equal(failing.state.requests.length, 2, 'key retries capped per route');
  assert.equal(healthy.state.requests.length, 1);
  assert.equal(seenAuth.length, 2);
});

test('all routes exhausted returns 502', async (t) => {
  const failing = await startStubUpstream((req, res) => jsonCompletion(res, { status: 503 }));
  const app = await createTestApp();
  const provider = app.addProvider('down', failing.baseUrl);
  const model = app.app.registry.createModel({ name: 'lonely' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await failing.close();
  });

  const result = await chat(app.baseUrl, raw, 'lonely');
  assert.equal(result.status, 502);
  assert.equal(JSON.parse(result.text).error.code, 'all_providers_failed');
});
