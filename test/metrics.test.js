// Prometheus metrics endpoint: counters, gauges, and token protection.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

// Seeds a provider/model/route and returns a scoped token.
function seed(app, upstreamBase) {
  const provider = app.addProvider('stub', upstreamBase);
  const model = app.app.registry.createModel({ name: 'metered' });
  app.app.registry.createRoute({
    modelId: model.id, providerId: provider.id, upstreamModel: 'u',
    inputCostPerM: 1, outputCostPerM: 2,
  });
  const { raw } = app.addToken('client', [model.id]);
  return raw;
}

test('metrics endpoint exposes counters and route health', async (t) => {
  const upstream = await startStubUpstream((req, res) =>
    jsonCompletion(res, { usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  const app = await createTestApp();
  const raw = seed(app, upstream.baseUrl);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'metered', messages: [] }),
  });

  const response = await fetch(`${app.baseUrl}/metrics`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/plain/);
  const text = await response.text();
  assert.match(text, /smolorchestrator_up 1/);
  assert.match(text, /smolorchestrator_requests_total\{model="metered",provider="stub",outcome="success"\} 1/);
  assert.match(text, /smolorchestrator_tokens_total\{model="metered",direction="input"\} 10/);
  assert.match(text, /smolorchestrator_tokens_total\{model="metered",direction="output"\} 5/);
  assert.match(text, /smolorchestrator_estimated_cost_usd_total\{model="metered"\} 0.00002/);
  assert.match(text, /smolorchestrator_route_healthy\{model="metered",provider="stub"\} 1/);
});

test('metrics endpoint honours METRICS_TOKEN when configured', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp({ env: { METRICS_TOKEN: 'sekret' } });
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const unauthorized = await fetch(`${app.baseUrl}/metrics`);
  assert.equal(unauthorized.status, 401);
  const authorized = await fetch(`${app.baseUrl}/metrics`, {
    headers: { authorization: 'Bearer sekret' },
  });
  assert.equal(authorized.status, 200);
});
