// Optional per-route daily caps and failover when a cap is reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

// Sends one chat completion through the gateway.
async function chat(baseUrl, raw) {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'capped', messages: [] }),
  });
  await response.text();
  return response.status;
}

test('daily quota cap is enforced per route', async (t) => {
  const upstreamA = await startStubUpstream((req, res) => jsonCompletion(res));
  const upstreamB = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const providerA = app.addProvider('a', upstreamA.baseUrl);
  const providerB = app.addProvider('b', upstreamB.baseUrl);
  const model = app.app.registry.createModel({ name: 'capped' });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerA.id, upstreamModel: 'ua', dailyQuota: 1 });
  app.app.registry.createRoute({ modelId: model.id, providerId: providerB.id, upstreamModel: 'ub' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstreamA.close();
    await upstreamB.close();
  });

  assert.equal(await chat(app.baseUrl, raw), 200);
  assert.equal(upstreamA.state.requests.length, 1);

  assert.equal(await chat(app.baseUrl, raw), 200);
  assert.equal(upstreamA.state.requests.length, 1, 'capped route skipped');
  assert.equal(upstreamB.state.requests.length, 1, 'failover to uncapped route');
});

test('capped route alone yields 502', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('solo', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'capped' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u', dailyQuota: 1 });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  assert.equal(await chat(app.baseUrl, raw), 200);
  assert.equal(await chat(app.baseUrl, raw), 502);
});
