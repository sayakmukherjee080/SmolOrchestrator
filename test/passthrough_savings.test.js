// Generic /v1/* passthrough and provider cached-token savings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.js';
import { startStubUpstream, jsonCompletion } from './helpers/upstream.js';

test('generic JSON endpoints route through the same pipeline', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res, { content: 'completion' }));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'legacy' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const response = await fetch(`${app.baseUrl}/v1/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'legacy', prompt: 'hello' }),
  });
  assert.equal(response.status, 200);
  await response.text();
  assert.equal(upstream.state.requests[0].url, '/v1/completions', 'sub-path preserved upstream');
});

test('provider cached tokens are recorded with estimated savings', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res, {
    usage: {
      prompt_tokens: 100,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 60 },
    },
  }));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'cached-tokens' });
  app.app.registry.createRoute({
    modelId: model.id, providerId: provider.id, upstreamModel: 'u',
    inputCostPerM: 1, outputCostPerM: 2,
  });
  const { raw } = app.addToken('client', [model.id]);
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'cached-tokens', messages: [] }),
  });
  await app.flush();
  const row = app.db.prepare('SELECT * FROM telemetry ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.cached_tokens, 60);
  const expectedCost = (40 * 1 + 60 * 0.1 + 10 * 2) / 1000000;
  assert.ok(Math.abs(row.est_cost - expectedCost) < 1e-12, 'discounted input cost applied');
  const expectedSaved = (60 * 0.9) / 1000000;
  assert.ok(Math.abs(row.saved_cost - expectedSaved) < 1e-12, 'savings recorded');
  const usage = app.db.prepare("SELECT * FROM usage WHERE entity = 'model'").get();
  assert.equal(usage.cached_tokens, 60);
});

test('soft budget warnings surface as client headers', async (t) => {
  const upstream = await startStubUpstream((req, res) => jsonCompletion(res));
  const app = await createTestApp();
  const provider = app.addProvider('stub', upstream.baseUrl);
  const model = app.app.registry.createModel({ name: 'budgeted' });
  app.app.registry.createRoute({ modelId: model.id, providerId: provider.id, upstreamModel: 'u' });
  const { token, raw } = app.app.registry.createToken({ label: 'warn', dailyRequestLimit: 10 });
  app.app.registry.setTokenModels(token.id, [model.id]);
  app.app.registry.incrementTokenUsage(token.id, 0, Date.now());
  app.app.registry.incrementTokenUsage(token.id, 0, Date.now());
  app.app.registry.incrementTokenUsage(token.id, 0, Date.now());
  app.app.registry.incrementTokenUsage(token.id, 0, Date.now());
  app.app.registry.incrementTokenUsage(token.id, 0, Date.now());
  app.app.registry.incrementTokenUsage(token.id, 0, Date.now());
  app.app.registry.incrementTokenUsage(token.id, 0, Date.now());
  app.app.registry.incrementTokenUsage(token.id, 0, Date.now());
  await t.after(async () => {
    await app.close();
    await upstream.close();
  });

  const response = await fetch(`${app.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${raw}` },
    body: JSON.stringify({ model: 'budgeted', messages: [] }),
  });
  await response.text();
  assert.equal(response.headers.get('x-budget-warning'), 'daily_requests');
  assert.match(response.headers.get('x-budget-remaining'), /daily_requests=2/);
});
