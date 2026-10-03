// Cache-aware sticky routing: per-token pins, failure reassignment, key rotation, and quota moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

// Sends one chat completion through the gateway and drains the response.
async function chat(baseUrl, raw, model = 'cached') {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }] }),
  });
  await response.text();
  return response.status;
}

test('cache-aware pins each token to one route and spreads tokens across routes', async (t) => {
  const upstreamA = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'A' }));
  const upstreamB = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'B' }));
  const app = await createTestApp();
  const providerA = app.addProvider('a', upstreamA.baseUrl);
  const providerB = app.addProvider('b', upstreamB.baseUrl);
  const model = app.app.registry.createModel({ name: 'cached', balanceStrategy: 'cache_aware' });
  const routeA = app.app.registry.createRoute({ modelId: model.id, providerId: providerA.id, upstreamModel: 'ua' });
  const routeB = app.app.registry.createRoute({ modelId: model.id, providerId: providerB.id, upstreamModel: 'ub' });
  const tokenOne = app.addToken('one', [model.id]);
  const tokenTwo = app.addToken('two', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstreamA.close();
    await upstreamB.close();
  });

  for (let i = 0; i < 3; i += 1) {
    assert.equal(await chat(app.baseUrl, tokenOne.raw), 200);
    assert.equal(await chat(app.baseUrl, tokenTwo.raw), 200);
  }
  assert.equal(upstreamA.state.requests.length, 3, 'token one stayed on route A');
  assert.equal(upstreamB.state.requests.length, 3, 'token two stayed on route B');
  assert.equal(app.app.gateway.pins.get(tokenOne.token.id, model.id).routeId, routeA.id);
  assert.equal(app.app.gateway.pins.get(tokenTwo.token.id, model.id).routeId, routeB.id);
});

test('cache-aware moves the pin on failure and never fails back', async (t) => {
  let routeAHealthy = false;
  const upstreamA = await startStubUpstream((req, res) =>
    (routeAHealthy ? jsonCompletion(res, { content: 'A' }) : jsonCompletion(res, { status: 500 })));
  const upstreamB = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'B' }));
  const app = await createTestApp();
  const providerA = app.addProvider('a', upstreamA.baseUrl);
  const providerB = app.addProvider('b', upstreamB.baseUrl);
  const model = app.app.registry.createModel({ name: 'cached', balanceStrategy: 'cache_aware' });
  const routeA = app.app.registry.createRoute({ modelId: model.id, providerId: providerA.id, upstreamModel: 'ua' });
  const routeB = app.app.registry.createRoute({ modelId: model.id, providerId: providerB.id, upstreamModel: 'ub' });
  const token = app.addToken('one', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstreamA.close();
    await upstreamB.close();
  });

  assert.equal(await chat(app.baseUrl, token.raw), 200, 'first request fails over');
  assert.equal(upstreamA.state.requests.length, 1);
  assert.equal(app.app.gateway.pins.get(token.token.id, model.id).routeId, routeB.id, 'pin moved to B');

  routeAHealthy = true;
  routeA.consecutiveFailures = 0;
  routeA.cooldownUntil = 0;
  await chat(app.baseUrl, token.raw);
  await chat(app.baseUrl, token.raw);
  assert.equal(upstreamA.state.requests.length, 1, 'no failback to the recovered route');
  assert.equal(upstreamB.state.requests.length, 3, 'replacement remains the main');
});

test('cache-aware rotates keys within the pinned route on key failure', async (t) => {
  const seenAuth = [];
  const upstream = await startStubUpstream((req, res) => {
    seenAuth.push(req.headers.authorization);
    if (req.headers.authorization === 'Bearer key-one') return jsonCompletion(res, { status: 401 });
    return jsonCompletion(res, { content: 'ok' });
  });
  const app = await createTestApp();
  const provider = app.app.registry.createProvider({ name: 'p', baseUrl: upstream.baseUrl });
  const keyOne = app.app.registry.addProviderKey(provider.id, { label: 'one', key: 'key-one' });
  const keyTwo = app.app.registry.addProviderKey(provider.id, { label: 'two', key: 'key-two' });
  const model = app.app.registry.createModel({ name: 'cached', balanceStrategy: 'cache_aware' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const token = app.addToken('one', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  assert.equal(await chat(app.baseUrl, token.raw), 200);
  assert.deepEqual(seenAuth, ['Bearer key-one', 'Bearer key-two'], '401 rotated to the second key');
  assert.equal(app.app.gateway.pins.get(token.token.id, model.id).keyId, keyTwo.id, 'pin holds the working key');

  assert.equal(await chat(app.baseUrl, token.raw), 200);
  assert.equal(seenAuth[2], 'Bearer key-two', 'subsequent traffic reuses the working key');
  assert.notEqual(keyOne.id, keyTwo.id);
});

test('cache-aware moves the pin when the pinned route hits its daily cap', async (t) => {
  const upstreamA = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'A' }));
  const upstreamB = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'B' }));
  const app = await createTestApp();
  const providerA = app.addProvider('a', upstreamA.baseUrl);
  const providerB = app.addProvider('b', upstreamB.baseUrl);
  const model = app.app.registry.createModel({ name: 'cached', balanceStrategy: 'cache_aware' });
  const routeA = app.app.registry.createRoute({ modelId: model.id, providerId: providerA.id, upstreamModel: 'ua', dailyQuota: 1 });
  const routeB = app.app.registry.createRoute({ modelId: model.id, providerId: providerB.id, upstreamModel: 'ub' });
  const token = app.addToken('one', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstreamA.close();
    await upstreamB.close();
  });

  assert.equal(await chat(app.baseUrl, token.raw), 200);
  assert.equal(app.app.gateway.pins.get(token.token.id, model.id).routeId, routeA.id);
  assert.equal(await chat(app.baseUrl, token.raw), 200, 'capped pin reassigned');
  assert.equal(upstreamA.state.requests.length, 1, 'capped route not used again');
  assert.equal(upstreamB.state.requests.length, 1, 'replacement served the request');
  assert.equal(app.app.gateway.pins.get(token.token.id, model.id).routeId, routeB.id, 'pin moved to B');
});
